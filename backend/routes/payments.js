/**
 * routes/payments.js
 *
 * Creación de la intención/sesión de pago en cada proveedor.
 * La generación REAL de la licencia ocurre en routes/webhooks.js, nunca aquí
 * (sección 4 del proyecto: "la clave nunca existe antes del pago confirmado").
 *
 * Endpoints:
 *   POST /api/payments/stripe/create-checkout
 *   POST /api/payments/paypal/create-order
 *   POST /api/payments/coinbase/create-charge
 *   POST /api/payments/revolut/create-order
 *   GET  /api/payments/stripe/reveal        → muestra la clave recién comprada en /reveal
 */

'use strict';

const express = require('express');
const router = express.Router();

const { paypalApiBase, getPaypalAccessToken } = require('../utils/paypalAuth');
const { getLicenseByPaymentRef } = require('../db/database');

const LICENSE_PRICE_EUR = Number(process.env.LICENSE_PRICE_EUR || 150);
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
────────────────────────────────────────────────────────── */
router.post('/stripe/create-checkout', async (req, res) => {
  const email = (req.body?.email || '').trim().toLowerCase();
  const plan = req.body?.plan === 'pro' ? 'pro' : 'basic';

  if (!email || !EMAIL_REGEX.test(email)) {
    return res.status(400).json({ error: 'invalid_email' });
  }
  if (!process.env.STRIPE_SECRET_KEY) {
    return res.status(500).json({ error: 'stripe_not_configured' });
  }

  try {
    const params = new URLSearchParams({
      'mode': 'payment',
      'success_url': `${process.env.APP_PUBLIC_URL}/reveal?session_id={CHECKOUT_SESSION_ID}`,
      'cancel_url': `${process.env.LANDING_PUBLIC_URL}/?cancelled=true`,
      'customer_email': email,
      'line_items[0][price_data][currency]': 'eur',
      'line_items[0][price_data][product_data][name]': `Nokfi — Licencia ${plan === 'pro' ? 'Pro' : 'Básica'}`,
      'line_items[0][price_data][unit_amount]': String(Math.round(LICENSE_PRICE_EUR * 100)),
      'line_items[0][quantity]': '1',
      'metadata[plan]': plan,
      'metadata[email]': email
    });

    const stripeRes = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.STRIPE_SECRET_KEY}`,
        'Content-Type': 'application/x-www-form-urlencoded'
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
   POST /api/payments/paypal/create-order
   Body: { email, plan }
────────────────────────────────────────────────────────── */
router.post('/paypal/create-order', async (req, res) => {
  const email = (req.body?.email || '').trim().toLowerCase();
  const plan = req.body?.plan === 'pro' ? 'pro' : 'basic';

  if (!email || !EMAIL_REGEX.test(email)) {
    return res.status(400).json({ error: 'invalid_email' });
  }
  if (!process.env.PAYPAL_CLIENT_ID || !process.env.PAYPAL_CLIENT_SECRET) {
    return res.status(500).json({ error: 'paypal_not_configured' });
  }

  try {
    const accessToken = await getPaypalAccessToken();

    const orderRes = await fetch(`${paypalApiBase()}/v2/checkout/orders`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        intent: 'CAPTURE',
        purchase_units: [{
          amount: { currency_code: 'EUR', value: LICENSE_PRICE_EUR.toFixed(2) },
          description: `Nokfi — Licencia ${plan === 'pro' ? 'Pro' : 'Básica'}`,
          custom_id: JSON.stringify({ email, plan })
        }]
      })
    });

    if (!orderRes.ok) {
      const errBody = await orderRes.text();
      console.error('[PAYPAL] Error creando orden:', errBody);
      return res.status(502).json({ error: 'paypal_error' });
    }

    const order = await orderRes.json();
    res.json({ order_id: order.id });
  } catch (e) {
    console.error('[PAYPAL] Excepción:', e.message);
    res.status(500).json({ error: 'internal_error' });
  }
});

/* ──────────────────────────────────────────────────────────
   POST /api/payments/coinbase/create-charge
   Body: { email, plan }
────────────────────────────────────────────────────────── */
router.post('/coinbase/create-charge', async (req, res) => {
  const email = (req.body?.email || '').trim().toLowerCase();
  const plan = req.body?.plan === 'pro' ? 'pro' : 'basic';

  if (!email || !EMAIL_REGEX.test(email)) {
    return res.status(400).json({ error: 'invalid_email' });
  }
  if (!process.env.COINBASE_COMMERCE_API_KEY) {
    return res.status(500).json({ error: 'coinbase_not_configured' });
  }

  try {
    const chargeRes = await fetch('https://api.commerce.coinbase.com/charges', {
      method: 'POST',
      headers: {
        'X-CC-Api-Key': process.env.COINBASE_COMMERCE_API_KEY,
        'X-CC-Version': '2018-03-22',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: `Nokfi — Licencia ${plan === 'pro' ? 'Pro' : 'Básica'}`,
        description: 'Acceso de por vida a Nokfi',
        pricing_type: 'fixed_price',
        local_price: { amount: LICENSE_PRICE_EUR.toFixed(2), currency: 'EUR' },
        metadata: { email, plan }
      })
    });

    if (!chargeRes.ok) {
      const errBody = await chargeRes.text();
      console.error('[COINBASE] Error creando charge:', errBody);
      return res.status(502).json({ error: 'coinbase_error' });
    }

    const charge = await chargeRes.json();
    res.json({ checkout_url: charge.data.hosted_url });
  } catch (e) {
    console.error('[COINBASE] Excepción:', e.message);
    res.status(500).json({ error: 'internal_error' });
  }
});

/* ──────────────────────────────────────────────────────────
   POST /api/payments/revolut/create-order
   Body: { email, plan }

   Revolut Merchant API: crear un "order" devuelve un checkout_url al que
   se redirige al cliente, igual que Stripe/Coinbase. El email y el plan
   se mandan en merchant_order_data.reference para poder recuperarlos en
   el webhook (Revolut no soporta un campo "metadata" libre como Stripe,
   así que codificamos ambos datos en un único string JSON dentro de
   "reference", que Revolut nos devuelve tal cual en el evento del webhook).
────────────────────────────────────────────────────────── */
router.post('/revolut/create-order', async (req, res) => {
  const email = (req.body?.email || '').trim().toLowerCase();
  const plan = req.body?.plan === 'pro' ? 'pro' : 'basic';

  if (!email || !EMAIL_REGEX.test(email)) {
    return res.status(400).json({ error: 'invalid_email' });
  }
  if (!process.env.REVOLUT_API_KEY) {
    return res.status(500).json({ error: 'revolut_not_configured' });
  }

  try {
    const reference = JSON.stringify({ email, plan });
    const amountMinorUnits = Math.round(LICENSE_PRICE_EUR * 100); // céntimos, igual que Stripe

    const orderRes = await fetch(`${revolutApiBase()}/api/orders`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.REVOLUT_API_KEY}`,
        'Content-Type': 'application/json',
        'Revolut-Api-Version': '2024-09-01'
      },
      body: JSON.stringify({
        amount: amountMinorUnits,
        currency: 'EUR',
        merchant_order_data: { reference },
        capture_mode: 'automatic'
      })
    });

    if (!orderRes.ok) {
      const errBody = await orderRes.text();
      console.error('[REVOLUT] Error creando order:', errBody);
      return res.status(502).json({ error: 'revolut_error' });
    }

    const order = await orderRes.json();
    res.json({ checkout_url: order.checkout_url });
  } catch (e) {
    console.error('[REVOLUT] Excepción:', e.message);
    res.status(500).json({ error: 'internal_error' });
  }
});

/** Base URL de la Merchant API de Revolut según el entorno (sandbox o producción) */
function revolutApiBase() {
  return process.env.REVOLUT_ENV === 'live'
    ? 'https://merchant.revolut.com'
    : 'https://sandbox-merchant.revolut.com';
}

module.exports = router;
