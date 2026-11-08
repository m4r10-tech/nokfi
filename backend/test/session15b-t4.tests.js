/**
 * test/session15b-t4.tests.js — S15b T4, lote 10 (pagos, API y seguridad).
 *
 * Stripe se simula sustituyendo global.fetch solo para https://api.stripe.com
 * (como en session15b.tests.js). Las peticiones con cabeceras propias (Origin,
 * Idempotency-Key, X-API-Key) usan un helper http local.
 */

'use strict';

const http = require('http');

module.exports = async function session15bT4Tests({ post, get, call, check, getDB }) {
  const db = require('../db/database');
  const { createLicense, createSession, getLicenseById } = db;
  const baseUrl = `http://localhost:${process.env.PORT}`;

  /** Petición con cabeceras libres; devuelve { status, headers, data }. */
  function raw(method, path, { headers = {}, body } = {}) {
    return new Promise((resolve, reject) => {
      const data = body === undefined ? undefined : (typeof body === 'string' ? body : JSON.stringify(body));
      const h = { ...headers };
      if (data !== undefined) { h['Content-Type'] = h['Content-Type'] || 'application/json'; h['Content-Length'] = Buffer.byteLength(data); }
      const req = http.request(`${baseUrl}${path}`, { method, headers: h }, (res) => {
        let buf = ''; res.on('data', d => buf += d);
        res.on('end', () => { let p; try { p = JSON.parse(buf); } catch { p = buf; } resolve({ status: res.statusCode, headers: res.headers, data: p }); });
      });
      req.on('error', reject);
      req.setTimeout(5000, () => { req.destroy(); reject(new Error('timeout')); });
      if (data !== undefined) req.write(data);
      req.end();
    });
  }

  // ── Stripe simulado ──
  const saved = {
    key: process.env.STRIPE_SECRET_KEY, mini: process.env.STRIPE_PRICE_MINI, pro: process.env.STRIPE_PRICE_PRO,
    max: process.env.STRIPE_PRICE_MAX, pack: process.env.STRIPE_PRICE_PACK_50, landing: process.env.LANDING_PUBLIC_URL,
    app: process.env.APP_PUBLIC_URL, fetch: global.fetch
  };
  process.env.STRIPE_SECRET_KEY = 'sk_test_fake_t4';
  process.env.STRIPE_PRICE_MINI = 'price_t4_mini';
  process.env.STRIPE_PRICE_PRO = 'price_t4_pro';
  process.env.STRIPE_PRICE_MAX = 'price_t4_max';
  process.env.STRIPE_PRICE_PACK_50 = 'price_t4_pack50';
  process.env.LANDING_PUBLIC_URL = 'https://nokfi.test';
  process.env.APP_PUBLIC_URL = 'https://nokfi.test';
  let calls = [];
  global.fetch = async (url, opts = {}) => {
    const u = String(url);
    if (!u.startsWith('https://api.stripe.com/v1/')) return saved.fetch(url, opts);
    const method = opts.method || 'GET';
    const path = u.slice('https://api.stripe.com/v1/'.length).split('?')[0];
    const params = Object.fromEntries(new URLSearchParams(opts.body || u.split('?')[1] || ''));
    calls.push({ method, path, params });
    const body = { id: 'cs_t4_' + calls.length, url: 'https://checkout.stripe.test/t4' };
    return { ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) };
  };
  const lastCheckout = () => [...calls].reverse().find(c => c.method === 'POST' && c.path === 'checkout/sessions');

  let n = 0;
  const mk = (plan, extra = {}) => {
    n++;
    const l = createLicense({
      email: `t4-${n}@nokfi.local`, plan, payment_provider: 'stripe', payment_ref: `cs_t4_lic_${n}`,
      billing_model: 'subscription', stripe_customer_id: `cus_t4_${n}`, stripe_subscription_id: `sub_t4_${n}`,
      current_period_ends_at: new Date(Date.now() + 10 * 86400000).toISOString(), created_by: 'webhook_stripe_sub', ...extra
    });
    return l;
  };

  try {
    // ═══ T2 — suscripciones solo con tarjeta; packs con métodos dinámicos ═══
    calls = [];
    await post('/api/payments/stripe/create-checkout', { email: 't4-buy@nokfi.local', plan: 'pro', locale: 'es' });
    const sub = lastCheckout();
    check('T4 T2: el Checkout de una suscripción solo admite tarjeta (payment_method_types=card)', () =>
      sub && sub.params.mode === 'subscription' && sub.params['payment_method_types[0]'] === 'card' && !sub.params['payment_method_types[1]']);

    const BL = mk('pro', { password: 'T4BlockPass!x' });
    getDB().prepare("UPDATE licenses SET status = 'suspended', blocked_reason = 'payment_failed' WHERE id = ?").run(BL.id);
    const blk = await post('/api/auth/login', { email: BL.email, license_key: BL.key, password: 'T4BlockPass!x' });
    calls = [];
    await post('/api/payments/stripe/resume-checkout', { plan: 'max' }, blk.data.resume_token);
    const res = lastCheckout();
    check('T4 T2: el Checkout para reanudar una cuenta bloqueada también es solo con tarjeta', () =>
      res && res.params.mode === 'subscription' && res.params['payment_method_types[0]'] === 'card');

    const PK = mk('pro', { password: 'T4PackPass!x' });
    const pkTok = createSession(PK.id, '127.0.0.1').token;
    calls = [];
    await post('/api/payments/stripe/credit-checkout', { pack: 'pack50' }, pkTok);
    const pk = lastCheckout();
    check('T4 T2: el Checkout de un paquete de créditos sigue sin limitar los métodos de pago', () =>
      pk && pk.params.mode === 'payment' && pk.params['payment_method_types[0]'] === undefined);

    // ═══ Alta con tarjeta repetida que falla: la cuenta nace bloqueada y sin contraseña ═══
    const NB = mk('mini', { payment_ref: 'cs_t4_newblocked' });
    getDB().prepare("UPDATE licenses SET status = 'suspended', blocked_reason = 'payment_failed' WHERE id = ?").run(NB.id);
    const rv = await get('/api/payments/stripe/reveal?session_id=cs_t4_newblocked');
    check('T4 alta bloqueada: /reveal enseña la clave y avisa del bloqueo (sin decir «prueba activada»)', () =>
      rv.status === 200 && rv.data.key === NB.key && rv.data.blocked === true && rv.data.trial === false);
    const lg = await post('/api/auth/login', { email: NB.email, license_key: NB.key, password: 'T4NuevaPass!x' });
    check('T4 alta bloqueada: el login sin contraseña puesta invita a activar (409 not_activated)', () =>
      lg.status === 409 && lg.data.error === 'not_activated');
    const act = await post('/api/auth/activate', { email: NB.email, license_key: NB.key, password: 'T4NuevaPass!x' });
    check('T4 alta bloqueada: activar guarda la contraseña y lleva a la pantalla de reanudar (403 account_blocked + resume_token)', () =>
      act.status === 403 && act.data.error === 'account_blocked' && act.data.reason === 'payment_failed' && !!act.data.resume_token
      && !!getLicenseById(NB.id).password_hash);
    const dash = await get('/api/dashboard', act.data.resume_token);
    calls = [];
    const rc = await post('/api/payments/stripe/resume-checkout', { plan: 'mini' }, act.data.resume_token);
    check('T4 alta bloqueada: ese token no abre la app pero sí sirve para pagar un plan', () =>
      dash.status === 403 && rc.status === 200 && lastCheckout()?.params['metadata[resume_license_id]'] === String(NB.id));
    const lg2 = await post('/api/auth/login', { email: NB.email, license_key: NB.key, password: 'T4NuevaPass!x' });
    const act2 = await post('/api/auth/activate', { email: NB.email, license_key: NB.key, password: 'T4OtraPass!x' });
    check('T4 alta bloqueada: después, login → account_blocked y activar otra vez → 409 already_activated', () =>
      lg2.status === 403 && lg2.data.error === 'account_blocked' && act2.status === 409 && act2.data.error === 'already_activated');
    const RV = mk('pro', { payment_ref: 'cs_t4_revoked' });
    getDB().prepare("UPDATE licenses SET status = 'revoked', blocked_reason = 'payment_failed' WHERE id = ?").run(RV.id);
    const rvR = await get('/api/payments/stripe/reveal?session_id=cs_t4_revoked');
    const actR = await post('/api/auth/activate', { email: RV.email, license_key: RV.key, password: 'T4NuevaPass!x' });
    check('T4 alta bloqueada: una licencia revocada sigue sin clave en /reveal ni activación', () =>
      rvR.status === 404 && actR.status === 403 && actR.data.error === 'license_inactive');

  } finally {
    global.fetch = saved.fetch;
    for (const [k, v] of Object.entries({ STRIPE_SECRET_KEY: saved.key, STRIPE_PRICE_MINI: saved.mini, STRIPE_PRICE_PRO: saved.pro,
      STRIPE_PRICE_MAX: saved.max, STRIPE_PRICE_PACK_50: saved.pack, LANDING_PUBLIC_URL: saved.landing, APP_PUBLIC_URL: saved.app })) {
      if (v === undefined) delete process.env[k]; else process.env[k] = v;
    }
  }
};
