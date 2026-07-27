/**
 * routes/webhooks.js
 *
 * Recibe la confirmación de pago de cada proveedor y, SOLO entonces, genera
 * la licencia. La clave nunca existe antes de este punto (sección 4 del
 * proyecto: "anti-bypass del pago").
 *
 * Endpoints:
 *   POST /api/webhooks/stripe    → requiere RAW body (firma HMAC local) — SUSCRIPCIONES (Fase 3)
 *
 * server.js se encarga de montar express.raw() en este webhook ANTES de este
 * router, y express.json() global para el resto. Ver comentario en server.js.
 *
 * Fase 3 — modelo de SUSCRIPCIÓN mensual (Stripe): el handler de Stripe ahora
 * procesa varios tipos de evento:
 *   checkout.session.completed        → alta de suscripción (crea la licencia)
 *   invoice.paid                       → renovación recurrente (reactiva/renueva periodo)
 *   customer.subscription.updated      → cambio de plan / cancelación programada
 *   customer.subscription.deleted      → fin de suscripción (status='expired', sesiones cerradas)
 *   invoice.payment_failed             → cobro fallido tras reintentos → 'suspended'
 *   charge.dispute.created             → chargeback → revocación
 *
 * (PayPal / Coinbase / Revolut se retiraron al pasar a Stripe-only: solo
 * Stripe acepta nueva suscripción, así que también se eliminaron sus webhooks
 * históricos y los endpoints 410 de pago único. Toda licencia preexistente de
 * lifetime queda intacta en la DB — este cambio es solo de código de entrada.)
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

// Fuente única de planes válidos (config/plans.js). Antes era un literal local
// ['mini','pro','max'] duplicado en payments.js/admin.js/database.js → drift.
const { VALID_PLANS } = require('../config/plans');

/** Coerce un plan entrante a un id conocido, con 'mini' como conservador. */
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

  // Traer la suscripción para current_period_end + cancel_at_period_end + trial_end.
  // No es fatal si falla: la licencia se crea igual y invoice.paid/subscription.updated
  // rellenarán el periodo más adelante.
  let current_period_ends_at = null;
  let cancel_at_period_end = 0;
  let confirmedPlan = plan;
  // trial_ends_at: ISO del fin del trial de 14 días (solo plan mini, si el
  // checkout lo pidió con trial). pro/max y cualquier suscripción sin trial
  // tienen sub.trial_end === null → dejamos trial_ends_at en null (no en trial).
  let trial_ends_at = null;
  if (subId) {
    try {
      const sub = await fetchStripeSubscription(subId);
      current_period_ends_at = isoFromUnix(sub.current_period_end) || null;
      cancel_at_period_end = sub.cancel_at_period_end ? 1 : 0;
      confirmedPlan = planFromSubscription(sub) || plan;
      // Bug C: coerción explícita a null (no undefined). isoFromUnix(null) es
      // undefined y createLicense/updateSubscription saltarían el INSERT/write
      // del campo → la licencia NUNCA llevaría el flag de trial al alta. null ≠
      // undefined → se persiste NULL (o la fecha futura) según corresponda.
      trial_ends_at = sub.trial_end ? isoFromUnix(sub.trial_end) : null;
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
    current_period_ends_at, trial_ends_at, created_by: 'webhook_stripe_sub'
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
    detail: `email=${email} plan=${confirmedPlan} sub=${subId} trial=${trial_ends_at ? '14d' : 'no'}`
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
  //
  // Trial: un invoice.paid = cobro. OJO al trial de mini: Stripe emite un primer
  // invoice de 0€ (billing_reason='subscription_create', amount_paid=0) justo al
  // aperturar la suscripción — NO es un cobro, es la validación de la tarjeta
  // para el trial. Limpiar trial_ends_at ahí sacaría la licencia del trial a
  // los 0 días: el banner "te quedan 14 días" se evaporaría al instante y la
  // licencia pasaría a contar 5€ en el MRR cobrando 0€. Por eso SOLO limpiamos
  // trial_ends_at cuando hubo cobro real (amount_paid > 0): el primer cobro a
  // los 14 días o cualquier renovación posterior. subscription.updated (trialing
  // → active) también lo limpia → defensa por duplicado consistente.
  const actuallyPaid = (typeof invoice.amount_paid === 'number' && invoice.amount_paid > 0);
  updateSubscription(license.id, {
    status: 'active',
    current_period_ends_at,
    stripe_customer_id: customerId || undefined,
    amount_eur: amount_eur ?? undefined,
    // null explícito fuerza el WRITE (ver bug C). Solo cuando cobró de verdad.
    ...(actuallyPaid ? { trial_ends_at: null } : {})
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
  // Bug C (defensa por duplicado): trial_end llega null cuando el trial ha
  // terminado (Stripe lo pone así al pasar trialing→active). Coercemos null
  // explícito para que updateSubscription lo persista; isoFromUnix(null) sería
  // undefined → setIf lo saltaría → trial Ends_at quedaría stale, la licencia
  // no dejaría nunca de ser "en trial" y el MRR/HUD la contarían mal.
  const trial_ends_at = sub.trial_end ? isoFromUnix(sub.trial_end) : null;

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
    stripe_customer_id: sub.customer || undefined,
    trial_ends_at
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

/** Trae la suscripción de Stripe (para current_period_end / items / trial_end
 *  en checkout.created y subscription.updated). Fija la misma versión de API que
 *  routes/payments.js (STRIPE_API_VERSION) para que `trial_end` y el behavior del
 *  trial sean consistentes entre la creación y la lectura. */
async function fetchStripeSubscription(subId) {
  if (!process.env.STRIPE_SECRET_KEY) throw new Error('STRIPE_SECRET_KEY no configurado');
  const res = await fetch(`https://api.stripe.com/v1/subscriptions/${subId}`, {
    headers: {
      'Authorization': `Bearer ${process.env.STRIPE_SECRET_KEY}`,
      'Stripe-Version': require('../config/stripe-version')
    }
  });
  if (!res.ok) throw new Error(`Stripe devolvió ${res.status}`);
  return res.json();
}

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
