/**
 * routes/payments.js
 *
 * Creación de la intención/sesión de pago para SUSCRIPCIONES mensuales (Fase 3).
 * La generación REAL de la licencia ocurre en routes/webhooks.js, nunca aquí
 * (sección 4 del proyecto: "la clave nunca existe antes del pago confirmado").
 *
 * Modelo de billing (Fase 3): suscripción mensual de 3 tiers vía Stripe.
 *   mini  €5/mes   → 500 céntimos    (+ trial gratis de 14 días con tarjeta)
 *   pro   €20/mes  → 2000 céntimos
 *   max   €50/mes  → 5000 céntimos
 * Precios, céntimos y planes válidos se leen de config/plans.js (fuente única;
 * antes eran literales duplicados aquí + database.js + webhooks.js + admin.js).
 * El viejo pago único lifetime (€150) queda ELIMINADO.
 *
 * Modelo de cobro (S15b, decidido 2026-11-07): cualquier cambio de plan (subida
 * o bajada) cobra HOY el precio completo del plan nuevo y empieza un periodo
 * nuevo de un mes desde hoy; sin prorrateos ni devoluciones. Si el cobro falla,
 * el plan no cambia. Cambiar durante el trial acaba el trial y cobra hoy.
 * Cancelar = sigue hasta el final del periodo pagado. El cambio de plan ya NO
 * está en el Customer Portal (solo tarjeta, facturas y cancelar): lo hace
 * POST /stripe/change-plan con billing_cycle_anchor=now + proration_behavior=none
 * + payment_behavior=error_if_incomplete.
 *
 * Trial (solo mini): el checkout incluye subscription_data[trial_period_days]
 * = TRIAL_DAYS. NO se manda trial_settings[end_behavior][type]: Checkout Sessions
 * no admite ese campo (es de la API de Subscriptions) y Stripe lo rechaza con
 * "unknown parameter"; el comportamiento por defecto al acabar el trial es
 * empezar a cobrar (= el "release" que se quiere). Stripe exige tarjeta en el
 * checkout (no cobra al instante) pero NO impide reusar la misma tarjeta para
 * otro trial con otro email: el anti-farmeo lo hace el webhook
 * checkout.session.completed comparando la huella de la tarjeta
 * (card.fingerprint) con la tabla trial_fingerprints; si ya tuvo trial, se acaba
 * la prueba en el acto y se cobra el primer mes. Si un cobro de renovación
 * falla, el webhook invoice.payment_failed para la suscripción y bloquea la
 * cuenta hasta que se pague un plan nuevo (POST /stripe/resume-checkout).
 *
 * Endpoints:
 *   POST /api/payments/stripe/create-checkout         → Checkout de suscripción
 *   POST /api/payments/stripe/create-portal-session   → Customer Portal (tarjeta, facturas, cancelar), auth Bearer
 *   GET  /api/payments/stripe/change-plan/preview     → importe y fecha de fin antes de cambiar, auth Bearer
 *   POST /api/payments/stripe/change-plan             → cambio de plan con cobro completo hoy, auth Bearer
 *   POST /api/payments/stripe/cancel                  → cancelar al final del periodo pagado, auth Bearer
 *   POST /api/payments/stripe/resume-checkout         → cuenta bloqueada por impago: pagar un plan y reanudar
 *   GET  /api/payments/stripe/reveal                  → muestra la clave recién comprada en /reveal (una vez)
 *   GET  /api/payments/plans                          → catálogo público de planes y paquetes (anti-drift, sin auth)
 *   GET  /api/payments/credits                        → saldo de créditos de paquetes y compras, auth Bearer (S15b, U1)
 *   POST /api/payments/stripe/credit-checkout         → Checkout de pago único de un paquete de créditos (S15b, U1)
 */

'use strict';

const CHECKOUT_LOCALES = ['es', 'en', 'fr', 'it', 'de', 'pl'];
const express = require('express');
const router = express.Router();

const { getLicenseByPaymentRef, getLicenseById, getSession, updateSubscription, getDB, audit } = require('../db/database');
const { requireLicense } = require('../middleware/requireLicense');
const { stripeApi, subscriptionPeriodEnd } = require('../utils/stripe');
const rateLimit = require('express-rate-limit');

// Fuente única de planes: precios (céntimos + EUR + nombre), planes válidos,
// saneamiento, y configuración del trial. Sustituye a los literales locales
// PLAN_PRICES / VALID_PLANS / coercePlan que vivían aquí antes (drift-prone).
const { PLANS, coercePlan, planHasTrial, TRIAL_DAYS, VALID_PLANS, CREDIT_PACKS, packPriceEnv } = require('../config/plans');
const { creditBalance, listPurchases } = require('../db/credits');
// Misma versión de API que routes/webhooks.js (un sólo declarador).
const STRIPE_API_VERSION = require('../config/stripe-version');
const { fetchWithTimeout } = require('../utils/http');

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/* ═─────────────────────────────────────────────────────────
   Rate-limit propio para create-checkout (defensa en profundidad).
   create-checkout no está detrás de requireLicense (es pre-pago, solo email+plan)
   y solo cae bajo el limiter general (200/15min) → un abuso podría crear muchas
   Checkout Sessions de Stripe (coste/ruido). Este limiter más estricto por IP
   (10 por minuto) cubre ese hueco sin tocar el resto de pagos.
────────────────────────────────────────────────────────── */
const checkoutLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'rate_limited', message: 'Demasiados intentos de pago. Espera un momento.' }
});

/* ──────────────────────────────────────────────────────────
   GET /api/payments/plans

   Catálogo público de planes — único punto de verdad del FRONTEND para precios,
   cuotas y trial. El operador define el precio en .env (PLAN_PRICE_*_EUR) y al
   reiniciar el backend este endpoint refleja el cambio; Pricing.jsx lo fetcha y
   así SIEMPRE muestra el precio que Stripe va a cobrar (anti-drift: nada de
   hardcodear precios en el frontend). No requiere auth ni claves de Stripe.

   Devuelve: { plans: [{ id, name, price_eur, quota, trial }, ...],
               credit_packs: [{ id, credits, price_eur }, ...] }   (S15b, U1)
   `quota` = créditos al día del plan (antes «análisis de IA al día»).
────────────────────────────────────────────────────────── */
const packList = () => Object.keys(CREDIT_PACKS).map(id => ({ id, credits: CREDIT_PACKS[id].credits, price_eur: CREDIT_PACKS[id].eur }));

router.get('/plans', (req, res) => {
  const plans = Object.keys(PLANS).map(id => ({
    id,
    name: PLANS[id].name,
    price_eur: PLANS[id].eur,
    quota: PLANS[id].quota,
    trial: planHasTrial(id)
  }));
  res.json({ plans, credit_packs: packList() });
});

/* ──────────────────────────────────────────────────────────
   S15b (U1) — Paquetes de créditos (pago único, no caducan)

   Solo con un plan activo (Q1: el paquete amplía el plan, no lo sustituye).
   Se gastan cuando se acaban los créditos del día (Q2) y el saldo es el mismo
   en la web y en /api/v1 (Q3). El cobro es un Checkout mode=payment con el
   Price de STRIPE_PRICE_PACK_<créditos>; los créditos los suma el webhook
   checkout.session.completed (idempotente por sesión), nunca este endpoint.
────────────────────────────────────────────────────────── */
const PERIOD_GRACE_MS = 3 * 86400000; // la renovación (invoice.paid) puede llegar algo después del fin del periodo
function hasActivePlan(license) {
  if (license.status !== 'active' || license.blocked_reason || !VALID_PLANS.includes(license.plan)) return false;
  if (license.current_period_ends_at && Date.parse(license.current_period_ends_at) + PERIOD_GRACE_MS <= Date.now()) return false;
  return true;
}

// Límite propio (mismo criterio que checkoutLimiter, contador aparte).
const packCheckoutLimiter = rateLimit({
  windowMs: 60 * 1000, max: 10, standardHeaders: true, legacyHeaders: false,
  message: { error: 'rate_limited', message: 'Demasiados intentos de pago. Espera un momento.' }
});

/* GET /api/payments/credits   (auth: Bearer) → { balance, can_buy, packs, purchases } */
router.get('/credits', requireLicense, (req, res) => {
  res.json({
    balance: creditBalance(req.license.id),
    can_buy: hasActivePlan(req.license),
    packs: packList(),
    purchases: listPurchases(req.license.id, 20)
  });
});

/* POST /api/payments/stripe/credit-checkout  { pack, locale }   (auth: Bearer) → { checkout_url } */
router.post('/stripe/credit-checkout', packCheckoutLimiter, requireLicense, async (req, res) => {
  const license = req.license;
  const pack = String(req.body?.pack || '');
  if (!CREDIT_PACKS[pack]) return res.status(400).json({ error: 'invalid_pack' });
  if (!hasActivePlan(license)) {
    return res.status(403).json({ error: 'plan_required', message: 'Los paquetes de créditos solo se pueden comprar con un plan activo.' });
  }
  if (!process.env.STRIPE_SECRET_KEY) return res.status(500).json({ error: 'stripe_not_configured' });
  const priceId = process.env[packPriceEnv(pack)];
  if (!priceId) return res.status(500).json({ error: 'stripe_price_not_configured' });

  const back = `${process.env.APP_PUBLIC_URL}/app/configuracion?s=plan`;
  const params = {
    'mode': 'payment',
    'success_url': `${back}&credits=ok`,
    'cancel_url': `${back}&credits=cancelled`,
    'line_items[0][price]': priceId,
    'line_items[0][quantity]': '1',
    'metadata[kind]': 'credit_pack',
    'metadata[pack]': pack,
    'metadata[license_id]': String(license.id),
    'payment_intent_data[metadata][kind]': 'credit_pack',
    'payment_intent_data[metadata][pack]': pack,
    'payment_intent_data[metadata][license_id]': String(license.id)
  };
  if (license.stripe_customer_id) params.customer = license.stripe_customer_id;
  else params.customer_email = license.email;
  if (CHECKOUT_LOCALES.includes(req.body?.locale)) params.locale = req.body.locale;

  try {
    const r = await stripeApi('POST', 'checkout/sessions', params);
    if (!r.ok) {
      console.error('[STRIPE PACK] Error creando checkout:', r.status, r.data?.error?.message);
      return res.status(502).json({ error: 'stripe_error' });
    }
    audit('CREDIT_PACK_CHECKOUT', { license_id: license.id, ip: req.ip, detail: `pack=${pack}` });
    res.json({ checkout_url: r.data.url });
  } catch (e) {
    console.error('[STRIPE PACK] Excepción:', e.message);
    res.status(500).json({ error: 'internal_error' });
  }
});

/* ──────────────────────────────────────────────────────────
   GET /api/payments/stripe/reveal?session_id=...

   Página /reveal al volver de Stripe Checkout: muestra la clave recién
   comprada en la web (además del email, que ya se envía en el webhook).
   No requiere auth — el `session_id` es la URL-secreta que Stripe solo
   entrega al navegador del comprador (va en el success_url). No expone
   nada que el comprador no tenga ya en su bandeja de entrada.

   S15b (P6): la clave se muestra UNA vez. La primera lectura guarda
   key_revealed_at; se tolera repetir durante REVEAL_GRACE_MS (recarga de la
   página o el doble efecto de React en desarrollo) y después responde 410
   already_revealed: la URL queda en el historial del navegador y no debe
   servir para ver la clave días después (la tiene en su email).

   Estados:
     200 → { key, email, plan, trial, trial_ends_at }  licencia creada por el webhook
     404 → { error: 'not_found' }         el webhook aún no ha llegado (o el id no existe)
     410 → { error: 'already_revealed' }  ya se mostró
────────────────────────────────────────────────────────── */
const REVEAL_GRACE_MS = 2 * 60 * 1000;
router.get('/stripe/reveal', (req, res) => {
  const session_id = (req.query?.session_id || '').toString().trim();
  if (!session_id) {
    return res.status(400).json({ error: 'missing_session_id' });
  }

  const license = getLicenseByPaymentRef('stripe', session_id);
  if (!license || license.status !== 'active') {
    return res.status(404).json({ error: 'not_found' });
  }

  if (license.key_revealed_at) {
    const first = Date.parse(license.key_revealed_at);
    if (!Number.isFinite(first) || Date.now() - first > REVEAL_GRACE_MS) {
      return res.status(410).json({ error: 'already_revealed', email: license.email });
    }
  } else {
    getDB().prepare('UPDATE licenses SET key_revealed_at = ? WHERE id = ? AND key_revealed_at IS NULL')
      .run(new Date().toISOString(), license.id);
  }

  // P7: en un trial no se ha cobrado nada hoy → el título no puede decir «pago completado».
  const trial = !!license.trial_ends_at && Date.parse(license.trial_ends_at) > Date.now();
  res.json({ key: license.key, email: license.email, plan: license.plan, trial, trial_ends_at: trial ? license.trial_ends_at : null });
});

/* ──────────────────────────────────────────────────────────
   POST /api/payments/stripe/create-checkout
   Body: { email, plan }
   Crea una Checkout Session en modo SUBSCRIPTION (pago mensual recurrente)
   para el plan elegido. La licencia se crea en el webhook al recibir el
   `checkout.session.completed` (modo subscription).
────────────────────────────────────────────────────────── */
router.post('/stripe/create-checkout', checkoutLimiter, async (req, res) => {
  const email = (req.body?.email || '').trim().toLowerCase();

  if (!email || !EMAIL_REGEX.test(email)) {
    return res.status(400).json({ error: 'invalid_email' });
  }
  // Deuda I: validar plan ANTES de tocar Stripe. coercePlan() cae a 'mini' para un
  // plan no-válido → sin este guard, una API call directa con plan:"bogus" (+email
  // válido) crearía una sesión mini LIVE huérfana en Stripe en vez de 400.
  if (!VALID_PLANS.includes(req.body?.plan)) {
    return res.status(400).json({ error: 'invalid_plan' });
  }
  const plan = req.body?.plan;

  if (!process.env.STRIPE_SECRET_KEY) {
    return res.status(500).json({ error: 'stripe_not_configured' });
  }
  // Deuda B: precio estable de Stripe por plan. Sin él no hay sesión — el
  // Stripe Customer Portal solo permite upgrade/downgrade limpio (y prorrata
  // None a fin de periodo) sobre price_id persistentes, no sobre price_data
  // inline efímeros que se recrean en cada checkout.
  const priceId = process.env[`STRIPE_PRICE_${plan.toUpperCase()}`];
  if (!priceId) {
    return res.status(500).json({ error: 'stripe_price_not_configured' });
  }

  try {
    const params = new URLSearchParams({
      'mode': 'subscription',
      'success_url': `${process.env.APP_PUBLIC_URL}/reveal?session_id={CHECKOUT_SESSION_ID}`,
      // P9: al abandonar el checkout se vuelve a Precios con el plan elegido.
      'cancel_url': `${process.env.LANDING_PUBLIC_URL}${req.body?.locale === 'en' ? '/en' : ''}/pricing?plan=${plan}&cancelled=true`,
      'customer_email': email,
      // Deuda B: referencia al price_id estable de Stripe (3 Prices del Product
      // "Nokfi"). Antes era price_data inline efímero — Stripe lo recreaba cada
      // checkout y no servía para intercambio de plan por el Portal.
      'line_items[0][price]': priceId,
      'line_items[0][quantity]': '1',
      'subscription_data[metadata][plan]': plan,
      'subscription_data[metadata][email]': email,
      'metadata[plan]': plan,
      'metadata[email]': email
    });

    // Trial de 14 días CON TARJETA — solo el plan mini. Solo
    // subscription_data[trial_period_days]: el comportamiento por defecto al
    // acabar el trial es empezar a cobrar (la suscripción pasa a 'active' y se
    // cobra el día 14), que es justo el "release" que queremos. NO mandar
    // subscription_data[trial_settings][end_behavior][type]: NO existe en
    // subscription_data de Checkout Sessions (existe en la API de Subscriptions,
    // no aquí) — Stripe lo rechaza con "unknown parameter" (visto en prod,
    // 2026-08-04, API 2024-04-10).
    if (planHasTrial(plan)) {
      params.set('subscription_data[trial_period_days]', String(TRIAL_DAYS));
    }

    // Sesión 4 (§5.1): Checkout en el idioma de la web (Stripe los admite todos).
    const locale = CHECKOUT_LOCALES.includes(req.body?.locale) ? req.body.locale : null;
    if (locale) params.set('locale', locale);

    // Timeout 30s: una API de pagos colgada no debe retener el request del
    // usuario indefinidamente (antes: fetch sin límite de tiempo).
    const stripeRes = await fetchWithTimeout('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.STRIPE_SECRET_KEY}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Stripe-Version': STRIPE_API_VERSION
      },
      body: params.toString()
    }, 30000);

    if (!stripeRes.ok) {
      const errBody = await stripeRes.text();
      console.error('[STRIPE] Error creando checkout:', errBody);
      return res.status(502).json({ error: 'stripe_error' });
    }

    const session = await stripeRes.json();
    res.json({ checkout_url: session.url });
  } catch (e) {
    console.error('[STRIPE] Excepción:', e.message);
    res.status(500).json({ error: 'internal_error' });
  }
});

/* ──────────────────────────────────────────────────────────
   POST /api/payments/stripe/create-portal-session   (auth: Bearer)

   Crea una sesión del Stripe Customer Portal para que el usuario actualice su
   tarjeta, descargue sus facturas o cancele (a fin de periodo). S15b: el cambio
   de plan está DESACTIVADO en la configuración del Portal (con proration none
   permitía usar Max pagando Mini); se hace con POST /stripe/change-plan.

   Requiere req.license (injectado por requireLicense), con un
   stripe_customer_id válido — las licencias legacy migradas (lifetime viejo)
   no tienen customer en Stripe y reciben un error claro en vez de un portal
   vacío.

   Devuelve: { url } → el frontend redirige a esa URL.
────────────────────────────────────────────────────────── */
router.post('/stripe/create-portal-session', requireLicense, async (req, res) => {
  const license = req.license;
  if (!license.stripe_customer_id) {
    return res.status(400).json({
      error: 'not_stripe_customer',
      message: 'Tu licencia no está vinculada a una suscripción de Stripe (licencia legacy). No hay suscripción que gestionar.'
    });
  }
  if (!process.env.STRIPE_SECRET_KEY) {
    return res.status(500).json({ error: 'stripe_not_configured' });
  }

  const returnUrl = `${process.env.APP_PUBLIC_URL}/app/configuracion?s=plan`;
  try {
    const portalRes = await fetchWithTimeout('https://api.stripe.com/v1/billing_portal/sessions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.STRIPE_SECRET_KEY}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Stripe-Version': STRIPE_API_VERSION
      },
      body: new URLSearchParams({
        'customer': license.stripe_customer_id,
        'return_url': returnUrl,
        // Portal en el idioma de la app (sesión 4); 'auto' si no llega uno válido.
        'locale': CHECKOUT_LOCALES.includes(req.body?.locale) ? req.body.locale : 'auto'
      }).toString()
    }, 30000);

    if (!portalRes.ok) {
      const errBody = await portalRes.text();
      console.error('[STRIPE PORTAL] Error creando sesión de portal:', errBody);
      return res.status(502).json({ error: 'stripe_error' });
    }

    const session = await portalRes.json();
    res.json({ url: session.url });
  } catch (e) {
    console.error('[STRIPE PORTAL] Excepción:', e.message);
    res.status(500).json({ error: 'internal_error' });
  }
});

/* ══════════════════════════════════════════════════════════
   S15b — Cambio de plan, cancelación y reanudar tras impago
══════════════════════════════════════════════════════════ */

/** Misma fecha del mes siguiente (así calcula Stripe un periodo mensual con
 *  billing_cycle_anchor=now; si el día no existe, el último del mes). */
function oneMonthFrom(date) {
  const d = new Date(date.getTime());
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + 1);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return d;
}

function isoFromUnix(sec) {
  const n = Number(sec);
  return Number.isFinite(n) && n > 0 ? new Date(n * 1000).toISOString() : undefined;
}

function inTrial(license) {
  return !!license.trial_ends_at && Date.parse(license.trial_ends_at) > Date.now();
}

/** Comprobaciones comunes de cambio de plan. Devuelve { error:[status, body] } o { plan, priceId }. */
function checkPlanChange(license, plan) {
  if (!VALID_PLANS.includes(plan)) return { error: [400, { error: 'invalid_plan' }] };
  if (!license.stripe_subscription_id || license.billing_model !== 'subscription') {
    return { error: [400, { error: 'not_stripe_customer', message: 'Tu licencia no está vinculada a una suscripción de Stripe.' }] };
  }
  if (plan === license.plan) return { error: [409, { error: 'same_plan', message: 'Ya tienes ese plan.' }] };
  const priceId = process.env[`STRIPE_PRICE_${plan.toUpperCase()}`];
  return { plan, priceId };
}

/* GET /api/payments/stripe/change-plan/preview?plan=pro   (auth: Bearer)
   Lo que se va a cobrar y hasta cuándo dura, para el aviso previo:
   «Se te cobrarán 20 € hoy y tu plan Pro durará hasta el 7-12; lo que queda
   del plan actual no se devuelve». No toca Stripe. */
router.get('/stripe/change-plan/preview', requireLicense, (req, res) => {
  const license = req.license;
  const plan = (req.query?.plan || '').toString();
  const c = checkPlanChange(license, plan);
  if (c.error) return res.status(c.error[0]).json(c.error[1]);
  res.json({
    plan, current_plan: license.plan,
    amount_eur: PLANS[plan].eur,
    ends_at: oneMonthFrom(new Date()).toISOString(),
    ends_trial: inTrial(license),
    cancel_at_period_end: !!license.cancel_at_period_end
  });
});

/* POST /api/payments/stripe/change-plan  { plan }   (auth: Bearer)
   Cambia el precio de la suscripción y cobra HOY el plan nuevo completo:
     billing_cycle_anchor=now        → periodo nuevo de un mes desde hoy
     proration_behavior=none         → sin prorrateos ni abonos
     payment_behavior=error_if_incomplete → si la tarjeta falla, Stripe NO aplica
                                       el cambio (402) y el plan sigue igual
     trial_end=now (si está en trial) → acaba la prueba y cobra hoy
   Probado contra Stripe en modo test (2026-11-07): con tarjeta rechazada la
   suscripción queda intacta (mismo precio, mismo trial). */
router.post('/stripe/change-plan', requireLicense, async (req, res) => {
  const license = req.license;
  const c = checkPlanChange(license, req.body?.plan);
  if (c.error) return res.status(c.error[0]).json(c.error[1]);
  if (!process.env.STRIPE_SECRET_KEY) return res.status(500).json({ error: 'stripe_not_configured' });
  if (!c.priceId) return res.status(500).json({ error: 'stripe_price_not_configured' });

  try {
    const cur = await stripeApi('GET', `subscriptions/${encodeURIComponent(license.stripe_subscription_id)}`);
    if (!cur.ok) {
      console.error('[STRIPE CHANGE] no se pudo leer la suscripción:', cur.status, cur.data?.error?.message);
      return res.status(502).json({ error: 'stripe_error' });
    }
    const sub = cur.data;
    if (!['active', 'trialing'].includes(sub.status)) {
      return res.status(409).json({ error: 'subscription_not_active' });
    }
    const itemId = sub.items?.data?.[0]?.id;
    const params = {
      'items[0][id]': itemId,
      'items[0][price]': c.priceId,
      'billing_cycle_anchor': 'now',
      'proration_behavior': 'none',
      'payment_behavior': 'error_if_incomplete',
      'metadata[plan]': c.plan
    };
    if (sub.status === 'trialing') params.trial_end = 'now';

    const up = await stripeApi('POST', `subscriptions/${encodeURIComponent(sub.id)}`, params);
    if (!up.ok) {
      const err = up.data?.error || {};
      if (up.status === 402 || err.type === 'card_error') {
        audit('SUBSCRIPTION_CHANGE_DECLINED', { license_id: license.id, ip: req.ip, detail: `${license.plan} → ${c.plan} code=${err.code || '?'} decline=${err.decline_code || '-'}` });
        return res.status(402).json({ error: 'payment_failed', message: 'No se pudo cobrar la tarjeta. Tu plan no ha cambiado.' });
      }
      console.error('[STRIPE CHANGE] Stripe rechazó el cambio:', up.status, err.message);
      return res.status(502).json({ error: 'stripe_error' });
    }

    const updated = up.data;
    const current_period_ends_at = isoFromUnix(subscriptionPeriodEnd(updated)) || oneMonthFrom(new Date()).toISOString();
    updateSubscription(license.id, {
      plan: c.plan, status: 'active', current_period_ends_at,
      trial_ends_at: null, amount_eur: PLANS[c.plan].eur
    });
    audit('SUBSCRIPTION_PLAN_CHANGED_PAID', {
      license_id: license.id, ip: req.ip,
      detail: `${license.plan} → ${c.plan} amount=${PLANS[c.plan].eur}€ ends=${current_period_ends_at}${sub.status === 'trialing' ? ' trial_ended' : ''}`
    });
    res.json({ success: true, plan: c.plan, amount_eur: PLANS[c.plan].eur, current_period_ends_at });
  } catch (e) {
    console.error('[STRIPE CHANGE] Excepción:', e.message);
    res.status(500).json({ error: 'internal_error' });
  }
});

/* POST /api/payments/stripe/cancel   (auth: Bearer)
   Cancela al final del periodo pagado (o al final del trial, sin cobrar):
   sigue usándolo hasta esa fecha y no hay más cobros. */
router.post('/stripe/cancel', requireLicense, async (req, res) => {
  const license = req.license;
  if (!license.stripe_subscription_id || license.billing_model !== 'subscription') {
    return res.status(400).json({ error: 'not_stripe_customer' });
  }
  if (!process.env.STRIPE_SECRET_KEY) return res.status(500).json({ error: 'stripe_not_configured' });
  try {
    const r = await stripeApi('POST', `subscriptions/${encodeURIComponent(license.stripe_subscription_id)}`, { cancel_at_period_end: 'true' });
    if (!r.ok) {
      console.error('[STRIPE CANCEL] Stripe rechazó la cancelación:', r.status, r.data?.error?.message);
      return res.status(502).json({ error: 'stripe_error' });
    }
    const current_period_ends_at = isoFromUnix(r.data.cancel_at || subscriptionPeriodEnd(r.data)) || license.current_period_ends_at || undefined;
    updateSubscription(license.id, { cancel_at_period_end: 1, current_period_ends_at });
    audit('SUBSCRIPTION_CANCEL_SCHEDULED', { license_id: license.id, ip: req.ip, detail: `sub=${license.stripe_subscription_id} ends=${current_period_ends_at} (Ajustes)` });
    res.json({ success: true, cancel_at_period_end: true, current_period_ends_at: current_period_ends_at || null });
  } catch (e) {
    console.error('[STRIPE CANCEL] Excepción:', e.message);
    res.status(500).json({ error: 'internal_error' });
  }
});

/** Sesión de una cuenta bloqueada por impago (U4). requireLicense rechaza las
 *  licencias no activas; esta variante solo deja pasar las bloqueadas por una
 *  renovación rechazada, y solo la usa resume-checkout. */
function requireBlockedLicense(req, res, next) {
  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
  const session = token ? getSession(token) : null;
  const license = session ? getLicenseById(session.license_id) : null;
  if (!license) return res.status(401).json({ error: 'session_invalid' });
  if (license.blocked_reason !== 'payment_failed' || license.status === 'revoked') {
    return res.status(409).json({ error: 'not_blocked' });
  }
  req.license = license;
  next();
}

/* POST /api/payments/stripe/resume-checkout  { plan, locale }  (auth: sesión de cuenta bloqueada)
   Checkout de un plan nuevo (sin trial, se cobra hoy) para la MISMA cuenta: el
   webhook checkout.session.completed ve metadata.resume_license_id, enlaza la
   suscripción nueva a la licencia y la desbloquea (los datos se conservan). */
router.post('/stripe/resume-checkout', checkoutLimiter, requireBlockedLicense, async (req, res) => {
  const license = req.license;
  const plan = req.body?.plan;
  if (!VALID_PLANS.includes(plan)) return res.status(400).json({ error: 'invalid_plan' });
  if (!process.env.STRIPE_SECRET_KEY) return res.status(500).json({ error: 'stripe_not_configured' });
  const priceId = process.env[`STRIPE_PRICE_${plan.toUpperCase()}`];
  if (!priceId) return res.status(500).json({ error: 'stripe_price_not_configured' });

  const params = {
    'mode': 'subscription',
    'success_url': `${process.env.APP_PUBLIC_URL}/login?resumed=1`,
    'cancel_url': `${process.env.APP_PUBLIC_URL}/login?resume_cancelled=1`,
    'line_items[0][price]': priceId,
    'line_items[0][quantity]': '1',
    'subscription_data[metadata][plan]': plan,
    'subscription_data[metadata][email]': license.email,
    'metadata[plan]': plan,
    'metadata[email]': license.email,
    'metadata[resume_license_id]': String(license.id)
  };
  if (license.stripe_customer_id) params.customer = license.stripe_customer_id;
  else params.customer_email = license.email;
  if (CHECKOUT_LOCALES.includes(req.body?.locale)) params.locale = req.body.locale;

  try {
    const r = await stripeApi('POST', 'checkout/sessions', params);
    if (!r.ok) {
      console.error('[STRIPE RESUME] Error creando checkout:', r.status, r.data?.error?.message);
      return res.status(502).json({ error: 'stripe_error' });
    }
    audit('SUBSCRIPTION_RESUME_CHECKOUT', { license_id: license.id, ip: req.ip, detail: `plan=${plan}` });
    res.json({ checkout_url: r.data.url });
  } catch (e) {
    console.error('[STRIPE RESUME] Excepción:', e.message);
    res.status(500).json({ error: 'internal_error' });
  }
});

module.exports = router;
