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
 *   invoice.payment_failed             → renovación rechazada → se para la suscripción
 *                                        y la cuenta queda bloqueada (S15b, U4)
 *   charge.dispute.created             → chargeback → revocación
 *   checkout.session.completed (mode=payment, metadata.kind=credit_pack)
 *   checkout.session.async_payment_succeeded → paquete de créditos pagado:
 *                                        suma los créditos UNA vez por sesión (S15b, U1)
 *
 * S15b: un evento que llega antes que la licencia (orden no garantizado) se
 * guarda processed=0 y se responde 503 para que Stripe lo reintente (antes 200:
 * Stripe no reintentaba nunca). Solo dentro de PENDING_RETRY_WINDOW_S desde que
 * Stripe creó el evento; más tarde ya no va a casar y se responde 200.
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
  getLicenseByPaymentIntent,
  getLicenseByStripeSubscriptionId,
  deleteSessionsForLicense,
  audit
} = require('../db/database');

const { sendLicenseKeyEmail, sendLicenseRevokedEmail } = require('../utils/mailer');
const { fetchWithTimeout } = require('../utils/http');
const { stripeApi, isGone } = require('../utils/stripe');
const { getDB, getLicenseById } = require('../db/database');

/** Ventana en la que un evento sin licencia se devuelve con 503 para que Stripe
 *  lo reintente (los desórdenes reales se resuelven en segundos o minutos). */
const PENDING_RETRY_WINDOW_S = 6 * 3600;
const PENDING = { pending: true };

// Fuente única de planes válidos (config/plans.js). Antes era un literal local
// ['mini','pro','max'] duplicado en payments.js/admin.js/database.js → drift.
const { VALID_PLANS, CREDIT_PACKS } = require('../config/plans');
const { grantPack, purchaseByPaymentIntent } = require('../db/credits');

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

/* ── Compatibilidad de versiones de la API de Stripe (S15) ───────────────────
 * Los EVENTOS llegan con la versión del endpoint de webhook (en prod,
 * 2026-06-24.dahlia), no con la que fijamos en las llamadas salientes
 * (config/stripe-version.js). Desde 2025-03-31 (basil) Stripe movió:
 *   invoice.subscription      → invoice.parent.subscription_details.subscription
 *   invoice.payment_intent    → invoice.payments.data[].payment.payment_intent
 *   subscription.current_period_end → subscription.items.data[].current_period_end
 * Estos helpers leen los dos formatos. */
function idOf(v) { return (v && typeof v === 'object') ? v.id : (v || null); }

function invoiceSubscriptionId(invoice) {
  if (!invoice) return null;
  return idOf(invoice.subscription)
    || idOf(invoice.parent?.subscription_details?.subscription)
    || idOf(invoice.lines?.data?.find((l) => l?.parent?.subscription_item_details?.subscription)
      ?.parent?.subscription_item_details?.subscription)
    || idOf(invoice.lines?.data?.find((l) => l?.subscription)?.subscription)
    || null;
}

function invoicePaymentIntentId(invoice) {
  if (!invoice) return null;
  if (invoice.payment_intent) return idOf(invoice.payment_intent);
  const pay = invoice.payments?.data?.find((p) => p?.payment?.payment_intent);
  return pay ? idOf(pay.payment.payment_intent) : null;
}

/** Fin del trial SOLO si la suscripción sigue en prueba. Al acabar el trial
 *  antes de tiempo (cambio de plan o tarjeta que ya tuvo trial), Stripe deja
 *  trial_end con la hora del cambio: guardarlo dejaba trial_ends_at con una fecha
 *  pasada en vez de null (P3). */
function trialEndIso(sub) {
  return (sub?.status === 'trialing' && sub.trial_end) ? isoFromUnix(sub.trial_end) : null;
}

function subscriptionPeriodEnd(sub) {
  if (!sub) return undefined;
  if (sub.current_period_end) return sub.current_period_end;
  const ends = (sub.items?.data || []).map((i) => Number(i?.current_period_end)).filter(Number.isFinite);
  return ends.length ? Math.max(...ends) : undefined;
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
    let result;
    switch (event.type) {
      case 'checkout.session.completed':
        await handleStripeCheckoutCompleted(event, req.ip);
        break;
      case 'checkout.session.async_payment_succeeded':
        // S15b (U1): un paquete pagado con un método asíncrono se acredita aquí.
        if (event.data.object?.metadata?.kind === 'credit_pack') await handleCreditPackPaid(event, event.data.object, req.ip);
        else recordPaymentEvent({ provider: 'stripe', event_id: event.id, event_type: event.type, processed: true });
        break;
      case 'invoice.paid':
        result = await handleStripeInvoicePaid(event, req.ip);
        break;
      case 'customer.subscription.updated':
        result = await handleStripeSubscriptionUpdated(event, req.ip);
        break;
      case 'customer.subscription.deleted':
        await handleStripeSubscriptionDeleted(event, req.ip);
        break;
      case 'invoice.payment_failed':
        await handleStripeInvoicePaymentFailed(event, req.ip);
        break;
      case 'charge.dispute.created': {
        // Sesión 2 (#1/#16): la revocación solo marca el evento como procesado
        // si realmente encontró y revocó la licencia. Si no, 500 → Stripe
        // reintenta el evento (antes se tragaba el contracargo en silencio).
        const revoked = await handleChargebackByPaymentRef('stripe', event.data.object, req.ip);
        recordPaymentEvent({
          provider: 'stripe', event_id: event.id, event_type: event.type,
          license_id: revoked ? revoked.id : null, processed: !!revoked
        });
        if (!revoked) {
          return res.status(500).json({ error: 'dispute_unresolved' });
        }
        break;
      }
      default:
        // Eventos no manejados explícitamente: se registran como procesados
        // para no reintentarlos en bucle.
        recordPaymentEvent({ provider: 'stripe', event_id: event.id, event_type: event.type, processed: true });
    }

    // P5: pendiente (llegó antes que la licencia) → no-2xx para que Stripe reintente.
    if (result === PENDING) {
      const age = Date.now() / 1000 - Number(event.created || 0);
      if (!event.created || age < PENDING_RETRY_WINDOW_S) {
        return res.status(503).json({ error: 'event_pending', retry: true });
      }
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
  if (session.mode === 'payment' && session.metadata?.kind === 'credit_pack') {
    return handleCreditPackPaid(event, session, ip);
  }
  if (session.mode !== 'subscription') {
    // El lifetime de pago único se eliminó; un checkout no-suscripción no
    // debería llegar. Se ignora (no genera licencia obsolena).
    console.warn('[WEBHOOK STRIPE] checkout.session.completed modo %s (no subscription) — ignorado', session.mode);
    recordPaymentEvent({ provider: 'stripe', event_id: event.id, event_type: event.type, processed: true });
    return;
  }

  const email = (session.customer_email || session.metadata?.email || session.customer_details?.email || '').toLowerCase();
  const plan = coerceStripePlan(session.metadata?.plan);
  const subId = session.subscription;     // id de la suscripción (string)
  const customerId = session.customer;    // id del customer (string)

  // S15b (U4): pago de un plan nuevo desde una cuenta bloqueada por impago →
  // misma licencia (no se crea otra clave), suscripción nueva y desbloqueo.
  if (session.metadata?.resume_license_id) {
    return resumeBlockedLicense(event, session, ip);
  }

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
      current_period_ends_at = isoFromUnix(subscriptionPeriodEnd(sub)) || null;
      cancel_at_period_end = sub.cancel_at_period_end ? 1 : 0;
      confirmedPlan = planFromSubscription(sub) || plan;
      // Bug C: coerción explícita a null (no undefined). isoFromUnix(null) es
      // undefined y createLicense/updateSubscription saltarían el INSERT/write
      // del campo → la licencia NUNCA llevaría el flag de trial al alta. null ≠
      // undefined → se persiste NULL (o la fecha futura) según corresponda.
      trial_ends_at = trialEndIso(sub);
      // P4 (Q4): una tarjeta que ya tuvo trial no repite prueba → se acaba hoy y
      // se cobra el primer mes. Nunca lanza (un fallo aquí no puede duplicar la licencia).
      if (trial_ends_at) {
        const t = await enforceSingleTrialPerCard(sub, ip);
        if (t.ended) {
          trial_ends_at = null;
          current_period_ends_at = t.current_period_ends_at || current_period_ends_at;
        }
      }
    } catch (e) {
      console.error('[WEBHOOK STRIPE] no se pudo fetch la suscripción %s: %s', subId, e.message);
    }
  }

  // payment_ref = session.id → compatible con el endpoint /reveal (Fase 1).
  // payment_intent_ref = session.payment_intent (pi_…): en modo subscription
  // suele venir null (el cobro lo hace el invoice, no la sesión); si viene, lo
  // guardamos. La fuente fiable del pi_… es invoice.paid (ver abajo) — hace
  // falta para localizar la licencia cuando llega un charge.dispute.created.
  const amount_eur = session.amount_total ? session.amount_total / 100 : null;

  const license = createLicense({
    email, plan: confirmedPlan, payment_provider: 'stripe', payment_ref: session.id,
    payment_intent_ref: session.payment_intent || null,
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
  const subId = invoiceSubscriptionId(invoice);
  const customerId = invoice.customer;
  const isRenewal = invoice.billing_reason === 'subscription_cycle';

  const license = subId ? getLicenseByStripeSubscriptionId(subId) : null;
  if (!license) {
    // Deuda K: el 1er invoice.paid de un trial (billing_reason='subscription_create',
    // 0€, sin invoice.subscription) es un invoice de apertura que no aporta nada: la
    // licencia ya la creó checkout.session.completed, e invoice.paid NO crea
    // licencias (solo renueva). Antes quedaba como processed:false -> fila "sin
    // procesar" eterna en payment_events + warn en cada alta con trial. Ahora es un
    // no-op reconocido (processed:true + audit), SIN tocar el caso genuino de abajo.
    if (invoice.billing_reason === 'subscription_create' && Number(invoice.amount_paid) === 0) {
      recordPaymentEvent({
        provider: 'stripe', event_id: event.id, event_type: event.type,
        amount_eur: 0, processed: true
      });
      audit('INVOICE_PAID_TRIAL_OPEN_NOOP', {
        ip, detail: `customer=${customerId || '?'} 0€ - apertura trial, licencia ya creada`
      });
      return;
    }
    // Caso genuino (no apertura de trial): sin licencia mapeada -> flagear
    // processed:false para que quede visible en reconciliacion.
    // Puede llegar antes que checkout.session.completed (orden no garantizado):
    // lo registramos sin procesar para que Stripe reintente.
    console.warn('[WEBHOOK STRIPE] invoice.paid sin licencia (sub=%s) — %s',
      subId, isRenewal ? 'renovación huérfana' : 'primer pago adelantado');
    recordPaymentEvent({ provider: 'stripe', event_id: event.id, event_type: event.type, processed: false });
    return PENDING;
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
  // S15b: una cuenta bloqueada por impago solo se reactiva pagando un plan nuevo
  // (resume-checkout); un evento tardío de la suscripción parada no la desbloquea.
  updateSubscription(license.id, {
    status: license.blocked_reason ? undefined : 'active',
    current_period_ends_at,
    stripe_customer_id: customerId || undefined,
    amount_eur: amount_eur ?? undefined,
    // pi_… del cobro: es la referencia por la que llegan los chargebacks
    // (charge.dispute.created). En modo suscripción el checkout NO lo trae, así
    // que invoice.paid es la fuente fiable que rellena payment_intent_ref.
    payment_intent_ref: (await resolveInvoicePaymentIntent(invoice)) || undefined,
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
    // Una suscripción ya terminada (p. ej. la parada por impago o la de una
    // cuenta borrada) nunca va a casar: no se pide reintento.
    const finished = ['canceled', 'incomplete_expired'].includes(sub.status);
    console.warn('[WEBHOOK STRIPE] customer.subscription.updated sin licencia (sub=%s) — %s', sub.id, finished ? 'terminada' : 'pendiente');
    recordPaymentEvent({ provider: 'stripe', event_id: event.id, event_type: event.type, processed: finished });
    return finished ? undefined : PENDING;
  }

  const plan = planFromSubscription(sub);
  const current_period_ends_at = isoFromUnix(subscriptionPeriodEnd(sub));
  const cancel_at_period_end = sub.cancel_at_period_end ? 1 : 0;
  // Bug C (defensa por duplicado): al terminar el trial se persiste null
  // explícito (isoFromUnix(null) sería undefined → setIf lo saltaría y la
  // licencia quedaría "en trial" para siempre). S15b (P3): Stripe deja trial_end
  // con la hora del cambio cuando el trial acaba antes de tiempo; solo cuenta si
  // la suscripción sigue en 'trialing'.
  const trial_ends_at = trialEndIso(sub);

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
  // S15b: bloqueada por impago → sigue bloqueada hasta pagar un plan nuevo.
  if (license.blocked_reason && status === 'active') status = license.status;

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
    current_period_ends_at: isoFromUnix(sub.ended_at || subscriptionPeriodEnd(sub))
  });
  deleteSessionsForLicense(license.id);

  audit('SUBSCRIPTION_DELETED', { license_id: license.id, ip, detail: `sub=${sub.id}` });
  recordPaymentEvent({ provider: 'stripe', event_id: event.id, event_type: event.type, license_id: license.id, processed: true });
}

/** invoice.payment_failed — S15b (U4): una renovación rechazada (o el primer
 *  cobro al acabar el trial) PARA la suscripción y BLOQUEA la cuenta con
 *  blocked_reason='payment_failed': «hasta que no renueves la suscripción no
 *  puedes usar la cuenta». Se reanuda pagando un plan nuevo (resume-checkout).
 *  La suscripción se cancela ya en Stripe y la factura fallida se anula, para
 *  que Stripe no siga reintentando el cobro por su cuenta. Si Stripe no responde
 *  se lanza → 500 → Stripe reintenta el evento (el bloqueo ya está guardado).
 *  El alta (billing_reason='subscription_create') no bloquea: ese cobro lo
 *  gestiona Checkout y sin pago no hay licencia. */
async function handleStripeInvoicePaymentFailed(event, ip) {
  const invoice = event.data.object;
  const subId = invoiceSubscriptionId(invoice);
  const license = subId ? getLicenseByStripeSubscriptionId(subId) : null;
  if (!license) {
    console.warn('[WEBHOOK STRIPE] invoice.payment_failed sin licencia (sub=%s)', subId);
    recordPaymentEvent({ provider: 'stripe', event_id: event.id, event_type: event.type, processed: true });
    return;
  }

  if (invoice.billing_reason === 'subscription_create' || license.status === 'revoked') {
    recordPaymentEvent({ provider: 'stripe', event_id: event.id, event_type: event.type, license_id: license.id, processed: true });
    return;
  }

  if (license.blocked_reason !== 'payment_failed') {
    updateSubscription(license.id, { status: 'suspended', blocked_reason: 'payment_failed' });
    deleteSessionsForLicense(license.id);
    audit('SUBSCRIPTION_PAYMENT_FAILED', { license_id: license.id, ip, detail: `sub=${subId} reason=${invoice.billing_reason || '?'} attempt=${invoice.attempt_count} → bloqueada` });
  }

  // Parar la suscripción en Stripe (sin prorrata ni factura final) y anular la factura.
  if (process.env.STRIPE_SECRET_KEY) {
    const del = await stripeApi('DELETE', `subscriptions/${encodeURIComponent(subId)}`, { invoice_now: 'false', prorate: 'false' });
    if (!del.ok && !isGone(del) && !/canceled/i.test(del.data?.error?.message || '')) {
      throw new Error(`no se pudo parar la suscripción ${subId}: ${del.status} ${del.data?.error?.code || ""}`);
    }
    if (invoice.id && invoice.status !== 'void') {
      const v = await stripeApi('POST', `invoices/${encodeURIComponent(invoice.id)}/void`);
      if (!v.ok) console.warn('[WEBHOOK STRIPE] no se pudo anular la factura %s: %s', invoice.id, v.data?.error?.message);
    }
    audit('SUBSCRIPTION_STOPPED_PAYMENT_FAILED', { license_id: license.id, ip, detail: `sub=${subId} invoice=${invoice.id || '?'}` });
  } else {
    console.warn('[WEBHOOK STRIPE] sin STRIPE_SECRET_KEY: la suscripción %s no se ha parado en Stripe', subId);
  }

  recordPaymentEvent({ provider: 'stripe', event_id: event.id, event_type: event.type, license_id: license.id, processed: true });
}

/**
 * S15b (U1): paquete de créditos pagado (Checkout mode=payment). Acredita los
 * créditos del paquete UNA sola vez por Checkout Session (credit_purchases con
 * stripe_session_id UNIQUE): aunque Stripe repita el evento, o lleguen
 * checkout.session.completed y async_payment_succeeded de la misma sesión, el
 * saldo solo sube una vez. Si el pago aún no está cobrado (método asíncrono),
 * no se acredita: lo hará checkout.session.async_payment_succeeded.
 */
async function handleCreditPackPaid(event, session, ip) {
  const md = session.metadata || {};
  const pack = CREDIT_PACKS[md.pack];
  const license = getLicenseById(Number(md.license_id));
  if (session.payment_status !== 'paid') {
    audit('CREDIT_PACK_UNPAID', { license_id: license?.id || null, ip, detail: `session=${session.id} status=${session.payment_status}` });
    recordPaymentEvent({ provider: 'stripe', event_id: event.id, event_type: event.type, license_id: license?.id || null, processed: true });
    return;
  }
  if (!pack || !license) {
    // Pagado pero sin paquete o cuenta reconocibles (cuenta borrada entre el pago y el
    // evento): no hay a quién acreditar; queda en el registro para devolverlo a mano.
    console.error('[WEBHOOK STRIPE] paquete de créditos sin cuenta o paquete válido: session=%s pack=%s license=%s', session.id, md.pack, md.license_id);
    audit('CREDIT_PACK_ORPHAN', { ip, detail: `session=${session.id} pack=${md.pack} license=${md.license_id} amount=${session.amount_total}` });
    recordPaymentEvent({ provider: 'stripe', event_id: event.id, event_type: event.type, processed: true });
    return;
  }
  if (session.amount_total != null && Number(session.amount_total) !== pack.cents) {
    console.warn('[WEBHOOK STRIPE] paquete %s cobrado por %s céntimos (catálogo: %s): revisar el Price de Stripe', md.pack, session.amount_total, pack.cents);
  }
  const r = grantPack({
    license_id: license.id, pack: md.pack, credits: pack.credits,
    amount_cents: session.amount_total ?? null, currency: session.currency || null,
    session_id: session.id, payment_intent: idOf(session.payment_intent), livemode: !!session.livemode
  });
  audit(r.credited ? 'CREDIT_PACK_PURCHASED' : 'CREDIT_PACK_DUPLICATE', {
    license_id: license.id, ip, detail: `pack=${md.pack} credits=${pack.credits} session=${session.id} balance=${r.balance}`
  });
  recordPaymentEvent({
    provider: 'stripe', event_id: event.id, event_type: event.type, license_id: license.id,
    amount_eur: session.amount_total != null ? Number(session.amount_total) / 100 : null, processed: true
  });
}

/** S15b (U4): checkout.session.completed de resume-checkout → reactiva la misma licencia. */
async function resumeBlockedLicense(event, session, ip) {
  const license = getLicenseById(Number(session.metadata.resume_license_id));
  if (!license) {
    console.warn('[WEBHOOK STRIPE] reanudar: licencia %s ya no existe', session.metadata.resume_license_id);
    recordPaymentEvent({ provider: 'stripe', event_id: event.id, event_type: event.type, processed: true });
    return;
  }
  const subId = session.subscription;
  let plan = coerceStripePlan(session.metadata?.plan);
  let current_period_ends_at;
  try {
    const sub = await fetchStripeSubscription(subId);
    plan = planFromSubscription(sub) || plan;
    current_period_ends_at = isoFromUnix(subscriptionPeriodEnd(sub));
  } catch (e) {
    console.error('[WEBHOOK STRIPE] reanudar: no se pudo leer la suscripción %s: %s', subId, e.message);
  }
  const amount_eur = session.amount_total ? session.amount_total / 100 : undefined;
  updateSubscription(license.id, {
    plan, status: 'active', blocked_reason: null, billing_model: 'subscription',
    stripe_subscription_id: subId, stripe_customer_id: session.customer || undefined,
    current_period_ends_at, cancel_at_period_end: 0, trial_ends_at: null, amount_eur
  });
  recordPaymentEvent({ provider: 'stripe', event_id: event.id, event_type: event.type, license_id: license.id, amount_eur: amount_eur ?? null, processed: true });
  audit('SUBSCRIPTION_RESUMED', { license_id: license.id, ip, detail: `plan=${plan} sub=${subId}` });
}

/** S15b (P4, Q4): huella de la tarjeta del trial. Si ya tuvo trial, se acaba la
 *  prueba ahora (Stripe cobra el primer mes; si el cobro falla llega
 *  invoice.payment_failed y la cuenta queda bloqueada). Si no, se guarda la
 *  huella. No lanza nunca: sin huella (fallo de red) se deja el trial. */
async function enforceSingleTrialPerCard(sub, ip) {
  try {
    if (!process.env.STRIPE_SECRET_KEY) return { ended: false };
    const pmId = idOf(sub.default_payment_method);
    if (!pmId) return { ended: false };
    const pm = await stripeApi('GET', `payment_methods/${encodeURIComponent(pmId)}`);
    const fingerprint = pm.ok ? pm.data?.card?.fingerprint : null;
    if (!fingerprint) return { ended: false };
    const seen = getDB().prepare('SELECT 1 FROM trial_fingerprints WHERE fingerprint = ?').get(fingerprint);
    if (!seen) {
      getDB().prepare('INSERT OR IGNORE INTO trial_fingerprints (fingerprint) VALUES (?)').run(fingerprint);
      return { ended: false };
    }
    const up = await stripeApi('POST', `subscriptions/${encodeURIComponent(sub.id)}`, { trial_end: 'now', proration_behavior: 'none' });
    if (!up.ok) {
      console.error('[WEBHOOK STRIPE] no se pudo acabar el trial repetido de %s: %s', sub.id, up.data?.error?.message);
      return { ended: false };
    }
    audit('TRIAL_REPEATED_CARD', { ip, detail: `sub=${sub.id} sin trial: la tarjeta ya tuvo uno` });
    return { ended: true, current_period_ends_at: isoFromUnix(subscriptionPeriodEnd(up.data)) };
  } catch (e) {
    console.error('[WEBHOOK STRIPE] anti-trial: %s', e.message);
    return { ended: false };
  }
}

/** Trae la suscripción de Stripe (para current_period_end / items / trial_end
 *  en checkout.created y subscription.updated). Fija la misma versión de API que
 *  routes/payments.js (STRIPE_API_VERSION) para que `trial_end` y el behavior del
 *  trial sean consistentes entre la creación y la lectura. */
async function fetchStripeSubscription(subId) {
  if (!process.env.STRIPE_SECRET_KEY) throw new Error('STRIPE_SECRET_KEY no configurado');
  // Timeout 30s: si la API de Stripe cuelga, el webhook falla rápido y Stripe
  // reintenta el evento — mejor que un worker de PM2 con el socket colgado.
  const res = await fetchWithTimeout(`https://api.stripe.com/v1/subscriptions/${subId}`, {
    headers: {
      'Authorization': `Bearer ${process.env.STRIPE_SECRET_KEY}`,
      'Stripe-Version': require('../config/stripe-version')
    }
  }, 30000);
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
 *
 * Recibe el objeto DISPUTE completo (no un id suelto). El bug original
 * (sesión 2, #1/#16): se buscaba la licencia haciendo coincidir el
 * payment_intent (pi_…) o el id de disputa (dp_…) del evento contra
 * `payment_ref`, donde se guarda el cs_… de la Checkout Session → jamás
 * había match, se marcaba el evento como procesado y el contracargo se
 * perdía en silencio (usuario con acceso gratis tras la devolución).
 *
 * Resolución en cadena:
 *   1. Local por payment_intent_ref (pi_… — rellenado en invoice.paid).
 *   2. Local por payment_ref (cubre filas antiguas/manual).
 *   3. Stripe API: charge → invoice → subscription → licencia. Necesario
 *      para disputas de cobros anteriores a esta columna.
 * Devuelve la licencia revocada, o null si no se pudo localizar (el caller
 * responde 500 para que Stripe reintente y audita la alerta).
 */
async function handleChargebackByPaymentRef(provider, dispute, ip) {
  const pi = dispute.payment_intent || null;

  let license = getLicenseByPaymentIntent(provider, pi)
    || getLicenseByPaymentRef(provider, pi)
    || getLicenseByPaymentRef(provider, dispute.id);

  // S15b (U1): contracargo de un paquete de créditos → misma política que el resto.
  if (!license) {
    const purchase = purchaseByPaymentIntent(pi);
    if (purchase) license = getLicenseById(purchase.license_id);
  }

  if (!license) {
    license = await resolveLicenseForDisputeViaStripe(dispute);
  }

  if (!license) {
    console.error(`[CHARGEBACK] No se encontró licencia para ${provider} dispute=${dispute.id} pi=${pi}`);
    audit('CHARGEBACK_UNRESOLVED', { ip, detail: `provider=${provider} dispute=${dispute.id} pi=${pi}` });
    return null;
  }

  updateLicense(license.id, { status: 'revoked' });
  deleteSessionsForLicense(license.id);

  audit('LICENSE_REVOKED_CHARGEBACK', { license_id: license.id, ip, detail: `provider=${provider} dispute=${dispute.id}` });

  sendLicenseRevokedEmail({ to: license.email, reason: 'disputa de pago (chargeback)' }).catch(e =>
    console.error('[EMAIL] Fallo enviando aviso de revocación:', e.message)
  );

  return license;
}

/**
 * Último recurso para mapear una disputa a una licencia cuando el lookup
 * local falla (cobros anteriores a la columna payment_intent_ref):
 * dispute.charge → charge.invoice → invoice.subscription → suscripción en DB.
 * Devuelve null si falta STRIPE_SECRET_KEY o cualquier eslabón no resuelve.
 */
async function resolveLicenseForDisputeViaStripe(dispute) {
  if (!process.env.STRIPE_SECRET_KEY) return null;
  try {
    let chargeId = dispute.charge || null;
    if (!chargeId && dispute.payment_intent) {
      const piObj = await fetchStripeObject(`payment_intents/${dispute.payment_intent}`);
      chargeId = piObj?.latest_charge || null;
    }
    if (!chargeId) return null;
    const charge = await fetchStripeObject(`charges/${chargeId}`);
    const invoiceId = charge?.invoice;
    if (!invoiceId) return null;
    const invoice = await fetchStripeObject(`invoices/${invoiceId}`);
    const subId = invoiceSubscriptionId(invoice);
    if (!subId) return null;
    return getLicenseByStripeSubscriptionId(subId) || null;
  } catch (e) {
    console.error('[CHARGEBACK] Resolución vía Stripe API falló:', e.message);
    return null;
  }
}

/** pi_… del cobro de una factura. Si el evento (versión ≥ basil) no lo trae
 *  expandido, se pide la factura con la versión fijada, que sí incluye
 *  `payment_intent`. No es fatal: sin red o sin clave devuelve null. */
async function resolveInvoicePaymentIntent(invoice) {
  const direct = invoicePaymentIntentId(invoice);
  if (direct || !invoice?.id || !(Number(invoice.amount_paid) > 0) || !process.env.STRIPE_SECRET_KEY) return direct;
  try {
    const full = await fetchStripeObject(`invoices/${encodeURIComponent(invoice.id)}`);
    return invoicePaymentIntentId(full);
  } catch (e) {
    console.warn('[WEBHOOK STRIPE] no se pudo leer el pi_ de la factura %s: %s', invoice.id, e.message);
    return null;
  }
}

/** GET genérico a la API de Stripe (misma versión pineada que el resto). */
async function fetchStripeObject(path) {
  const res = await fetchWithTimeout(`https://api.stripe.com/v1/${path}`, {
    headers: {
      'Authorization': `Bearer ${process.env.STRIPE_SECRET_KEY}`,
      'Stripe-Version': require('../config/stripe-version')
    }
  }, 30000);
  if (!res.ok) throw new Error(`Stripe devolvió ${res.status} en ${path}`);
  return res.json();
}

module.exports = router;
// Exportados para los e2e (compatibilidad de versiones de la API de Stripe).
module.exports._stripeCompat = { invoiceSubscriptionId, invoicePaymentIntentId, subscriptionPeriodEnd };
