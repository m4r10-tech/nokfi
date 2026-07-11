/**
 * utils/mailer.js
 *
 * Envío de emails transaccionales. Soporta SendGrid o Resend según la
 * variable de entorno EMAIL_PROVIDER ('sendgrid' | 'resend').
 *
 * Emails que envía el sistema (ver secciones 3, 5, 15 del proyecto):
 *   - sendLicenseKeyEmail        → respaldo de la clave tras el pago
 *   - sendDeviceResetEmail       → enlace de un solo uso para resetear dispositivo
 *   - sendLicenseRevokedEmail    → aviso de revocación (chargeback / abuso)
 *
 * Diseño: cada función arma el HTML del email y delega el envío real a
 * `dispatch()`, que es el único punto que habla con la API externa.
 * Así, cambiar de proveedor en el futuro solo toca un sitio.
 */

'use strict';

const APP_URL = process.env.APP_PUBLIC_URL || 'https://app.nokfi.app';
const FROM_EMAIL = process.env.EMAIL_FROM || 'no-reply@nokfi.app';
const FROM_NAME = process.env.EMAIL_FROM_NAME || 'Nokfi';
const PROVIDER = (process.env.EMAIL_PROVIDER || 'sendgrid').toLowerCase();

/* ════════════════════════════════════════════════════════════
   DISPATCH — único punto de contacto con la API externa
════════════════════════════════════════════════════════════ */

async function dispatch({ to, subject, html }) {
  if (!process.env.SENDGRID_API_KEY && !process.env.RESEND_API_KEY) {
    // En desarrollo sin claves configuradas, no rompemos el flujo: solo avisamos.
    console.warn(`[MAILER] Sin API key configurada — email NO enviado a ${to}. Asunto: "${subject}"`);
    return { skipped: true };
  }

  if (PROVIDER === 'resend') {
    return dispatchViaResend({ to, subject, html });
  }
  return dispatchViaSendGrid({ to, subject, html });
}

async function dispatchViaSendGrid({ to, subject, html }) {
  const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.SENDGRID_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: to }] }],
      from: { email: FROM_EMAIL, name: FROM_NAME },
      subject,
      content: [{ type: 'text/html', value: html }]
    })
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`SendGrid respondió ${res.status}: ${body}`);
  }
  return { sent: true, provider: 'sendgrid' };
}

async function dispatchViaResend({ to, subject, html }) {
  const res = await fetch('https://api.resend.com/emails', {
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
  });

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
        Actívala en <a href="${APP_URL}" style="color:#10B981;">${APP_URL}</a> usando este email y la clave de arriba.
      </p>
      <p style="color:#6b6b67;font-size:13px;line-height:1.6;">
        Tu licencia quedará vinculada de forma permanente al primer dispositivo donde la actives.
      </p>
    `
  });
  return dispatch({ to, subject: 'Tu clave de licencia Nokfi', html });
}

/** Enlace de un solo uso para resetear el dispositivo vinculado (sección 15.2 del proyecto) */
async function sendDeviceResetEmail({ to, token, expires_at }) {
  const resetUrl = `${APP_URL}/reset-device?token=${encodeURIComponent(token)}`;
  const html = baseTemplate({
    title: 'Resetea tu dispositivo en Nokfi',
    bodyHtml: `
      <h2 style="margin-top:0;color:#F5F5F5;">Cambio de dispositivo solicitado</h2>
      <p style="color:#c9c9c5;line-height:1.6;">
        Hemos recibido una solicitud para vincular tu licencia Nokfi a un nuevo dispositivo.
        Si has sido tú, confirma con el siguiente enlace:
      </p>
      <div style="text-align:center;margin:24px 0;">
        <a href="${resetUrl}" style="background:#10B981;color:#0F0F0F;padding:12px 24px;border-radius:8px;
                  text-decoration:none;font-weight:600;display:inline-block;">
          Confirmar nuevo dispositivo
        </a>
      </div>
      <p style="color:#6b6b67;font-size:13px;line-height:1.6;">
        Este enlace caduca el ${escapeHtml(new Date(expires_at).toLocaleString('es-ES'))} y solo puede usarse una vez.
        Si no has sido tú, ignora este email — tu dispositivo actual seguirá funcionando con normalidad.
      </p>
    `
  });
  return dispatch({ to, subject: 'Confirma el cambio de dispositivo — Nokfi', html });
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

module.exports = {
  sendLicenseKeyEmail,
  sendDeviceResetEmail,
  sendLicenseRevokedEmail
};
