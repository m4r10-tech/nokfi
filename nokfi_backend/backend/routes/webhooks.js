/**
 * routes/webhooks.js
 *
 * Recibe la confirmación de pago de cada proveedor y, SOLO entonces, genera
 * la licencia. La clave nunca existe antes de este punto (sección 4 del
 * proyecto: "anti-bypass del pago").
 *
 * Endpoints:
 *   POST /api/webhooks/stripe    → requiere RAW body (firma HMAC local)
 *   POST /api/webhooks/paypal    → requiere JSON parseado (verificación vía API REST de PayPal)
 *   POST /api/webhooks/coinbase  → requiere RAW body (firma HMAC local)
 *
 * server.js se encarga de montar express.raw() en /api/webhooks/stripe y
 * /api/webhooks/coinbase ANTES de este router, y express.json() global para
 * el resto (incluido /api/webhooks/paypal). Ver comentario en server.js.
 */

'use strict';

const express = require('express');
const crypto = require('crypto');
const router = express.Router();

const {
  createLicense,
  isPaymentEventProcessed,
  recordPaymentEvent,
  updateLicense,
  getLicenseByPaymentRef,
  deleteSessionsForLicense,
  audit
} = require('../db/database');

const { sendLicenseKeyEmail, sendLicenseRevokedEmail } = require('../utils/mailer');
const { paypalApiBase, getPaypalAccessToken } = require('../utils/paypalAuth');

const LICENSE_PRICE_EUR = Number(process.env.LICENSE_PRICE_EUR || 150);

/* ════════════════════════════════════════════════════════════
   STRIPE
════════════════════════════════════════════════════════════ */

router.post('/stripe', async (req, res) => {
  const signature = req.headers['stripe-signature'];
  const secret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!signature || !secret) {
    return res.status(400).json({ error: 'missing_signature' });
  }

  let event;
  try {
    event = verifyStripeSignature(req.body, signature, secret);
  } catch (e) {
    audit('WEBHOOK_STRIPE_INVALID_SIGNATURE', { ip: req.ip, detail: e.message });
    return res.status(400).json({ error: 'invalid_signature' });
  }

  if (isPaymentEventProcessed('stripe', event.id)) {
    return res.json({ received: true, duplicate: true });
  }

  try {
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      const email = (session.customer_email || session.metadata?.email || '').toLowerCase();
      const plan = session.metadata?.plan === 'pro' ? 'pro' : 'basic';
      const amount_eur = session.amount_total ? session.amount_total / 100 : LICENSE_PRICE_EUR;

      if (!email) {
        console.error('[WEBHOOK STRIPE] checkout.session.completed sin email, no se genera licencia');
        recordPaymentEvent({ provider: 'stripe', event_id: event.id, event_type: event.type, processed: false });
        return res.status(200).json({ received: true, warning: 'no_email' });
      }

      const license = createLicense({
        email, plan, payment_provider: 'stripe', payment_ref: session.id, amount_eur,
        created_by: 'webhook_stripe'
      });

      recordPaymentEvent({
        provider: 'stripe', event_id: event.id, event_type: event.type,
        license_id: license.id, amount_eur, processed: true
      });

      audit('LICENSE_CREATED_STRIPE', { license_id: license.id, ip: req.ip, detail: `email=${email}` });

      sendLicenseKeyEmail({ to: email, licenseKey: license.key, plan }).catch(e =>
        console.error('[EMAIL] Fallo enviando clave tras pago Stripe:', e.message)
      );
    } else if (event.type === 'charge.dispute.created') {
      const charge = event.data.object;
      await handleChargebackByPaymentRef('stripe', charge.payment_intent || charge.id, req.ip);
      recordPaymentEvent({ provider: 'stripe', event_id: event.id, event_type: event.type, processed: true });
    } else {
      // Eventos no manejados explícitamente: se registran como procesados para no reintentarlos en bucle
      recordPaymentEvent({ provider: 'stripe', event_id: event.id, event_type: event.type, processed: true });
    }

    res.json({ received: true });
  } catch (e) {
    console.error('[WEBHOOK STRIPE] Error procesando evento:', e.message);
    res.status(500).json({ error: 'processing_failed' });
  }
});

/* ════════════════════════════════════════════════════════════
   PAYPAL
════════════════════════════════════════════════════════════ */

router.post('/paypal', async (req, res) => {
  const event = req.body;
  const transmissionId = req.headers['paypal-transmission-id'];

  if (!transmissionId) {
    return res.status(400).json({ error: 'missing_transmission_id' });
  }

  let verified;
  try {
    verified = await verifyPaypalWebhook(req.headers, event);
  } catch (e) {
    audit('WEBHOOK_PAYPAL_VERIFY_FAILED', { ip: req.ip, detail: e.message });
    return res.status(400).json({ error: 'verification_failed' });
  }

  if (!verified) {
    audit('WEBHOOK_PAYPAL_INVALID_SIGNATURE', { ip: req.ip });
    return res.status(400).json({ error: 'invalid_signature' });
  }

  const eventId = event.id;
  if (isPaymentEventProcessed('paypal', eventId)) {
    return res.json({ received: true, duplicate: true });
  }

  try {
    if (event.event_type === 'CHECKOUT.ORDER.APPROVED' || event.event_type === 'PAYMENT.CAPTURE.COMPLETED') {
      const resource = event.resource;
      const customId = resource?.purchase_units?.[0]?.custom_id || resource?.custom_id;
      let email = '', plan = 'basic';
      try {
        const parsed = JSON.parse(customId || '{}');
        email = (parsed.email || '').toLowerCase();
        plan = parsed.plan === 'pro' ? 'pro' : 'basic';
      } catch (_) { /* custom_id ausente o malformado — se gestiona abajo */ }

      if (!email) {
        console.error('[WEBHOOK PAYPAL] Evento sin email asociado, no se puede generar licencia');
        recordPaymentEvent({ provider: 'paypal', event_id: eventId, event_type: event.event_type, processed: false });
        return res.status(200).json({ received: true, warning: 'no_email' });
      }

      const amount_eur = parseFloat(
        resource?.amount?.value || resource?.purchase_units?.[0]?.amount?.value || LICENSE_PRICE_EUR
      );

      const license = createLicense({
        email, plan, payment_provider: 'paypal', payment_ref: resource.id, amount_eur,
        created_by: 'webhook_paypal'
      });

      recordPaymentEvent({
        provider: 'paypal', event_id: eventId, event_type: event.event_type,
        license_id: license.id, amount_eur, processed: true
      });

      audit('LICENSE_CREATED_PAYPAL', { license_id: license.id, ip: req.ip, detail: `email=${email}` });

      sendLicenseKeyEmail({ to: email, licenseKey: license.key, plan }).catch(e =>
        console.error('[EMAIL] Fallo enviando clave tras pago PayPal:', e.message)
      );
    } else if (event.event_type === 'CUSTOMER.DISPUTE.CREATED') {
      const disputedTxnId = event.resource?.disputed_transactions?.[0]?.seller_transaction_id;
      if (disputedTxnId) {
        await handleChargebackByPaymentRef('paypal', disputedTxnId, req.ip);
      }
      recordPaymentEvent({ provider: 'paypal', event_id: eventId, event_type: event.event_type, processed: true });
    } else {
      recordPaymentEvent({ provider: 'paypal', event_id: eventId, event_type: event.event_type, processed: true });
    }

    res.json({ received: true });
  } catch (e) {
    console.error('[WEBHOOK PAYPAL] Error procesando evento:', e.message);
    res.status(500).json({ error: 'processing_failed' });
  }
});

/* ════════════════════════════════════════════════════════════
   COINBASE COMMERCE
════════════════════════════════════════════════════════════ */

router.post('/coinbase', async (req, res) => {
  const signature = req.headers['x-cc-webhook-signature'];
  const secret = process.env.COINBASE_COMMERCE_WEBHOOK_SECRET;

  if (!signature || !secret) {
    return res.status(400).json({ error: 'missing_signature' });
  }

  let event;
  try {
    event = verifyCoinbaseSignature(req.body, signature, secret);
  } catch (e) {
    audit('WEBHOOK_COINBASE_INVALID_SIGNATURE', { ip: req.ip, detail: e.message });
    return res.status(400).json({ error: 'invalid_signature' });
  }

  const eventId = event.id;
  if (isPaymentEventProcessed('coinbase', eventId)) {
    return res.json({ received: true, duplicate: true });
  }

  try {
    const charge = event.event.data;

    if (event.event.type === 'charge:confirmed') {
      const email = (charge.metadata?.email || '').toLowerCase();
      const plan = charge.metadata?.plan === 'pro' ? 'pro' : 'basic';

      if (!email) {
        console.error('[WEBHOOK COINBASE] Charge confirmado sin email en metadata');
        recordPaymentEvent({ provider: 'coinbase', event_id: eventId, event_type: event.event.type, processed: false });
        return res.status(200).json({ received: true, warning: 'no_email' });
      }

      const amount_eur = parseFloat(charge.pricing?.local?.amount || LICENSE_PRICE_EUR);

      const license = createLicense({
        email, plan, payment_provider: 'coinbase', payment_ref: charge.id, amount_eur,
        created_by: 'webhook_coinbase'
      });

      recordPaymentEvent({
        provider: 'coinbase', event_id: eventId, event_type: event.event.type,
        license_id: license.id, amount_eur, processed: true
      });

      audit('LICENSE_CREATED_COINBASE', { license_id: license.id, ip: req.ip, detail: `email=${email}` });

      sendLicenseKeyEmail({ to: email, licenseKey: license.key, plan }).catch(e =>
        console.error('[EMAIL] Fallo enviando clave tras pago Coinbase:', e.message)
      );
    } else {
      recordPaymentEvent({ provider: 'coinbase', event_id: eventId, event_type: event.event.type, processed: true });
    }

    res.json({ received: true });
  } catch (e) {
    console.error('[WEBHOOK COINBASE] Error procesando evento:', e.message);
    res.status(500).json({ error: 'processing_failed' });
  }
});

/* ════════════════════════════════════════════════════════════
   REVOLUT
════════════════════════════════════════════════════════════ */

/**
 * POST /api/webhooks/revolut
 *
 * Revolut firma así (verificado en su documentación oficial):
 *   payload_to_sign = "v1." + Revolut-Request-Timestamp + "." + raw_body
 *   firma esperada  = "v1=" + HMAC-SHA256(payload_to_sign, signing_secret)
 * comparada contra el header Revolut-Signature.
 *
 * El evento ORDER_COMPLETED solo trae order_id y merchant_order_ext_ref
 * (no trae email/plan/importe directamente), así que hacemos una llamada
 * GET adicional a la Merchant API para recuperar el order completo,
 * incluyendo merchant_order_data.reference (donde guardamos email+plan
 * al crear el order) y el amount real confirmado.
 */
router.post('/revolut', async (req, res) => {
  const signature = req.headers['revolut-signature'];
  const timestamp = req.headers['revolut-request-timestamp'];
  const secret = process.env.REVOLUT_WEBHOOK_SIGNING_SECRET;

  if (!signature || !timestamp || !secret) {
    return res.status(400).json({ error: 'missing_signature' });
  }

  let event;
  try {
    event = verifyRevolutSignature(req.body, signature, timestamp, secret);
  } catch (e) {
    audit('WEBHOOK_REVOLUT_INVALID_SIGNATURE', { ip: req.ip, detail: e.message });
    return res.status(400).json({ error: 'invalid_signature' });
  }

  // Revolut no manda un id de evento único explícito como Stripe/Coinbase;
  // usamos order_id + event como clave de idempotencia, que es estable por evento.
  const eventId = `${event.order_id}:${event.event}`;
  if (isPaymentEventProcessed('revolut', eventId)) {
    return res.json({ received: true, duplicate: true });
  }

  try {
    if (event.event === 'ORDER_COMPLETED') {
      const order = await fetchRevolutOrder(event.order_id);

      let email = '', plan = 'basic';
      try {
        const parsed = JSON.parse(order.merchant_order_data?.reference || '{}');
        email = (parsed.email || '').toLowerCase();
        plan = parsed.plan === 'pro' ? 'pro' : 'basic';
      } catch (_) { /* reference ausente o malformada — se gestiona abajo */ }

      if (!email) {
        console.error('[WEBHOOK REVOLUT] ORDER_COMPLETED sin email en la referencia del order');
        recordPaymentEvent({ provider: 'revolut', event_id: eventId, event_type: event.event, processed: false });
        return res.status(200).json({ received: true, warning: 'no_email' });
      }

      const amount_eur = typeof order.order_amount?.value === 'number'
        ? order.order_amount.value / 100
        : LICENSE_PRICE_EUR;

      const license = createLicense({
        email, plan, payment_provider: 'revolut', payment_ref: event.order_id, amount_eur,
        created_by: 'webhook_revolut'
      });

      recordPaymentEvent({
        provider: 'revolut', event_id: eventId, event_type: event.event,
        license_id: license.id, amount_eur, processed: true
      });

      audit('LICENSE_CREATED_REVOLUT', { license_id: license.id, ip: req.ip, detail: `email=${email}` });

      sendLicenseKeyEmail({ to: email, licenseKey: license.key, plan }).catch(e =>
        console.error('[EMAIL] Fallo enviando clave tras pago Revolut:', e.message)
      );
    } else if (event.event === 'DISPUTE_ACTION_REQUIRED' || event.event === 'DISPUTE_UNDER_REVIEW') {
      // Disputa/chargeback de Revolut — misma lógica de revocación que Stripe/PayPal
      await handleChargebackByPaymentRef('revolut', event.order_id, req.ip);
      recordPaymentEvent({ provider: 'revolut', event_id: eventId, event_type: event.event, processed: true });
    } else {
      recordPaymentEvent({ provider: 'revolut', event_id: eventId, event_type: event.event, processed: true });
    }

    // Revolut recomienda responder 204 cuando el evento se procesó correctamente
    res.status(204).end();
  } catch (e) {
    console.error('[WEBHOOK REVOLUT] Error procesando evento:', e.message);
    res.status(500).json({ error: 'processing_failed' });
  }
});

/* ════════════════════════════════════════════════════════════
   HELPERS DE VERIFICACIÓN CRIPTOGRÁFICA
════════════════════════════════════════════════════════════ */

/**
 * Verifica la firma de un webhook de Stripe sin depender del SDK oficial.
 * Esquema documentado por Stripe: HMAC-SHA256 sobre `${timestamp}.${rawBody}`
 * comparado con el valor `v1` de la cabecera `Stripe-Signature`.
 */
function verifyStripeSignature(rawBody, signatureHeader, secret) {
  const parts = Object.fromEntries(signatureHeader.split(',').map(p => p.split('=')));
  const timestamp = parts.t;
  const expectedSig = parts.v1;
  if (!timestamp || !expectedSig) throw new Error('Cabecera de firma malformada');

  const signedPayload = `${timestamp}.${rawBody.toString('utf8')}`;
  const computedSig = crypto.createHmac('sha256', secret).update(signedPayload).digest('hex');

  const a = Buffer.from(computedSig, 'utf8');
  const b = Buffer.from(expectedSig, 'utf8');
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    throw new Error('Firma no coincide');
  }

  // Prevención de replay: rechazar eventos con timestamp de más de 5 minutos de antigüedad
  const age = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (age > 300) throw new Error('Timestamp del webhook fuera de rango (posible replay)');

  return JSON.parse(rawBody.toString('utf8'));
}

/**
 * Verifica la firma HMAC-SHA256 de Coinbase Commerce.
 *
 * ⚠️ AUDITORÍA DE SEGURIDAD — análisis de protección contra replay:
 * a diferencia de Stripe y Revolut, el esquema de firma de Coinbase
 * Commerce NO incluye un timestamp en la cabecera de firma — es HMAC
 * puro sobre el body, por lo que no se puede añadir aquí una comprobación
 * de antigüedad sin inventar una fuente de tiempo que Coinbase no firma
 * (eso sería una protección falsa, no real).
 * Mitigación real ya existente: la idempotencia por `event_id` en
 * `isPaymentEventProcessed()` (ver más abajo, en el handler de la ruta)
 * impide que un mismo webhook capturado y reenviado genere una segunda
 * licencia o procese dos veces el mismo pago — el impacto práctico de
 * un replay ya queda neutralizado aunque no se rechace explícitamente
 * por antigüedad.
 */
function verifyCoinbaseSignature(rawBody, signatureHeader, secret) {
  const computedSig = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');

  const a = Buffer.from(computedSig, 'utf8');
  const b = Buffer.from(signatureHeader, 'utf8');
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    throw new Error('Firma no coincide');
  }

  return JSON.parse(rawBody.toString('utf8'));
}

/**
 * Verifica la firma de un webhook de Revolut.
 * Esquema documentado por Revolut: payload_to_sign = "v1.{timestamp}.{raw_body}",
 * HMAC-SHA256 con el signing secret, comparado contra el header Revolut-Signature
 * (formato "v1=<hex>"). El header puede contener varias firmas separadas por
 * espacio durante una rotación de secret; basta con que una coincida.
 */
function verifyRevolutSignature(rawBody, signatureHeader, timestampHeader, secret) {
  const payloadToSign = `v1.${timestampHeader}.${rawBody.toString('utf8')}`;
  const computedSig = 'v1=' + crypto.createHmac('sha256', secret).update(payloadToSign).digest('hex');

  const candidates = signatureHeader.split(' ').map(s => s.trim()).filter(Boolean);
  const a = Buffer.from(computedSig, 'utf8');

  const matches = candidates.some(candidate => {
    const b = Buffer.from(candidate, 'utf8');
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  });

  if (!matches) throw new Error('Firma no coincide');

  // Prevención de replay: rechazar eventos con timestamp de más de 5 minutos de antigüedad
  const age = Math.abs(Date.now() - Number(timestampHeader)) / 1000;
  if (age > 300) throw new Error('Timestamp del webhook fuera de rango (posible replay)');

  return JSON.parse(rawBody.toString('utf8'));
}

/** Obtiene el detalle completo de un order de Revolut (incluye merchant_order_data.reference y amount) */
async function fetchRevolutOrder(orderId) {
  const res = await fetch(`${revolutApiBase()}/api/orders/${orderId}`, {
    headers: {
      'Authorization': `Bearer ${process.env.REVOLUT_API_KEY}`,
      'Revolut-Api-Version': '2024-09-01'
    }
  });
  if (!res.ok) throw new Error(`No se pudo recuperar el order ${orderId} de Revolut (status ${res.status})`);
  return res.json();
}

/** Base URL de la Merchant API de Revolut según el entorno (sandbox o producción) */
function revolutApiBase() {
  return process.env.REVOLUT_ENV === 'live'
    ? 'https://merchant.revolut.com'
    : 'https://sandbox-merchant.revolut.com';
}

/** Verifica un webhook de PayPal delegando en su endpoint oficial de verificación */
async function verifyPaypalWebhook(headers, eventBody) {
  const accessToken = await getPaypalAccessToken();

  const res = await fetch(`${paypalApiBase()}/v1/notifications/verify-webhook-signature`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      auth_algo: headers['paypal-auth-algo'],
      cert_url: headers['paypal-cert-url'],
      transmission_id: headers['paypal-transmission-id'],
      transmission_sig: headers['paypal-transmission-sig'],
      transmission_time: headers['paypal-transmission-time'],
      webhook_id: process.env.PAYPAL_WEBHOOK_ID,
      webhook_event: eventBody
    })
  });

  if (!res.ok) return false;
  const data = await res.json();
  return data.verification_status === 'SUCCESS';
}

/**
 * Lógica común de revocación por chargeback (sección 15.1 del proyecto).
 * Busca la licencia por payment_ref, la revoca, limpia sesiones y notifica.
 */
async function handleChargebackByPaymentRef(provider, paymentRef, ip) {
  const license = getLicenseByPaymentRef(provider, paymentRef);

  if (!license) {
    console.error(`[CHARGEBACK] No se encontró licencia para ${provider}/${paymentRef}`);
    return;
  }

  updateLicense(license.id, { status: 'revoked' });
  deleteSessionsForLicense(license.id);

  audit('LICENSE_REVOKED_CHARGEBACK', { license_id: license.id, ip, detail: `provider=${provider}` });

  sendLicenseRevokedEmail({ to: license.email, reason: 'disputa de pago (chargeback)' }).catch(e =>
    console.error('[EMAIL] Fallo enviando aviso de revocación:', e.message)
  );
}

module.exports = router;
