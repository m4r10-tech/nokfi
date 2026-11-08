/**
 * test/session15b-t4.tests.js — S15b T4, lote 10 (pagos, API y seguridad).
 *
 * Stripe se simula sustituyendo global.fetch solo para https://api.stripe.com
 * (como en session15b.tests.js). Las peticiones con cabeceras propias (Origin,
 * Idempotency-Key, X-API-Key) usan un helper http local.
 */

'use strict';

const http = require('http');

module.exports = async function session15bT4Tests({ post, put, get, call, check, getDB }) {
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

    // ═══ CORS: OpenAPI y MCP abiertos a cualquier origen, sin credenciales; el resto no ═══
    const evil = 'https://swagger.example';
    const oPre = await raw('OPTIONS', '/api/v1/openapi.json', { headers: { Origin: evil, 'Access-Control-Request-Method': 'GET' } });
    const oGet = await raw('GET', '/api/v1/openapi.json', { headers: { Origin: evil } });
    check('T4 CORS: /api/v1/openapi.json responde a cualquier origen (preflight y GET) con ACAO * y sin credenciales', () =>
      oPre.status === 204 && oPre.headers['access-control-allow-origin'] === '*' && !oPre.headers['access-control-allow-credentials']
      && oGet.status === 200 && oGet.headers['access-control-allow-origin'] === '*' && !!oGet.data.openapi);
    const mPre = await raw('OPTIONS', '/api/mcp', { headers: { Origin: evil, 'Access-Control-Request-Method': 'POST',
      'Access-Control-Request-Headers': 'authorization,content-type,mcp-protocol-version' } });
    const mPost = await raw('POST', '/api/mcp', { headers: { Origin: evil }, body: { jsonrpc: '2.0', id: 1, method: 'tools/list' } });
    const acah = String(mPre.headers['access-control-allow-headers'] || '').toLowerCase();
    check('T4 CORS: /api/mcp acepta el preflight de otro origen (MCP Inspector) con Authorization y Mcp-Protocol-Version', () =>
      mPre.status === 204 && mPre.headers['access-control-allow-origin'] === '*' && /authorization/.test(acah) && /mcp-protocol-version/.test(acah)
      && !mPre.headers['access-control-allow-credentials']);
    check('T4 CORS: un POST a /api/mcp desde otro origen llega al servidor (401 sin clave, no 403 de origen)', () =>
      mPost.status === 401 && mPost.headers['access-control-allow-origin'] === '*');
    const uPre = await raw('OPTIONS', '/api/v1/usage', { headers: { Origin: evil, 'Access-Control-Request-Method': 'GET' } });
    const pGet = await raw('GET', '/api/payments/plans', { headers: { Origin: evil } });
    const oPost = await raw('POST', '/api/v1/openapi.json', { headers: { Origin: evil }, body: {} });
    check('T4 CORS: el resto de la API sigue cerrado a orígenes ajenos (403 origin_not_allowed)', () =>
      uPre.status === 403 && pGet.status === 403 && pGet.data.error === 'origin_not_allowed' && !pGet.headers['access-control-allow-origin']
      && oPost.status === 403);
    const iPre = await raw('OPTIONS', '/api/invoicing/invoices', { headers: { Origin: 'http://localhost:5173', 'Access-Control-Request-Method': 'POST',
      'Access-Control-Request-Headers': 'authorization,content-type,idempotency-key,prefer' } });
    const iah = String(iPre.headers['access-control-allow-headers'] || '').toLowerCase();
    check('T4 CORS: la web puede mandar Idempotency-Key y Prefer (allowedHeaders)', () =>
      iPre.status === 204 && iPre.headers['access-control-allow-origin'] === 'http://localhost:5173' && /idempotency-key/.test(iah) && /prefer/.test(iah));

    // ═══ Cambiar/restablecer la contraseña anula los enlaces pendientes ═══
    const PW = mk('pro', { password: 'T4PwdOld!xx', email: 't4-pwd@nokfi.local' });
    const PW2 = mk('mini', { password: 'T4PwdOld!yy', email: 't4-pwd@nokfi.local' });
    const pwTok = createSession(PW.id, '127.0.0.1').token;
    const reset1 = db.createResetToken(PW.id, 'password_reset', 30).token;
    const recov1 = db.createResetToken(PW2.id, 'recovery', 30).token;
    db.createOtp(PW.email);
    const ch = await post('/api/auth/change-password', { current_password: 'T4PwdOld!xx', new_password: 'T4PwdNew!xx' }, pwTok);
    const useReset = await post('/api/auth/confirm-password-reset', { token: reset1, new_password: 'T4PwdAtk!xx' });
    const useRecov = await post('/api/auth/confirm-recovery', { recovery_token: recov1, license_key: PW.key, new_password: 'T4PwdAtk!xx' });
    const otpLive = getDB().prepare('SELECT COUNT(*) c FROM otp_codes WHERE email = ? AND used = 0').get(PW.email).c;
    check('T4 contraseña: tras cambiarla, el enlace de restablecer pedido antes ya no vale (400)', () =>
      ch.status === 200 && useReset.status === 400 && useReset.data.error === 'invalid_or_expired_token');
    check('T4 contraseña: tras cambiarla, la recuperación pendiente del mismo email y su código OTP tampoco valen', () =>
      useRecov.status === 400 && useRecov.data.error === 'invalid_or_expired_token' && otpLive === 0);
    const lgNew = await post('/api/auth/login', { email: PW.email, license_key: PW.key, password: 'T4PwdNew!xx' });
    check('T4 contraseña: la contraseña nueva sigue valiendo (nadie la pisó con el enlace viejo)', () => lgNew.status === 200);
    const resetA = db.createResetToken(PW.id, 'password_reset', 30).token;
    const resetB = db.createResetToken(PW.id, 'password_reset', 30).token;
    const useA = await post('/api/auth/confirm-password-reset', { token: resetA, new_password: 'T4PwdRst!xx' });
    const useB = await post('/api/auth/confirm-password-reset', { token: resetB, new_password: 'T4PwdAtk!xx' });
    check('T4 contraseña: al restablecerla con un enlace, el otro enlace pendiente deja de valer', () =>
      useA.status === 200 && useB.status === 400);

    // ═══ A6: Idempotency-Key también al emitir/rectificar desde la web ═══
    const IV = mk('pro', { password: 'T4InvPass!x' });
    const ivTok = createSession(IV.id, '127.0.0.1').token;
    await put('/api/invoicing/settings', { legal_name: 'Taller T4 SL', tax_id: 'B12345674', address: 'Calle Real 3', postal_code: '28013', city: 'Madrid' }, ivTok);
    const invBody = { customer: { name: 'Ana López Pérez', tax_id: '12345678Z', address: 'Av. Sol 5', postal_code: '41001', city: 'Sevilla' },
      lines: [{ description: 'Reparación', quantity: 1, unit_price: 100 }] };
    const countInv = () => getDB().prepare('SELECT COUNT(*) c FROM invoices WHERE license_id = ?').get(IV.id).c;
    const auth = { Authorization: `Bearer ${ivTok}`, 'Idempotency-Key': 'web-t4-1' };
    const i1 = await raw('POST', '/api/invoicing/invoices', { headers: auth, body: invBody });
    const i2 = await raw('POST', '/api/invoicing/invoices', { headers: auth, body: invBody });
    check('T4 A6: emitir dos veces desde la web con la misma Idempotency-Key crea UNA factura y repite la respuesta', () =>
      i1.status === 201 && i2.status === 201 && i1.data.id === i2.data.id && i2.headers['idempotent-replayed'] === 'true' && countInv() === 1);
    const i3 = await raw('POST', '/api/invoicing/invoices', { headers: auth, body: { ...invBody, notes: 'otra' } });
    const i4 = await raw('POST', '/api/invoicing/invoices', { headers: { Authorization: `Bearer ${ivTok}`, 'Idempotency-Key': 'web-t4-2' }, body: invBody });
    check('T4 A6: misma clave con otra factura → 422; otra clave → factura nueva', () =>
      i3.status === 422 && i3.data.error === 'idempotency_key_reused' && i4.status === 201 && i4.data.id !== i1.data.id && countInv() === 2);
    const rBody = { rectifies_id: i1.data.id, rectification_kind: 'R1', rectification_reason: 'Error en el importe', lines: [{ description: 'Reparación', quantity: -1, unit_price: 100 }] };
    const rAuth = { Authorization: `Bearer ${ivTok}`, 'Idempotency-Key': 'web-t4-rect' };
    const r1 = await raw('POST', '/api/invoicing/invoices', { headers: rAuth, body: rBody });
    const r2 = await raw('POST', '/api/invoicing/invoices', { headers: rAuth, body: rBody });
    check('T4 A6: rectificar dos veces con la misma clave crea UNA rectificativa', () =>
      r1.status === 201 && r2.status === 201 && r1.data.id === r2.data.id && countInv() === 3);
    const ttl = getDB().prepare("SELECT ttl_hours FROM idempotency_keys WHERE license_id = ? AND idem_key = 'web:web-t4-1'").get(IV.id);
    const i5 = await raw('POST', '/api/invoicing/invoices', { headers: { Authorization: `Bearer ${ivTok}` }, body: invBody });
    check('T4 A6: la clave web se guarda 30 días en su propio espacio y sin clave se emite como siempre', () =>
      ttl?.ttl_hours === 720 && i5.status === 201 && countInv() === 4);

  } finally {
    global.fetch = saved.fetch;
    for (const [k, v] of Object.entries({ STRIPE_SECRET_KEY: saved.key, STRIPE_PRICE_MINI: saved.mini, STRIPE_PRICE_PRO: saved.pro,
      STRIPE_PRICE_MAX: saved.max, STRIPE_PRICE_PACK_50: saved.pack, LANDING_PUBLIC_URL: saved.landing, APP_PUBLIC_URL: saved.app })) {
      if (v === undefined) delete process.env[k]; else process.env[k] = v;
    }
  }
};
