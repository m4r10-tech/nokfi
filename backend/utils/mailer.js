/**
 * utils/mailer.js
 *
 * Envío de emails transaccionales vía Resend (único proveedor).
 *
 * Emails que envía el sistema (ver secciones 3, 5, 15 del proyecto):
 *   - sendLicenseKeyEmail        → respaldo de la clave tras el pago
 *   - sendPasswordResetEmail     → enlace de un solo uso para restablecer la contraseña
 *   - sendLicenseRevokedEmail    → aviso de revocación (chargeback / abuso)
 *   - sendRecoveryOtpEmail       → código OTP de 6 dígitos para recuperar el acceso
 *   - sendRecoveredKeysEmail     → reenvío de las claves tras verificar el OTP
 *   - sendPasswordResetLimitEmail→ aviso de límite anual de reset (sin oráculo HTTP, #6)
 *
 * Diseño: cada función arma el HTML del email y delega el envío real a
 * `dispatch()`, que es el único punto que habla con la API externa.
 * Así, cambiar de proveedor en el futuro solo toca un sitio.
 */

'use strict';

const APP_URL = process.env.APP_PUBLIC_URL || 'https://nokfi.app';
const FROM_EMAIL = process.env.EMAIL_FROM || 'no-reply@nokfi.app';
const FROM_NAME = process.env.EMAIL_FROM_NAME || 'Nokfi';

/* ════════════════════════════════════════════════════════════
   DISPATCH — único punto de contacto con la API externa (Resend)
════════════════════════════════════════════════════════════ */

async function dispatch({ to, subject, html }) {
  if (!process.env.RESEND_API_KEY) {
    // En desarrollo sin clave configurada, no rompemos el flujo: solo avisamos.
    console.warn(`[MAILER] Sin RESEND_API_KEY — email NO enviado a ${to}. Asunto: "${subject}"`);
    return { skipped: true };
  }
  return dispatchViaResend({ to, subject, html });
}

async function dispatchViaResend({ to, subject, html }) {
  // Timeout 15s: el envío es fire-and-forget (los callers ya capturan el fallo),
  // pero sin límite un Resend colgado retendría el socket para siempre.
  const { fetchWithTimeout } = require('./http');
  const res = await fetchWithTimeout('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: `${FROM_NAME} <${FROM_EMAIL}>`,
      to: [to],
      subject,
      html
    })
  }, 15000);

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Resend respondió ${res.status}: ${body}`);
  }
  return { sent: true, provider: 'resend' };
}

/* ════════════════════════════════════════════════════════════
   PLANTILLA BASE — envoltorio HTML común, minimalista
════════════════════════════════════════════════════════════ */

function baseTemplate({ title, bodyHtml }) {
  return `
  <!DOCTYPE html>
  <html lang="es">
  <head><meta charset="UTF-8"><title>${escapeHtml(title)}</title></head>
  <body style="margin:0;padding:0;background:#0F0F0F;font-family:-apple-system,Segoe UI,Roboto,sans-serif;">
    <div style="max-width:480px;margin:0 auto;padding:40px 24px;">
      <div style="font-size:20px;font-weight:600;color:#10B981;margin-bottom:24px;">Nokfi</div>
      <div style="background:#1A1A1A;border-radius:12px;padding:32px;color:#F5F5F5;">
        ${bodyHtml}
      </div>
      <div style="text-align:center;color:#6b6b67;font-size:12px;margin-top:24px;">
        Nokfi · Este es un email automático, por favor no respondas directamente.
      </div>
    </div>
  </body>
  </html>`;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/* ════════════════════════════════════════════════════════════
   EMAILS CONCRETOS
════════════════════════════════════════════════════════════ */

/** Respaldo de la clave de licencia tras un pago confirmado (sección 3 del proyecto) */
async function sendLicenseKeyEmail({ to, licenseKey, plan }) {
  const html = baseTemplate({
    title: 'Tu clave de Nokfi',
    bodyHtml: `
      <h2 style="margin-top:0;color:#F5F5F5;">¡Gracias por tu compra!</h2>
      <p style="color:#c9c9c5;line-height:1.6;">
        Aquí tienes tu clave de licencia Nokfi (plan ${escapeHtml(plan)}). Guárdala en un lugar seguro:
      </p>
      <div style="background:#0F0F0F;border:1px solid #2A2A28;border-radius:8px;padding:16px;text-align:center;
                  font-family:monospace;font-size:18px;letter-spacing:2px;color:#10B981;margin:20px 0;">
        ${escapeHtml(licenseKey)}
      </div>
      <p style="color:#c9c9c5;line-height:1.6;">
        Actívala en <a href="${APP_URL}" style="color:#10B981;">${APP_URL}</a> usando este email, la clave de arriba
        y una contraseña que elijas tú.
      </p>
      <p style="color:#6b6b67;font-size:13px;line-height:1.6;">
        Guarda bien la contraseña: la necesitarás para iniciar sesión y para ver tu clave dentro de la app.
      </p>
    `
  });
  return dispatch({ to, subject: 'Tu clave de licencia Nokfi', html });
}

/** Enlace de un solo uso para restablecer la contraseña olvidada */
async function sendPasswordResetEmail({ to, token, expires_at }) {
  const resetUrl = `${APP_URL}/reset-password?token=${encodeURIComponent(token)}`;
  const html = baseTemplate({
    title: 'Restablece tu contraseña en Nokfi',
    bodyHtml: `
      <h2 style="margin-top:0;color:#F5F5F5;">Restablecimiento de contraseña</h2>
      <p style="color:#c9c9c5;line-height:1.6;">
        Hemos recibido una solicitud para restablecer la contraseña de tu licencia Nokfi.
        Si has sido tú, elige una nueva contraseña con el siguiente enlace:
      </p>
      <div style="text-align:center;margin:24px 0;">
        <a href="${resetUrl}" style="background:#10B981;color:#0F0F0F;padding:12px 24px;border-radius:8px;
                  text-decoration:none;font-weight:600;display:inline-block;">
          Restablecer contraseña
        </a>
      </div>
      <p style="color:#6b6b67;font-size:13px;line-height:1.6;">
        Este enlace caduca el ${escapeHtml(new Date(expires_at).toLocaleString('es-ES'))} y solo puede usarse una vez.
        Si no has sido tú, ignora este email — tu contraseña actual seguirá funcionando con normalidad.
      </p>
    `
  });
  return dispatch({ to, subject: 'Restablece tu contraseña — Nokfi', html });
}

/**
 * Aviso de "límite anual de reset alcanzado" (#6, sesión 2). El endpoint
 * /request-password-reset ya NO revela por HTTP que el par email+clave es
 * válido pero está al límite (oráculo de enumeración): responde la genérica
 * de siempre y la explicación llega SOLO al buzón del titular con este email.
 */
async function sendPasswordResetLimitEmail({ to }) {
  const html = baseTemplate({
    title: 'Solicitud de restablecimiento de contraseña — Nokfi',
    bodyHtml: `
      <h2 style="margin-top:0;color:#F5F5F5;">Restablecimiento de contraseña</h2>
      <p style="color:#c9c9c5;line-height:1.6;">
        Hemos recibido una solicitud para restablecer la contraseña de tu licencia Nokfi,
        pero esta licencia ya restableció su contraseña durante el último año y el límite
        es de un restablecimiento anual.
      </p>
      <p style="color:#c9c9c5;line-height:1.6;">
        Si necesitas una excepción, contacta con soporte a través de
        <a href="${APP_URL}" style="color:#10B981;">${APP_URL}</a> y revisaremos tu caso.
      </p>
      <p style="color:#6b6b67;font-size:13px;line-height:1.6;">
        Si no has sido tú, ignora este email — tu contraseña actual sigue funcionando con normalidad.
      </p>
    `
  });
  return dispatch({ to, subject: 'Solicitud de restablecimiento — Nokfi', html });
}

/** Aviso de revocación de licencia (chargeback o abuso — sección 15.1/15.4 del proyecto) */
async function sendLicenseRevokedEmail({ to, reason }) {
  const html = baseTemplate({
    title: 'Tu licencia Nokfi ha sido revocada',
    bodyHtml: `
      <h2 style="margin-top:0;color:#F5F5F5;">Licencia revocada</h2>
      <p style="color:#c9c9c5;line-height:1.6;">
        Tu licencia de Nokfi ha sido revocada. Motivo: ${escapeHtml(reason)}.
      </p>
      <p style="color:#c9c9c5;line-height:1.6;">
        Si crees que esto es un error, contacta con soporte a través del chat en
        <a href="${APP_URL}" style="color:#10B981;">${APP_URL}</a>.
      </p>
    `
  });
  return dispatch({ to, subject: 'Tu licencia Nokfi ha sido revocada', html });
}

/**
 * Código OTP de recuperación de acceso (olvido de clave y/o contraseña).
 * El email lleva SOLO el código — nunca la clave de licencia: la clave se
 * muestra en pantalla tras verificar el OTP (y se puede reenviar aparte
 * con sendRecoveredKeysEmail si el usuario lo pide explícitamente).
 */
async function sendRecoveryOtpEmail({ to, code, expires_at }) {
  const html = baseTemplate({
    title: 'Tu código de recuperación de Nokfi',
    bodyHtml: `
      <h2 style="margin-top:0;color:#F5F5F5;">Recuperación de acceso</h2>
      <p style="color:#c9c9c5;line-height:1.6;">
        Hemos recibido una solicitud para recuperar el acceso a tu licencia Nokfi.
        Introduce este código en la página de recuperación:
      </p>
      <div style="background:#0F0F0F;border:1px solid #2A2A28;border-radius:8px;padding:16px;text-align:center;
                  font-family:monospace;font-size:28px;letter-spacing:8px;color:#10B981;margin:20px 0;">
        ${escapeHtml(code)}
      </div>
      <p style="color:#6b6b67;font-size:13px;line-height:1.6;">
        El código caduca el ${escapeHtml(new Date(expires_at).toLocaleString('es-ES'))} y solo es válido
        durante 10 minutos. Si no has sido tú, ignora este email — nadie puede acceder a tu cuenta sin este código.
      </p>
    `
  });
  return dispatch({ to, subject: 'Tu código de recuperación — Nokfi', html });
}

/** Reenvío de las claves activas, solo si el usuario lo pide tras verificar el OTP. */
async function sendRecoveredKeysEmail({ to, keys }) {
  const list = keys.map(k => `
      <div style="background:#0F0F0F;border:1px solid #2A2A28;border-radius:8px;padding:14px;text-align:center;
                  font-family:monospace;font-size:16px;letter-spacing:2px;color:#10B981;margin:10px 0;">
        ${escapeHtml(k)}
      </div>`).join('');
  const html = baseTemplate({
    title: 'Tus claves de licencia Nokfi',
    bodyHtml: `
      <h2 style="margin-top:0;color:#F5F5F5;">Tus claves de licencia</h2>
      <p style="color:#c9c9c5;line-height:1.6;">
        Nos has pedido que te reenviemos tus claves de licencia activas. Aquí las tienes:
      </p>
      ${list}
      <p style="color:#6b6b67;font-size:13px;line-height:1.6;">
        Guárdalas en un lugar seguro. Si no has solicitado este reenvío, contacta con soporte.
      </p>
    `
  });
  return dispatch({ to, subject: 'Tus claves de licencia — Nokfi', html });
}

/* ── C4 (sesión 4): aviso del calendario fiscal, en el idioma del usuario ── */
const FISCAL_TEXTS = {
  es: { subject: (m, d) => `Nokfi · Quedan ${d} día${d === 1 ? '' : 's'}: modelos ${m}`, title: 'Aviso del calendario fiscal',
        lead: (m, p, date, d) => `Los modelos <strong>${m}</strong> (${p}) se presentan hasta el <strong>${date}</strong>: quedan ${d} día${d === 1 ? '' : 's'}.`,
        cond: 'Solo si te aplica (trabajadores, profesionales o alquiler de local).', dom: 'Si lo domicilias, el plazo del banco suele acabar unos días antes.',
        cta: 'Ver impuestos estimados en Nokfi', legal: 'Fechas orientativas (sin festivos). Confírmalas en la sede de la AEAT o con tu gestoría.', off: 'Puedes desactivar estos avisos en Configuración.' },
  en: { subject: (m, d) => `Nokfi · ${d} day${d === 1 ? '' : 's'} left: forms ${m}`, title: 'Tax calendar reminder',
        lead: (m, p, date, d) => `Spanish tax forms <strong>${m}</strong> (${p}) are due by <strong>${date}</strong>: ${d} day${d === 1 ? '' : 's'} left.`,
        cond: 'Only if it applies to you (employees, freelancers you pay or rented premises).', dom: 'If you pay by direct debit, the bank deadline usually ends a few days earlier.',
        cta: 'See estimated taxes in Nokfi', legal: 'Approximate dates (public holidays not included). Confirm them with the Spanish Tax Agency or your accountant.', off: 'You can turn off these reminders in Settings.' },
  fr: { subject: (m, d) => `Nokfi · Plus que ${d} jour${d === 1 ? '' : 's'} : formulaires ${m}`, title: 'Rappel du calendrier fiscal',
        lead: (m, p, date, d) => `Les formulaires espagnols <strong>${m}</strong> (${p}) sont à déposer avant le <strong>${date}</strong> : il reste ${d} jour${d === 1 ? '' : 's'}.`,
        cond: 'Uniquement si cela vous concerne (salariés, professionnels ou local loué).', dom: 'En cas de prélèvement, le délai bancaire se termine généralement quelques jours avant.',
        cta: 'Voir les impôts estimés dans Nokfi', legal: 'Dates indicatives (hors jours fériés). Vérifiez-les auprès de l’AEAT ou de votre comptable.', off: 'Vous pouvez désactiver ces rappels dans Paramètres.' },
  it: { subject: (m, d) => `Nokfi · Mancano ${d} giorn${d === 1 ? 'o' : 'i'}: modelli ${m}`, title: 'Promemoria del calendario fiscale',
        lead: (m, p, date, d) => `I modelli spagnoli <strong>${m}</strong> (${p}) vanno presentati entro il <strong>${date}</strong>: mancano ${d} giorn${d === 1 ? 'o' : 'i'}.`,
        cond: 'Solo se ti riguarda (dipendenti, professionisti o locale in affitto).', dom: 'Con l’addebito diretto, la scadenza della banca di solito termina qualche giorno prima.',
        cta: 'Vedi le imposte stimate in Nokfi', legal: 'Date indicative (senza festività). Verificale con l’AEAT o con il tuo commercialista.', off: 'Puoi disattivare questi promemoria in Impostazioni.' },
  de: { subject: (m, d) => `Nokfi · Noch ${d} Tag${d === 1 ? '' : 'e'}: Formulare ${m}`, title: 'Erinnerung an den Steuerkalender',
        lead: (m, p, date, d) => `Die spanischen Formulare <strong>${m}</strong> (${p}) sind bis zum <strong>${date}</strong> fällig: noch ${d} Tag${d === 1 ? '' : 'e'}.`,
        cond: 'Nur falls zutreffend (Beschäftigte, Freiberufler oder gemietete Räume).', dom: 'Bei Lastschrift endet die Frist der Bank meist einige Tage früher.',
        cta: 'Geschätzte Steuern in Nokfi ansehen', legal: 'Richtwerte (ohne Feiertage). Bitte bei der AEAT oder deinem Steuerberater prüfen.', off: 'Du kannst diese Erinnerungen in den Einstellungen deaktivieren.' },
  pl: { subject: (m, d) => `Nokfi · Zostało dni: ${d} — formularze ${m}`, title: 'Przypomnienie z kalendarza podatkowego',
        lead: (m, p, date, d) => `Hiszpańskie formularze <strong>${m}</strong> (${p}) należy złożyć do <strong>${date}</strong>. Zostało dni: ${d}.`,
        cond: 'Tylko jeśli dotyczy (pracownicy, zleceniobiorcy lub wynajmowany lokal).', dom: 'Przy polecenia zapłaty termin banku kończy się zwykle kilka dni wcześniej.',
        cta: 'Zobacz szacowane podatki w Nokfi', legal: 'Daty orientacyjne (bez świąt). Sprawdź je w AEAT lub u swojego księgowego.', off: 'Możesz wyłączyć te przypomnienia w Ustawieniach.' }
};

async function sendFiscalReminderEmail({ to, lang, deadline, daysLeft }) {
  const tx = FISCAL_TEXTS[lang] || FISCAL_TEXTS.es;
  const models = deadline.models.join(', ');
  const html = baseTemplate({
    title: tx.title,
    bodyHtml: `
      <h2 style="margin-top:0;color:#F5F5F5;">${escapeHtml(tx.title)}</h2>
      <p style="color:#c9c9c5;line-height:1.6;">${tx.lead(escapeHtml(models), escapeHtml(deadline.period), escapeHtml(deadline.date), daysLeft)}</p>
      ${deadline.conditional ? `<p style="color:#c9c9c5;line-height:1.6;">${escapeHtml(tx.cond)}</p>` : ''}
      <p style="color:#c9c9c5;line-height:1.6;">${escapeHtml(tx.dom)}</p>
      <p style="margin:24px 0;"><a href="${APP_URL}/app/finanzas/impuestos" style="background:#1456A2;color:#fff;padding:12px 18px;border-radius:8px;text-decoration:none;">${escapeHtml(tx.cta)}</a></p>
      <p style="color:#6b6b67;font-size:12px;line-height:1.6;">${escapeHtml(tx.legal)}<br>${escapeHtml(tx.off)}</p>
    `
  });
  return dispatch({ to, subject: tx.subject(models, daysLeft), html });
}

module.exports = {
  sendFiscalReminderEmail,
  sendLicenseKeyEmail,
  sendPasswordResetEmail,
  sendPasswordResetLimitEmail,
  sendLicenseRevokedEmail,
  sendRecoveryOtpEmail,
  sendRecoveredKeysEmail
};
