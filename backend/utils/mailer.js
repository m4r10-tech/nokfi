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

async function dispatch({ to, subject, html, fromName, replyTo }) {
  if (!process.env.RESEND_API_KEY) {
    // En desarrollo sin clave configurada, no rompemos el flujo: solo avisamos.
    console.warn(`[MAILER] Sin RESEND_API_KEY — email NO enviado a ${to}. Asunto: "${subject}"`);
    return { skipped: true };
  }
  return dispatchViaResend({ to, subject, html, fromName, replyTo });
}

async function dispatchViaResend({ to, subject, html, fromName, replyTo }) {
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
      from: `${fromName || FROM_NAME} <${FROM_EMAIL}>`,
      to: [to],
      ...(replyTo ? { reply_to: replyTo } : {}),
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

/* ── Resumen mensual (sesión 4), en el idioma del usuario ── */
const LOCALES = { es: 'es-ES', en: 'en-GB', fr: 'fr-FR', it: 'it-IT', de: 'de-DE', pl: 'pl-PL' };
const SUMMARY_TEXTS = {
  es: { subject: (m) => `Nokfi · Tu resumen de ${m}`, hello: (c) => `Hola${c ? `, ${c}` : ''}. Así cerró tu mes:`, month: 'El mes', income: 'Ingresos', expense: 'Gastos', result: 'Resultado', invoices: (n) => `${n} facturas en el libro`, taxes: (q) => `Impuestos ${q} (estimación)`, due: (d) => `vence el ${d}`, reserved: (v) => `llevas apartado ${v}`, receivables: 'Te deben', overdue: (v) => `${v} con más de 60 días`, recurring: 'Gastos recurrentes', perMonth: '/mes', alerts: (n) => `${n} alertas de fugas`, cash: 'Caja en 30 días', below: (d) => `⚠ bajarías del umbral el ${d}`, deadline: (m, d) => `Próximo plazo fiscal: modelos ${m} · ${d}`, actions: (n) => `Tienes ${n} tareas pendientes en tu plan de acción.`, cta: 'Abrir Nokfi', legal: 'Estimaciones orientativas a partir de tu libro; no son asesoramiento fiscal.', off: 'Puedes desactivar este resumen en Configuración.' },
  en: { subject: (m) => `Nokfi · Your ${m} summary`, hello: (c) => `Hi${c ? `, ${c}` : ''}. This is how your month closed:`, month: 'The month', income: 'Income', expense: 'Expenses', result: 'Result', invoices: (n) => `${n} invoices in the ledger`, taxes: (q) => `Taxes ${q} (estimate)`, due: (d) => `due ${d}`, reserved: (v) => `you have set aside ${v}`, receivables: 'Owed to you', overdue: (v) => `${v} over 60 days`, recurring: 'Recurring costs', perMonth: '/month', alerts: (n) => `${n} leak alerts`, cash: 'Cash in 30 days', below: (d) => `⚠ you would drop below your threshold on ${d}`, deadline: (m, d) => `Next tax deadline: forms ${m} · ${d}`, actions: (n) => `You have ${n} open tasks in your action plan.`, cta: 'Open Nokfi', legal: 'Approximate estimates from your ledger; not tax advice.', off: 'You can turn off this summary in Settings.' },
  fr: { subject: (m) => `Nokfi · Votre résumé de ${m}`, hello: (c) => `Bonjour${c ? `, ${c}` : ''}. Voici comment s’est terminé votre mois :`, month: 'Le mois', income: 'Recettes', expense: 'Dépenses', result: 'Résultat', invoices: (n) => `${n} factures dans le registre`, taxes: (q) => `Impôts ${q} (estimation)`, due: (d) => `échéance le ${d}`, reserved: (v) => `vous avez mis de côté ${v}`, receivables: 'On vous doit', overdue: (v) => `${v} à plus de 60 jours`, recurring: 'Dépenses récurrentes', perMonth: '/mois', alerts: (n) => `${n} alertes de fuites`, cash: 'Trésorerie à 30 jours', below: (d) => `⚠ vous passeriez sous le seuil le ${d}`, deadline: (m, d) => `Prochaine échéance fiscale : formulaires ${m} · ${d}`, actions: (n) => `Vous avez ${n} tâches en attente dans votre plan d’action.`, cta: 'Ouvrir Nokfi', legal: 'Estimations indicatives à partir de votre registre ; pas un conseil fiscal.', off: 'Vous pouvez désactiver ce résumé dans les Paramètres.' },
  it: { subject: (m) => `Nokfi · Il tuo riepilogo di ${m}`, hello: (c) => `Ciao${c ? `, ${c}` : ''}. Ecco come si è chiuso il tuo mese:`, month: 'Il mese', income: 'Entrate', expense: 'Uscite', result: 'Risultato', invoices: (n) => `${n} fatture nel registro`, taxes: (q) => `Imposte ${q} (stima)`, due: (d) => `scadenza il ${d}`, reserved: (v) => `hai accantonato ${v}`, receivables: 'Ti devono', overdue: (v) => `${v} oltre 60 giorni`, recurring: 'Spese ricorrenti', perMonth: '/mese', alerts: (n) => `${n} avvisi di perdite`, cash: 'Cassa a 30 giorni', below: (d) => `⚠ scenderesti sotto la soglia il ${d}`, deadline: (m, d) => `Prossima scadenza fiscale: modelli ${m} · ${d}`, actions: (n) => `Hai ${n} attività in sospeso nel tuo piano d’azione.`, cta: 'Apri Nokfi', legal: 'Stime indicative dal tuo registro; non è consulenza fiscale.', off: 'Puoi disattivare questo riepilogo nelle Impostazioni.' },
  de: { subject: (m) => `Nokfi · Deine Zusammenfassung für ${m}`, hello: (c) => `Hallo${c ? `, ${c}` : ''}. So hat dein Monat abgeschlossen:`, month: 'Der Monat', income: 'Einnahmen', expense: 'Ausgaben', result: 'Ergebnis', invoices: (n) => `${n} Rechnungen im Journal`, taxes: (q) => `Steuern ${q} (Schätzung)`, due: (d) => `fällig am ${d}`, reserved: (v) => `zurückgelegt: ${v}`, receivables: 'Offene Forderungen', overdue: (v) => `${v} über 60 Tage`, recurring: 'Wiederkehrende Kosten', perMonth: '/Monat', alerts: (n) => `${n} Hinweise auf Lecks`, cash: 'Liquidität in 30 Tagen', below: (d) => `⚠ am ${d} fielest du unter deine Schwelle`, deadline: (m, d) => `Nächste Steuerfrist: Formulare ${m} · ${d}`, actions: (n) => `Du hast ${n} offene Aufgaben in deinem Maßnahmenplan.`, cta: 'Nokfi öffnen', legal: 'Unverbindliche Schätzungen aus deinem Journal; keine Steuerberatung.', off: 'Du kannst diese Zusammenfassung in den Einstellungen deaktivieren.' },
  pl: { subject: (m) => `Nokfi · Podsumowanie: ${m}`, hello: (c) => `Cześć${c ? `, ${c}` : ''}. Tak zamknął się twój miesiąc:`, month: 'Miesiąc', income: 'Przychody', expense: 'Wydatki', result: 'Wynik', invoices: (n) => `Faktur w rejestrze: ${n}`, taxes: (q) => `Podatki ${q} (szacunek)`, due: (d) => `termin ${d}`, reserved: (v) => `odłożono ${v}`, receivables: 'Należności', overdue: (v) => `${v} ponad 60 dni`, recurring: 'Stałe koszty', perMonth: '/mies.', alerts: (n) => `Alerty wycieków: ${n}`, cash: 'Gotówka za 30 dni', below: (d) => `⚠ ${d} spadniesz poniżej progu`, deadline: (m, d) => `Najbliższy termin podatkowy: formularze ${m} · ${d}`, actions: (n) => `Masz otwarte zadania w planie działania: ${n}.`, cta: 'Otwórz Nokfi', legal: 'Orientacyjne szacunki na podstawie rejestru; to nie jest doradztwo podatkowe.', off: 'Możesz wyłączyć to podsumowanie w Ustawieniach.' }
};

async function sendMonthlySummaryEmail({ to, data }) {
  const lang = SUMMARY_TEXTS[data.lang] ? data.lang : 'es';
  const tx = SUMMARY_TEXTS[lang];
  const loc = LOCALES[lang];
  const eur = (n) => Number(n || 0).toLocaleString(loc, { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
  const date = (s) => new Date(`${s}T00:00:00Z`).toLocaleDateString(loc, { day: 'numeric', month: 'long', timeZone: 'UTC' });
  const monthName = new Date(`${data.month}-01T00:00:00Z`).toLocaleDateString(loc, { month: 'long', year: 'numeric', timeZone: 'UTC' });
  const row = (label, value, note = '') => `<tr><td style="padding:6px 0;color:#9a9a96;">${escapeHtml(label)}</td><td style="padding:6px 0;text-align:right;color:#F5F5F5;font-weight:600;">${escapeHtml(value)}</td></tr>${note ? `<tr><td colspan="2" style="padding:0 0 6px;color:#6b6b67;font-size:12px;">${escapeHtml(note)}</td></tr>` : ''}`;
  const rows = [
    row(tx.income, eur(data.income)), row(tx.expense, eur(data.expense)), row(tx.result, eur(data.result), tx.invoices(data.invoices)),
    row(tx.taxes(data.taxes.quarter), `≈ ${eur(data.taxes.estimated)}`, `${tx.due(date(data.taxes.due_date))} · ${tx.reserved(eur(data.taxes.reserved))}`),
    row(tx.receivables, eur(data.receivables.total), data.receivables.overdue_60 > 0 ? tx.overdue(eur(data.receivables.overdue_60)) : ''),
    row(tx.recurring, `${eur(data.recurring_monthly)}${tx.perMonth}`, data.alerts ? tx.alerts(data.alerts) : '')
  ];
  if (data.forecast) rows.push(row(tx.cash, eur(data.forecast.at30), data.forecast.first_below ? tx.below(date(data.forecast.first_below.date)) : ''));
  const html = baseTemplate({
    title: tx.subject(monthName),
    bodyHtml: `
      <p style="color:#c9c9c5;line-height:1.6;margin-top:0;">${escapeHtml(tx.hello(data.company))}</p>
      <table style="width:100%;border-collapse:collapse;font-size:14px;">${rows.join('')}</table>
      ${data.next_deadline ? `<p style="color:#c9c9c5;line-height:1.6;margin-top:18px;">${escapeHtml(tx.deadline(data.next_deadline.models.join(', '), date(data.next_deadline.date)))}</p>` : ''}
      ${data.actions_open ? `<p style="color:#c9c9c5;line-height:1.6;">${escapeHtml(tx.actions(data.actions_open))}</p>` : ''}
      <p style="margin:24px 0;"><a href="${APP_URL}/app/home" style="background:#1456A2;color:#fff;padding:12px 18px;border-radius:8px;text-decoration:none;">${escapeHtml(tx.cta)}</a></p>
      <p style="color:#6b6b67;font-size:12px;line-height:1.6;">${escapeHtml(tx.legal)}<br>${escapeHtml(tx.off)}</p>
    `
  });
  return dispatch({ to, subject: tx.subject(monthName), html });
}

/* ── Reclamación automática de cobros (sesión 4) ──
   Plantillas FIJAS (sin IA): el mismo texto cada vez, revisable y predecible.
   Etapa 1 = 7 días tras el vencimiento (amable), 2 = 30 (firme), 3 = 60 (formal).
   Sale de noreply@ con el nombre de la empresa del usuario y Reply-To a su
   email: el cliente contesta directamente al usuario, no a Nokfi. */
const COLLECTION_TEXTS = {
  es: {
    subject: ['Recordatorio: factura {n} pendiente', 'Segundo aviso: factura {n} vencida', 'Aviso final: factura {n} impagada'],
    hello: (p) => `Hola${p ? ` ${p}` : ''}:`,
    body: [
      'Te escribimos para recordarte que la factura {n} del {date}, por importe de {total}, venció el {due} y todavía no nos consta el pago. Seguramente sea un despiste: ¿puedes revisarlo?',
      'Seguimos sin recibir el pago de la factura {n} del {date} ({total}), vencida el {due}. Te agradeceríamos que nos indicaras una fecha de pago o que lo gestionaras en los próximos días.',
      'La factura {n} del {date}, por {total}, lleva más de 60 días vencida (vencimiento: {due}). Te rogamos que regularices el pago lo antes posible o nos contactes para acordar una solución.'
    ],
    paid: 'Si ya has realizado el pago, ignora este mensaje y disculpa las molestias.',
    reply: 'Para cualquier duda, responde a este email.',
    thanks: 'Un saludo,',
    footer: (c) => `Enviado automáticamente por Nokfi en nombre de ${c}. Las respuestas llegan directamente a ${c}.`
  },
  en: {
    subject: ['Reminder: invoice {n} outstanding', 'Second notice: invoice {n} overdue', 'Final notice: invoice {n} unpaid'],
    hello: (p) => `Hello${p ? ` ${p}` : ''},`,
    body: [
      'This is a friendly reminder that invoice {n} dated {date}, for {total}, was due on {due} and we have not yet received payment. It is probably an oversight: could you please check it?',
      'We still have not received payment for invoice {n} dated {date} ({total}), due on {due}. Please let us know when it will be paid or settle it in the coming days.',
      'Invoice {n} dated {date}, for {total}, is more than 60 days overdue (due date: {due}). Please settle it as soon as possible or contact us to agree on a solution.'
    ],
    paid: 'If you have already paid, please disregard this message.',
    reply: 'If you have any questions, just reply to this email.',
    thanks: 'Kind regards,',
    footer: (c) => `Sent automatically by Nokfi on behalf of ${c}. Replies go directly to ${c}.`
  },
  fr: {
    subject: ['Rappel : facture {n} en attente', 'Deuxième relance : facture {n} échue', 'Dernier avis : facture {n} impayée'],
    hello: (p) => `Bonjour${p ? ` ${p}` : ''},`,
    body: [
      'Nous vous rappelons que la facture {n} du {date}, d’un montant de {total}, était échue le {due} et que nous n’avons pas encore reçu le paiement. Il s’agit sans doute d’un oubli : pourriez-vous vérifier ?',
      'Nous n’avons toujours pas reçu le paiement de la facture {n} du {date} ({total}), échue le {due}. Merci de nous indiquer une date de paiement ou de la régler dans les prochains jours.',
      'La facture {n} du {date}, d’un montant de {total}, est échue depuis plus de 60 jours (échéance : {due}). Nous vous prions de la régler au plus vite ou de nous contacter pour trouver une solution.'
    ],
    paid: 'Si vous avez déjà effectué le paiement, merci de ne pas tenir compte de ce message.',
    reply: 'Pour toute question, répondez simplement à cet email.',
    thanks: 'Cordialement,',
    footer: (c) => `Envoyé automatiquement par Nokfi au nom de ${c}. Les réponses arrivent directement à ${c}.`
  },
  it: {
    subject: ['Promemoria: fattura {n} in sospeso', 'Secondo sollecito: fattura {n} scaduta', 'Ultimo avviso: fattura {n} non pagata'],
    hello: (p) => `Buongiorno${p ? ` ${p}` : ''},`,
    body: [
      'Le ricordiamo che la fattura {n} del {date}, di importo {total}, è scaduta il {due} e non ci risulta ancora il pagamento. Probabilmente si tratta di una svista: può verificare?',
      'Non abbiamo ancora ricevuto il pagamento della fattura {n} del {date} ({total}), scaduta il {due}. Le chiediamo di indicarci una data di pagamento o di saldarla nei prossimi giorni.',
      'La fattura {n} del {date}, di importo {total}, è scaduta da oltre 60 giorni (scadenza: {due}). La preghiamo di saldarla al più presto o di contattarci per concordare una soluzione.'
    ],
    paid: 'Se ha già effettuato il pagamento, ignori questo messaggio.',
    reply: 'Per qualsiasi domanda, risponda a questa email.',
    thanks: 'Cordiali saluti,',
    footer: (c) => `Inviato automaticamente da Nokfi per conto di ${c}. Le risposte arrivano direttamente a ${c}.`
  },
  de: {
    subject: ['Erinnerung: Rechnung {n} offen', 'Zweite Mahnung: Rechnung {n} überfällig', 'Letzte Mahnung: Rechnung {n} unbezahlt'],
    hello: (p) => `Guten Tag${p ? ` ${p}` : ''},`,
    body: [
      'wir möchten Sie freundlich daran erinnern, dass die Rechnung {n} vom {date} über {total} am {due} fällig war und wir noch keinen Zahlungseingang verzeichnen. Vermutlich ist sie nur untergegangen – könnten Sie das prüfen?',
      'Die Zahlung der Rechnung {n} vom {date} ({total}), fällig am {due}, ist weiterhin nicht eingegangen. Bitte nennen Sie uns einen Zahlungstermin oder begleichen Sie den Betrag in den nächsten Tagen.',
      'Die Rechnung {n} vom {date} über {total} ist seit mehr als 60 Tagen überfällig (Fälligkeit: {due}). Bitte begleichen Sie den Betrag umgehend oder kontaktieren Sie uns, um eine Lösung zu vereinbaren.'
    ],
    paid: 'Sollten Sie bereits bezahlt haben, betrachten Sie diese Nachricht bitte als gegenstandslos.',
    reply: 'Bei Fragen antworten Sie einfach auf diese E-Mail.',
    thanks: 'Mit freundlichen Grüßen',
    footer: (c) => `Automatisch von Nokfi im Namen von ${c} gesendet. Antworten gehen direkt an ${c}.`
  },
  pl: {
    subject: ['Przypomnienie: faktura {n} nieopłacona', 'Drugie wezwanie: faktura {n} po terminie', 'Ostateczne wezwanie: faktura {n} nieopłacona'],
    hello: (p) => `Dzień dobry${p ? ` ${p}` : ''},`,
    body: [
      'Uprzejmie przypominamy, że termin płatności faktury {n} z dnia {date} na kwotę {total} minął {due}, a nie odnotowaliśmy jeszcze wpłaty. To pewnie przeoczenie – czy mogą Państwo to sprawdzić?',
      'Nadal nie otrzymaliśmy płatności za fakturę {n} z dnia {date} ({total}), z terminem {due}. Prosimy o wskazanie daty płatności lub uregulowanie należności w najbliższych dniach.',
      'Faktura {n} z dnia {date} na kwotę {total} jest przeterminowana o ponad 60 dni (termin: {due}). Prosimy o pilne uregulowanie należności lub kontakt w celu uzgodnienia rozwiązania.'
    ],
    paid: 'Jeśli płatność została już dokonana, prosimy zignorować tę wiadomość.',
    reply: 'W razie pytań prosimy odpowiedzieć na tę wiadomość.',
    thanks: 'Z poważaniem',
    footer: (c) => `Wysłane automatycznie przez Nokfi w imieniu ${c}. Odpowiedzi trafiają bezpośrednio do ${c}.`
  }
};

/** Nombre seguro para la cabecera From (sin comillas, <>, saltos de línea). */
function headerName(s) {
  return String(s || '').replace(/[\r\n"<>\\,;]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60);
}

function buildCollectionEmail({ lang, stage, company, entry }) {
  const l = COLLECTION_TEXTS[lang] ? lang : 'es';
  const tx = COLLECTION_TEXTS[l];
  const loc = LOCALES[l];
  const date = (s) => new Date(`${s}T00:00:00Z`).toLocaleDateString(loc, { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
  const vars = {
    n: entry.invoice_number || '—',
    date: date(entry.invoice_date),
    due: date(entry.due_date),
    total: Number(entry.total || 0).toLocaleString(loc, { style: 'currency', currency: 'EUR' })
  };
  const fill = (s) => s.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');
  const i = Math.min(3, Math.max(1, stage)) - 1;
  const subject = fill(tx.subject[i]);
  // Plantilla clara y SIN marca Nokfi: el cliente del usuario recibe un email
  // de la empresa del usuario (a él sí se le puede responder).
  const p = (txt, extra = '') => `<p style="margin:0 0 14px;line-height:1.6;${extra}">${escapeHtml(txt)}</p>`;
  const html = `<!DOCTYPE html><html lang="${l}"><head><meta charset="UTF-8"><title>${escapeHtml(subject)}</title></head>
  <body style="margin:0;padding:0;background:#ffffff;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#1f2328;font-size:15px;">
    <div style="max-width:560px;margin:0 auto;padding:32px 24px;">
      ${p(tx.hello(entry.party_name))}
      ${p(fill(tx.body[i]))}
      ${p(`${tx.paid} ${tx.reply}`)}
      <p style="margin:0 0 14px;line-height:1.6;">${escapeHtml(tx.thanks)}<br><strong>${escapeHtml(company)}</strong></p>
      ${p(tx.footer(company), 'color:#8b949e;font-size:12px;margin-top:28px;')}
    </div>
  </body></html>`;
  return { subject, html };
}

async function sendCollectionEmail({ to, replyTo, lang, stage, company, entry }) {
  const { subject, html } = buildCollectionEmail({ lang, stage, company, entry });
  const name = headerName(company);
  return dispatch({ to, subject, html, replyTo, fromName: name ? `${name} (vía Nokfi)` : undefined });
}

module.exports = {
  sendCollectionEmail,
  buildCollectionEmail,
  sendMonthlySummaryEmail,
  sendFiscalReminderEmail,
  sendLicenseKeyEmail,
  sendPasswordResetEmail,
  sendPasswordResetLimitEmail,
  sendLicenseRevokedEmail,
  sendRecoveryOtpEmail,
  sendRecoveredKeysEmail
};
