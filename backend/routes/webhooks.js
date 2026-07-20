/**
 * routes/webhooks.js
 *
 * Recibe la confirmación de pago de cada proveedor y, SOLO entonces, genera
 * la licencia. La clave nunca existe antes de este punto (sección 4 del
 * proyecto: "anti-bypass del pago").
 *
 * Endpoints:
 *   POST /api/webhooks/stripe    → requiere RAW body (firma HMAC local) — SUSCRIPCIONES (Fase 3)
 *   POST /api/webhooks/paypal    → requiere JSON parseado (verificación vía API REST de PayPal) — histórico
 *   POST /api/webhooks/coinbase  → requiere RAW body (firma HMAC local) — histórico
 *   POST /api/webhooks/revolut   → requiere RAW body (firma HMAC local) — histórico
 *
 * server.js se encarga de montar express.raw() en los webhooks que usan firma
 * HMAC ANTES de este router, y express.json() global para el resto. Ver
 * comentario en server.js.
 *
 * Fase 3 — modelo de SUSCRIPCIÓN mensual (Stripe): el handler de Stripe ahora
 * procesa varios tipos de evento:
 *   checkout.session.completed        → alta de suscripción (crea la licencia)
 *   invoice.paid                       → renovación recurrente (reactiva/renueva periodo)
 *   customer.subscription.updated      → cambio de plan / cancelación programada
 *   customer.subscription.deleted      → fin de suscripción (status='expired', sesiones cerradas)
 *   invoice.payment_failed             → cobro fallido tras reintentos → 'suspended'
 *   charge.dispute.created             → chargeback → revocación
 * Los webhooks de PayPal/Coinbase/Revolut siguen vivos para eventos
 * históricos (disputas, pagos de lifetime ya emitidos); lifetime se eliminó,
 * así que cualquier alta tardía de estos proveedores se trata como plan='max'
 * billing_model='legacy' (equivalencia con el lifetime anterior).
 *
 * Mapeo de plan: en el alta lo leemos de metadata.plan (lo fijamos nosotros en
 * el checkout); tras una mejora de plan vía Customer Portal, lo inferimos del
 * price.id de la suscripción usando el mapa STRIPE_PRICE_{MINI,PRO,MAX}
 * (configurable en .env), con fallback a metadata.
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
  updateSubscription,
  getLicenseByPaymentRef,
  getLicenseByStripeSubscriptionId,
  deleteSessionsForLicense,
  audit
} = require('../db/database');

const { sendLicenseKeyEmail, sendLicenseRevokedEmail } = require('../utils/mailer');
const { paypalApiBase, getPaypalAccessToken } = require('../utils/paypalAuth');

const VALID_PLANS = ['mini', 'pro', 'max'];
function coerceStripePlan(plan) { return VALID_PLANS.includes(plan) ? plan : 'mini'; }

/** Mapa price-id → plan (para inferir el plan tras una mejora vía Customer Portal). */
const PRICE_TO_PLAN = {};
for (const plan of VALID_PLANS) {
  const id = process.env[`STRIPE_PRICE_${plan.toUpperCase()}`];
  if (id) PRICE_TO_PLAN[id] = plan;
}

/** Dado un objeto subscription de Stripe, determina el plan Nokfi. */
function planFromSubscription(sub) {
  const priceId = sub?.items?.data?.[0]?.price?.id;
  if (priceId && PRICE_TO_PLAN[priceId]) return PRICE_TO_PLAN[priceId];
  if (sub?.metadata?.plan) return coerceStripePlan(sub.metadata.plan);
  return 'mini';
}

/** Convierte un unix epoch (segundos) → ISO string, o undefined si falta. */
function isoFromUnix(unixSeconds) {
  if (!unixSeconds) return undefined;
  const n = Number(unixSeconds);
  if (!Number.isFinite(n)) return undefined;
  return new Date(n * 1000).toISOString();
}

/* ════════════════════════════════════════════════════════════
   STRIPE — SUSCRIPCIONES (Fase 3)
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
    switch (event.type) {
      case 'checkout.session.completed':
        await handleStripeCheckoutCompleted(event, req.ip);
        break;
      case 'invoice.paid':
        await handleStripeInvoicePaid(event, req.ip);
        break;
      case 'customer.subscription.updated':
        await handleStripeSubscriptionUpdated(event, req.ip);
        break;
      case 'customer.subscription.deleted':
        await handleStripeSubscriptionDeleted(event, req.ip);
        break;
      case 'invoice.payment_failed':
        await handleStripeInvoicePaymentFailed(event, req.ip);
        break;
      case 'charge.dispute.created':
        await handleChargebackByPaymentRef('stripe', event.data.object.payment_intent || event.data.object.id, req.ip);
        recordPaymentEvent({ provider: 'stripe', event_id: event.id, event_type: event.type, processed: true });
        break;
      default:
        // Eventos no manejados explícitamente: se registran como procesados
        // para no reintentarlos en bucle.
        recordPaymentEvent({ provider: 'stripe', event_id: event.id, event_type: event.type, processed: true });
    }

    res.json({ received: true });
  } catch (e) {
    console.error('[WEBHOOK STRIPE] Error procesando evento:', e.message);
    res.status(500).json({ error: 'processing_failed' });
  }
});

/** checkout.session.completed — alta inicial de la suscripción → crea la licencia. */
async function handleStripeCheckoutCompleted(event, ip) {
  const session = event.data.object;
  if (session.mode !== 'subscription') {
    // El lifetime de pago único se eliminó; un checkout no-suscripción no
    // debería llegar. Se ignora (no genera licencia obsolena).
    console.warn('[WEBHOOK STRIPE] checkout.session.completed modo %s (no subscription) — ignorado', session.mode);
    recordPaymentEvent({ provider: 'stripe', event_id: event.id, event_type: event.type, processed: true });
    return;
  }

  const email = (session.customer_email || session.metadata?.email || '').toLowerCase();
  const plan = coerceStripePlan(session.metadata?.plan);
  const subId = session.subscription;     // id de la suscripción (string)
  const customerId = session.customer;    // id del customer (string)

  if (!email) {
    console.error('[WEBHOOK STRIPE] checkout.session.completed sin email — no se genera licencia');
    recordPaymentEvent({ provider: 'stripe', event_id: event.id, event_type: event.type, processed: false });
    return;
  }

  // Traer la suscripción para current_period_end + cancel_at_period_end.
  // No es fatal si falla: la licencia se crea igual y invoice.paid/subscription.updated
  // rellenarán el periodo más adelante.
  let current_period_ends_at = null;
  let cancel_at_period_end = 0;
  let confirmedPlan = plan;
  if (subId) {
    try {
      const sub = await fetchStripeSubscription(subId);
      current_period_ends_at = isoFromUnix(sub.current_period_end) || null;
      cancel_at_period_end = sub.cancel_at_period_end ? 1 : 0;
      confirmedPlan = planFromSubscription(sub) || plan;
    } catch (e) {
      console.error('[WEBHOOK STRIPE] no se pudo fetch la suscripción %s: %s', subId, e.message);
    }
  }

  // payment_ref = session.id → compatible con el endpoint /reveal (Fase 1).
  const amount_eur = session.amount_total ? session.amount_total / 100 : null;

  const license = createLicense({
    email, plan: confirmedPlan, payment_provider: 'stripe', payment_ref: session.id,
    amount_eur, billing_model: 'subscription',
    stripe_customer_id: customerId, stripe_subscription_id: subId,
    current_period_ends_at, created_by: 'webhook_stripe_sub'
  });

  if (cancel_at_period_end) {
    updateSubscription(license.id, { cancel_at_period_end: 1 });
  }

  recordPaymentEvent({
    provider: 'stripe', event_id: event.id, event_type: event.type,
    license_id: license.id, amount_eur, processed: true
  });
  audit('LICENSE_CREATED_STRIPE_SUB', {
    license_id: license.id, ip,
    detail: `email=${email} plan=${confirmedPlan} sub=${subId}`
  });

  sendLicenseKeyEmail({ to: email, licenseKey: license.key, plan: confirmedPlan }).catch(e =>
    console.error('[EMAIL] Fallo enviando clave tras suscripción Stripe:', e.message)
  );
}

/** invoice.paid — renovación recurrente (o primer pago). Renueva current_period_ends_at. */
async function handleStripeInvoicePaid(event, ip) {
  const invoice = event.data.object;
  const subId = invoice.subscription;
  const customerId = invoice.customer;
  const isRenewal = invoice.billing_reason === 'subscription_cycle';

  const license = subId ? getLicenseByStripeSubscriptionId(subId) : null;
  if (!license) {
    // Puede llegar antes que checkout.session.completed (orden no garantizado):
    // lo registramos sin procesar para que Stripe reintente.
    console.warn('[WEBHOOK STRIPE] invoice.paid sin licencia (sub=%s) — %s',
      subId, isRenewal ? 'renovación huérfana' : 'primer pago adelantado');
    recordPaymentEvent({ provider: 'stripe', event_id: event.id, event_type: event.type, processed: false });
    return;
  }

  const periodEnd = invoice.lines?.data?.[0]?.period?.end;
  const current_period_ends_at = isoFromUnix(periodEnd) || undefined;
  const amount_eur = (invoice.amount_paid && invoice.currency === 'eur') ? invoice.amount_paid / 100 : null;

  // Una renovación exitosa reactiva la licencia (vuelve de 'suspended' por
  // impago a 'active'). NO tocamos cancel_at_period_end aquí: su fuente de
  // verdad es customer.subscription.updated (si lo reseteáramos aquí, un
  // cancel programado que llegase después borraríamos la bandera por orden).
  updateSubscription(license.id, {
    status: 'active',
    current_period_ends_at,
    stripe_customer_id: customerId || undefined,
    amount_eur: amount_eur ?? undefined
  });

  recordPaymentEvent({
    provider: 'stripe', event_id: event.id, event_type: event.type,
    license_id: license.id, amount_eur, processed: true
  });
  audit(isRenewal ? 'SUBSCRIPTION_RENEWED' : 'SUBSCRIPTION_FIRST_PAID', {
    license_id: license.id, ip, detail: `sub=${subId} amount=${amount_eur}€ ends=${current_period_ends_at}`
  });
}

/** customer.subscription.updated — cambio de plan / cancelación programada. */
async function handleStripeSubscriptionUpdated(event, ip) {
  const sub = event.data.object;
  const license = getLicenseByStripeSubscriptionId(sub.id);
  if (!license) {
    // Llega también al CREAR la suscripción; si checkout.created aún no corrió:
    // lo dejamos como no procesado para que reintente (sin idempotencia rotativa,
    // porque el event.id ya marca este intento concreto).
    console.warn('[WEBHOOK STRIPE] customer.subscription.updated sin licencia (sub=%s) — pendiente', sub.id);
    recordPaymentEvent({ provider: 'stripe', event_id: event.id, event_type: event.type, processed: false });
    return;
  }

  const plan = planFromSubscription(sub);
  const current_period_ends_at = isoFromUnix(sub.current_period_end);
  const cancel_at_period_end = sub.cancel_at_period_end ? 1 : 0;

  // Mapeo de stripe subscription.status → status interno Nokfi.
  let status;
  if (['canceled', 'unpaid', 'incomplete_expired'].includes(sub.status)) {
    status = 'expired';
  } else if (sub.status === 'past_due') {
    // Cobro fallido pero con reintentos en curso: suspendemos el acceso YA
    // (anti-abuso: no seguir usando sin pagar) — se reactiva con invoice.paid.
    status = 'suspended';
  } else {
    status = 'active'; // trialing | active
  }

  updateSubscription(license.id, {
    plan, status,
    current_period_ends_at,
    cancel_at_period_end,
    stripe_customer_id: sub.customer || undefined
  });

  const prevPlan = license.plan;
  if (status === 'expired') {
    // La cancelación efectiva (fin de periodo) la trata subscription.deleted;
    // aquí rara vez llega 'canceled' directo, pero nos cubrimos.
    deleteSessionsForLicense(license.id);
    audit('SUBSCRIPTION_EXPIRED', { license_id: license.id, ip, detail: `sub=${sub.id} stripe_status=${sub.status}` });
  } else if (status === 'suspended') {
    audit('SUBSCRIPTION_SUSPENDED', { license_id: license.id, ip, detail: `sub=${sub.id} past_due` });
  } else if (cancel_at_period_end) {
    audit('SUBSCRIPTION_CANCEL_SCHEDULED', { license_id: license.id, ip, detail: `sub=${sub.id} ends=${current_period_ends_at}` });
  } else if (prevPlan !== plan) {
    audit('SUBSCRIPTION_PLAN_CHANGED', { license_id: license.id, ip, detail: `${prevPlan} → ${plan}` });
  } else {
    audit('SUBSCRIPTION_UPDATED', { license_id: license.id, ip, detail: `sub=${sub.id} plan=${plan} status=${status}` });
  }

  recordPaymentEvent({ provider: 'stripe', event_id: event.id, event_type: event.type, license_id: license.id, processed: true });
}

/** customer.subscription.deleted — fin definitivo de la suscripción. */
async function handleStripeSubscriptionDeleted(event, ip) {
  const sub = event.data.object;
  const license = getLicenseByStripeSubscriptionId(sub.id);
  if (!license) {
    console.warn('[WEBHOOK STRIPE] customer.subscription.deleted sin licencia (sub=%s)', sub.id);
    recordPaymentEvent({ provider: 'stripe', event_id: event.id, event_type: event.type, processed: true });
    return;
  }

  updateSubscription(license.id, {
    status: 'expired',
    cancel_at_period_end: 1,
    current_period_ends_at: isoFromUnix(sub.ended_at || sub.current_period_end)
  });
  deleteSessionsForLicense(license.id);

  audit('SUBSCRIPTION_DELETED', { license_id: license.id, ip, detail: `sub=${sub.id}` });
  recordPaymentEvent({ provider: 'stripe', event_id: event.id, event_type: event.type, license_id: license.id, processed: true });
}

/** invoice.payment_failed — cobro fallido. Marca 'suspended' (acceso cortado ya,
 *  Stripe reintenta; al llegar invoice.paid se reactiva). */
async function handleStripeInvoicePaymentFailed(event, ip) {
  const invoice = event.data.object;
  const subId = invoice.subscription;
  const license = subId ? getLicenseByStripeSubscriptionId(subId) : null;
  if (!license) {
    console.warn('[WEBHOOK STRIPE] invoice.payment_failed sin licencia (sub=%s)', subId);
    recordPaymentEvent({ provider: 'stripe', event_id: event.id, event_type: event.type, processed: true });
    return;
  }

  // Solo suspendemos si seguía activa — evita pisar un 'revoked' manual del admin.
  if (license.status === 'active') {
    updateSubscription(license.id, { status: 'suspended' });
    deleteSessionsForLicense(license.id);
    audit('SUBSCRIPTION_PAYMENT_FAILED', { license_id: license.id, ip, detail: `sub=${subId} attempt=${invoice.attempt_count}` });
  }

  recordPaymentEvent({ provider: 'stripe', event_id: event.id, event_type: event.type, license_id: license.id, processed: true });
}

/** Trae la suscripción de Stripe (para current_period_end / items en checkout.created). */
async function fetchStripeSubscription(subId) {
  if (!process.env.STRIPE_SECRET_KEY) throw new Error('STRIPE_SECRET_KEY no configurado');
  const res = await fetch(`https://api.stripe.com/v1/subscriptions/${subId}`, {
    headers: { 'Authorization': `Bearer ${process.env.STRIPE_SECRET_KEY}` }
  });
  if (!res.ok) throw new Error(`Stripe devolvió ${res.status}`);
  return res.json();
}

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
      let email = '';
      try {
        const parsed = JSON.parse(customId || '{}');
        email = (parsed.email || '').toLowerCase();
      } catch (_) { /* custom_id ausente o malformado — se gestiona abajo */ }

      if (!email) {
        console.error('[WEBHOOK PAYPAL] Evento sin email asociado, no se puede generar licencia');
        recordPaymentEvent({ provider: 'paypal', event_id: eventId, event_type: event.event_type, processed: false });
        return res.status(200).json({ received: true, warning: 'no_email' });
      }

      const amount_eur = parseFloat(
        resource?.amount?.value || resource?.purchase_units?.[0]?.amount?.value || 0
      );

      // Lifetime histórico (PayPal no soporta recurring en esta fase) → max/legacy.
      const license = createLicense({
        email, plan: 'max', payment_provider: 'paypal', payment_ref: resource.id, amount_eur,
        billing_model: 'legacy', created_by: 'webhook_paypal'
      });

      recordPaymentEvent({
        provider: 'paypal', event_id: eventId, event_type: event.event_type,
        license_id: license.id, amount_eur, processed: true
      });

      audit('LICENSE_CREATED_PAYPAL', { license_id: license.id, ip: req.ip, detail: `email=${email}` });

      sendLicenseKeyEmail({ to: email, licenseKey: license.key, plan: 'max' }).catch(e =>
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

      if (!email) {
        console.error('[WEBHOOK COINBASE] Charge confirmado sin email en metadata');
        recordPaymentEvent({ provider: 'coinbase', event_id: eventId, event_type: event.event.type, processed: false });
        return res.status(200).json({ received: true, warning: 'no_email' });
      }

      const amount_eur = parseFloat(charge.pricing?.local?.amount || 0);

      // Lifetime histórico (Coinbase no soporta recurring en esta fase) → max/legacy.
      const license = createLicense({
        email, plan: 'max', payment_provider: 'coinbase', payment_ref: charge.id, amount_eur,
        billing_model: 'legacy', created_by: 'webhook_coinbase'
      });

      recordPaymentEvent({
        provider: 'coinbase', event_id: eventId, event_type: event.event.type,
        license_id: license.id, amount_eur, processed: true
      });

      audit('LICENSE_CREATED_COINBASE', { license_id: license.id, ip: req.ip, detail: `email=${email}` });

      sendLicenseKeyEmail({ to: email, licenseKey: license.key, plan: 'max' }).catch(e =>
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

      let email = '';
      try {
        const parsed = JSON.parse(order.merchant_order_data?.reference || '{}');
        email = (parsed.email || '').toLowerCase();
      } catch (_) { /* reference ausente o malformada — se gestiona abajo */ }

      if (!email) {
        console.error('[WEBHOOK REVOLUT] ORDER_COMPLETED sin email en la referencia del order');
        recordPaymentEvent({ provider: 'revolut', event_id: eventId, event_type: event.event, processed: false });
        return res.status(200).json({ received: true, warning: 'no_email' });
      }

      const amount_eur = typeof order.order_amount?.value === 'number'
        ? order.order_amount.value / 100
        : 0;

      // Lifetime histórico (Revolut no soporta recurring en esta fase) → max/legacy.
      const license = createLicense({
        email, plan: 'max', payment_provider: 'revolut', payment_ref: event.order_id, amount_eur,
        billing_model: 'legacy', created_by: 'webhook_revolut'
      });

      recordPaymentEvent({
        provider: 'revolut', event_id: eventId, event_type: event.event,
        license_id: license.id, amount_eur, processed: true
      });

      audit('LICENSE_CREATED_REVOLUT', { license_id: license.id, ip: req.ip, detail: `email=${email}` });

      sendLicenseKeyEmail({ to: email, licenseKey: license.key, plan: 'max' }).catch(e =>
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
