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
 * El viejo pago único lifetime (€150) queda ELIMINADO. Cancelar y mejorar plan
 * se gestionan vía el Stripe Customer Portal (endpoint create-portal-session),
 * que cálcula las prorratas de forma nativa.
 *
 * Trial (solo mini): el checkout incluye subscription_data[trial_period_days]
 * = TRIAL_DAYS y trial_settings[end_behavior][type]=release. Stripe exige
 * tarjeta en el checkout (no cobra al instante) y bloquea reusar la misma
 * tarjeta para un 2º trial → anti-farmeo. Al día 14 cobra la tarjeta; si falla,
 * los webhooks existentes (past_due→suspended→expired) lo gestionan sin scheduler.
 *
 * Endpoints:
 *   POST /api/payments/stripe/create-checkout         → Checkout de suscripción
 *   POST /api/payments/stripe/create-portal-session   → Customer Portal (cancel/upgrade), auth Bearer
 *   GET  /api/payments/stripe/reveal                  → muestra la clave recién comprada en /reveal
 *   GET  /api/payments/plans                          → catálogo público de planes (anti-drift, sin auth)
 */

'use strict';

const express = require('express');
const router = express.Router();

const { getLicenseByPaymentRef } = require('../db/database');
const { requireLicense } = require('../middleware/requireLicense');

// Fuente única de planes: precios (céntimos + EUR + nombre), planes válidos,
// saneamiento, y configuración del trial. Sustituye a los literales locales
// PLAN_PRICES / VALID_PLANS / coercePlan que vivían aquí antes (drift-prone).
const { PLANS, coercePlan, planHasTrial, TRIAL_DAYS } = require('../config/plans');
// Misma versión de API que routes/webhooks.js (un sólo declarador).
const STRIPE_API_VERSION = require('../config/stripe-version');

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/* ──────────────────────────────────────────────────────────
   GET /api/payments/plans

   Catálogo público de planes — único punto de verdad del FRONTEND para precios,
   cuotas y trial. El operador define el precio en .env (PLAN_PRICE_*_EUR) y al
   reiniciar el backend este endpoint refleja el cambio; Pricing.jsx lo fetcha y
   así SIEMPRE muestra el precio que Stripe va a cobrar (anti-drift: nada de
   hardcodear precios en el frontend). No requiere auth ni claves de Stripe.

   Devuelve: { plans: [{ id, name, price_eur, quota, trial }, ...] }
────────────────────────────────────────────────────────── */
router.get('/plans', (req, res) => {
  const plans = Object.keys(PLANS).map(id => ({
    id,
    name: PLANS[id].name,
    price_eur: PLANS[id].eur,
    quota: PLANS[id].quota,
    trial: planHasTrial(id)
  }));
  res.json({ plans });
});

/* ──────────────────────────────────────────────────────────
   GET /api/payments/stripe/reveal?session_id=...

   Página /reveal al volver de Stripe Checkout: muestra la clave recién
   comprada en la web (además del email, que ya se envía en el webhook).
   No requiere auth — el `session_id` es la URL-secreta que Stripe solo
   entrega al navegador del comprador (va en el success_url). No expone
   nada que el comprador no tenga ya en su bandeja de entrada.

   Estados:
     200 → { key, email, plan }    la licencia ya fue creada por el webhook
     404 → { error: 'not_found' }  el webhook aún no ha llegado (o el id no existe)
────────────────────────────────────────────────────────── */
router.get('/stripe/reveal', (req, res) => {
  const session_id = (req.query?.session_id || '').toString().trim();
  if (!session_id) {
    return res.status(400).json({ error: 'missing_session_id' });
  }

  const license = getLicenseByPaymentRef('stripe', session_id);
  if (!license || license.status !== 'active') {
    return res.status(404).json({ error: 'not_found' });
  }

  res.json({ key: license.key, email: license.email, plan: license.plan });
});

/* ──────────────────────────────────────────────────────────
   POST /api/payments/stripe/create-checkout
   Body: { email, plan }
   Crea una Checkout Session en modo SUBSCRIPTION (pago mensual recurrente)
   para el plan elegido. La licencia se crea en el webhook al recibir el
   `checkout.session.completed` (modo subscription).
────────────────────────────────────────────────────────── */
router.post('/stripe/create-checkout', async (req, res) => {
  const email = (req.body?.email || '').trim().toLowerCase();
  const plan = coercePlan(req.body?.plan);
  const price = PLANS[plan];

  if (!email || !EMAIL_REGEX.test(email)) {
    return res.status(400).json({ error: 'invalid_email' });
  }
  if (!process.env.STRIPE_SECRET_KEY) {
    return res.status(500).json({ error: 'stripe_not_configured' });
  }

  try {
    const params = new URLSearchParams({
      'mode': 'subscription',
      'success_url': `${process.env.APP_PUBLIC_URL}/reveal?session_id={CHECKOUT_SESSION_ID}`,
      'cancel_url': `${process.env.LANDING_PUBLIC_URL}/?cancelled=true`,
      'customer_email': email,
      'line_items[0][price_data][currency]': 'eur',
      'line_items[0][price_data][recurring][interval]': 'month',
      'line_items[0][price_data][product_data][name]': `Nokfi — Plan ${price.name}`,
      'line_items[0][price_data][unit_amount]': String(price.cents),
      'line_items[0][quantity]': '1',
      'subscription_data[metadata][plan]': plan,
      'subscription_data[metadata][email]': email,
      'metadata[plan]': plan,
      'metadata[email]': email
    });

    // Trial de 14 días CON TARJETA — solo el plan mini. No payment_behavior:
    // hay cobro al final del trial, no cobro inmediato. end_behavior=release
    // deja que la suscripción pase a 'active' y se cobre al día 14 (en vez de
    // 'pause', que dejaría la suscripción en estado de cobro indefinitely).
    if (planHasTrial(plan)) {
      params.set('subscription_data[trial_period_days]', String(TRIAL_DAYS));
      params.set('subscription_data[trial_settings][end_behavior][type]', 'release');
    }

    const stripeRes = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.STRIPE_SECRET_KEY}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Stripe-Version': STRIPE_API_VERSION
      },
      body: params.toString()
    });

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

   Crea una sesión del Stripe Customer Portal para que el usuario gestione su
   suscripción desde la propia interfaz de Stripe: cancelar (a fin de periodo),
   mejorar de plan (mini→pro→max) con prorrata automática, o actualizar el método
   de pago. Se prefirió el Portal nativo sobre endpoints custom por menos código
   y menos bordes (prorratas, currencies, dunning) ya resueltos por Stripe.

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

  const returnUrl = `${process.env.APP_PUBLIC_URL}/app/configuracion`;
  try {
    const portalRes = await fetch('https://api.stripe.com/v1/billing_portal/sessions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.STRIPE_SECRET_KEY}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Stripe-Version': STRIPE_API_VERSION
      },
      body: new URLSearchParams({
        'customer': license.stripe_customer_id,
        'return_url': returnUrl
      }).toString()
    });

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

module.exports = router;
