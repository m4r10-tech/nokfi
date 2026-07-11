/**
 * utils/paypalAuth.js
 *
 * Helpers de PayPal compartidos entre routes/payments.js (checkout) y
 * routes/webhooks.js (verificación de webhooks). Extraído a módulo propio
 * para evitar duplicar lógica de autenticación OAuth2 en dos sitios.
 */

'use strict';

function paypalApiBase() {
  return process.env.PAYPAL_ENV === 'live'
    ? 'https://api-m.paypal.com'
    : 'https://api-m.sandbox.paypal.com';
}

/** Obtiene un access token OAuth2 de PayPal (client_credentials) */
async function getPaypalAccessToken() {
  const credentials = Buffer.from(
    `${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`
  ).toString('base64');

  const res = await fetch(`${paypalApiBase()}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: 'grant_type=client_credentials'
  });

  if (!res.ok) throw new Error('No se pudo obtener token de acceso de PayPal');
  const data = await res.json();
  return data.access_token;
}

module.exports = { paypalApiBase, getPaypalAccessToken };
