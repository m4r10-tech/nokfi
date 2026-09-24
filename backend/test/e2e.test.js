/**
 * e2e test: Fase 2 fingerprint→password + Fase 1 reveal
 *
 * Corre sobre un DB temporal. Usa un PORT aleatorio para no chocar
 * con servers existentes. Contraseñas ≥8 caracteres todas.
 *
 * Uso: node test/e2e.test.js
 */

'use strict';

// ── Entorno ──────────────────────────────────────────────────
process.env.NODE_ENV = 'test';
process.env.PORT = '3999';               // fijo: server.js auto-listen al requerirlo
process.env.DB_PATH = __dirname + '/test-e2e.db';
process.env.ADMIN_SECRET = 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4';
process.env.BASE_URL = 'http://localhost:3999';
// Determinismo: forzamos los precios del catálogo /plans a los defaults 5/20/50
// ANTES de que server.js corra dotenv.config() (sin override, no nos pisa). Así el
// smoke de /plans no depende de un .env local con valores distintos.
process.env.PLAN_PRICE_MINI_EUR = '5';
process.env.PLAN_PRICE_PRO_EUR = '20';
process.env.PLAN_PRICE_MAX_EUR = '50';

const fs = require('fs');
const http = require('http');
const { getDB } = require('../db/database');

// ── helpers ──────────────────────────────────────────────────
let baseUrl = '';
let adminSecret = process.env.ADMIN_SECRET;

function call(method, path, opts = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, baseUrl);
    const body = opts.body !== undefined && opts.body !== null
      ? JSON.stringify(opts.body)
      : undefined;
    const headers = { 'Content-Type': 'application/json' };
    if (opts.auth) {
      headers['Authorization'] = opts.auth === 'admin'
        ? `Bearer ${adminSecret}`
        : `Bearer ${opts.auth}`;
    }

    const req = http.request(url.href, { method, headers }, (res) => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => {
        let parsed;
        try { parsed = JSON.parse(data); } catch { parsed = data; }
        resolve({ status: res.statusCode, data: parsed });
      });
    });
    req.on('error', reject);
    req.setTimeout(5000, () => { req.destroy(); reject(new Error('timeout')); });
    if (body) req.write(body);
    req.end();
  });
}

async function post(path, body, auth) { return call('POST', path, { body, auth }); }
async function put(path, body, auth) { return call('PUT', path, { body, auth }); }
async function get(path, auth) { return call('GET', path, { auth }); }

let passed = 0;
let failed = 0;
function check(label, fn) {
  const ok = fn();
  if (ok) { passed++; console.log('✅', label); }
  else { failed++; console.log('❌', label); }
}
function checkAsync(label, promise, fn) {
  return promise.then(r => {
    const ok = fn(r);
    if (ok) { passed++; console.log('✅', label); }
    else { failed++; console.log('❌', label, '→', JSON.stringify(r).slice(0, 120)); }
    return r;
  }).catch(e => {
    failed++; console.log('❌', label, '→', e.message);
  });
}

// ── setup: init DB + start server ────────────────────────────
async function main() {
  // clean previous test DB
  try { fs.unlinkSync(process.env.DB_PATH); } catch {}

  // require server.js → initDB() + listen() automáticos (ver server.js:252)
  require('../server');
  // Determinismo: los tests de pago llaman a handlers que leen STRIPE_SECRET_KEY
  // en tiempo de petición. server.js ejecuta dotenv.config() al requerirlo y podría
  // haber cargado una key real del .env local. La borramos para que los asserts sean
  // reproducibles/offline (checkout → stripe_not_configured; portal legacy no la usa).
  delete process.env.STRIPE_SECRET_KEY;
  delete process.env.STRIPE_WEBHOOK_SECRET;
  baseUrl = `http://localhost:${process.env.PORT}`;

  // Esperar a que el server escuche (poll /health)
  let ready = false;
  for (let i = 0; i < 40; i++) {
    try {
      const r = await get('/health');
      if (r.status === 200) { ready = true; break; }
    } catch {}
    await new Promise(r => setTimeout(r, 100));
  }
  if (!ready) { console.error('❌ Server no arrancó'); process.exit(1); }
  console.log(`Server en ${baseUrl}`);

  // ── helpers ──────────────────────────────────────────────
  let token = null;       // user session token
  let licenseKey = null;  // created license key
  let licenseId = null;
  let resetToken = null;  // for confirm-password-reset
  const testEmail = 'e2e-test@nokfi.local';
  const testPassword = 'StrongP4ss!';

  try {

  // ═══════════════════════════════════════════════════════════
  // 1. Admin: create license WITH password
  // ═══════════════════════════════════════════════════════════
  await checkAsync('admin createLicense+password (Fase 3 plan=mini) → 201',
    post('/api/admin/licenses', { email: testEmail, plan: 'mini', password: testPassword }, 'admin'),
    r => {
      if (r.status !== 201) return false;
      licenseKey = r.data.key;
      licenseId = r.data.id;
      return r.status === 201 && !!r.data.key && !!r.data.password_hash && r.data.plan === 'mini';
    }
  );

  check('admin → password_hash está seteado',
    () => typeof licenseKey === 'string' && licenseKey.length === 19
  );

  let licenseDetail;
  await checkAsync('admin GET → ve password_hash',
    get(`/api/admin/licenses/${licenseId}`, 'admin'),
    r => {
      licenseDetail = r.data;
      return r.status === 200 && !!r.data.password_hash;
    }
  );

  // ═══════════════════════════════════════════════════════════
  // 2. Activate (ya tiene password → 409)
  // ═══════════════════════════════════════════════════════════
  await checkAsync('activate ya activada → 409 already_activated',
    post('/api/auth/activate', { email: testEmail, license_key: licenseKey, password: 'AnotherPass99!' }),
    r => r.status === 409 && r.data.error === 'already_activated'
  );

  // ═══════════════════════════════════════════════════════════
  // 3. Login
  // ═══════════════════════════════════════════════════════════
  await checkAsync('login ok → 200 + token',
    post('/api/auth/login', { email: testEmail, license_key: licenseKey, password: testPassword }),
    r => {
      if (r.status !== 200 || !r.data.token) return false;
      token = r.data.token;
      return r.status === 200 && r.data.success;
    }
  );

  // publicLicenseView NO filtra password_hash
  await checkAsync('publicLicenseView no expone password_hash',
    post('/api/auth/login', { email: testEmail, license_key: licenseKey, password: testPassword }),
    r => r.data.license && r.data.license.password_hash === undefined
  );

  // bad password
  await checkAsync('login bad pass → 401 genérico',
    post('/api/auth/login', { email: testEmail, license_key: licenseKey, password: 'WrongPwd123!' }),
    r => r.status === 401 && r.data.error === 'invalid_credentials'
  );

  // key inexistente
  await checkAsync('login key inex → 401 genérico',
    post('/api/auth/login', { email: testEmail, license_key: 'DEAD-BEEF-CAFE-F00D', password: testPassword }),
    r => r.status === 401 && r.data.error === 'invalid_credentials'
  );

  // key malformada
  await checkAsync('login key malformada → 400',
    post('/api/auth/login', { email: testEmail, license_key: 'bad-key', password: testPassword }),
    r => r.status === 400
  );

  // ═══════════════════════════════════════════════════════════
  // 4. Verify
  // ═══════════════════════════════════════════════════════════
  await checkAsync('verify → valid',
    post('/api/auth/verify', null, token),
    r => r.status === 200 && r.data.valid === true
  );

  // ═══════════════════════════════════════════════════════════
  // 5. Reveal key
  // ═══════════════════════════════════════════════════════════
  await checkAsync('reveal-key ok → clave',
    post('/api/auth/reveal-key', { password: testPassword }, token),
    r => r.status === 200 && r.data.key === licenseKey
  );

  await checkAsync('reveal-key bad pass → 401',
    post('/api/auth/reveal-key', { password: 'WrongPwd123!' }, token),
    r => r.status === 401
  );

  await checkAsync('reveal-key sin auth → 401',
    post('/api/auth/reveal-key', { password: testPassword }),
    r => r.status === 401
  );

  // ═══════════════════════════════════════════════════════════
  // 6. Change password
  // ═══════════════════════════════════════════════════════════
  const newPassword = 'NuevaCl4ve!';

  await checkAsync('change-password current mala → 401',
    post('/api/auth/change-password', { current_password: 'WrongPwd123!', new_password: newPassword }, token),
    r => r.status === 401
  );

  await checkAsync('change-password débil (<8) → 400',
    post('/api/auth/change-password', { current_password: testPassword, new_password: 'Short1' }, token),
    r => r.status === 400 && r.data.error === 'weak_password'
  );

  await checkAsync('change-password ok → 200',
    post('/api/auth/change-password', { current_password: testPassword, new_password: newPassword }, token),
    r => r.status === 200 && r.data.success === true
  );

  // login con pass nueva
  await checkAsync('login con pass nueva → 200',
    post('/api/auth/login', { email: testEmail, license_key: licenseKey, password: newPassword }),
    r => {
      if (r.status === 200) token = r.data.token;
      return r.status === 200 && r.data.success;
    }
  );

  // ═══════════════════════════════════════════════════════════
  // 7. Request password reset (auto-email) — ANTES del admin reset
  //    para evitar el límite 1/año que clearPasswordAndSessions setea.
  // ═══════════════════════════════════════════════════════════
  // NOTA: no envía email real en test (mailer falla silenciosamente en test sin SMTP)
  // pero el endpoint siempre responde 200 genérico por diseño anti-enumeración
  await checkAsync('request-password-reset → 200 genérico',
    post('/api/auth/request-password-reset', { email: testEmail, license_key: licenseKey }),
    r => r.status === 200 && r.data.success === true
  );

  // request para licencia inexistente también 200 genérico (key hex válida)
  await checkAsync('request-pw-reset licencia inex → 200 genérico',
    post('/api/auth/request-password-reset', { email: 'noexiste@test.local', license_key: 'AAAA-BBBB-CCCC-DDDD' }),
    r => r.status === 200 && r.data.success === true
  );

  // ═══════════════════════════════════════════════════════════
  // 8. Confirm password reset (token inválido)
  // ═══════════════════════════════════════════════════════════
  await checkAsync('confirm-password-reset token malo → 400',
    post('/api/auth/confirm-password-reset', { token: 'token-inventado', new_password: 'SomePass99!' }),
    r => r.status === 400
  );

  // ═══════════════════════════════════════════════════════════
  // 9. request-password-reset con token REAL (vía DB)
  // ═══════════════════════════════════════════════════════════
  const { createResetToken: createRT } = require('../db/database');
  const rt = createRT(licenseId, 'password_reset', 30);
  resetToken = rt.token;
  console.log('   (reset token creado vía DB:', resetToken.slice(0, 12) + '...)');

  await checkAsync('confirm-password-reset con token real → 200 + sesión',
    post('/api/auth/confirm-password-reset', { token: resetToken, new_password: 'ResetPass99!' }),
    r => r.status === 200 && r.data.success && !!r.data.token
  );

  // ═══════════════════════════════════════════════════════════
  // 10. Admin reset-password (fuerza clearPasswordAndSessions)
  // ═══════════════════════════════════════════════════════════
  // refrescar token: el reset anterior revocó... no, las sesiones seguían.
  // Hacemos login de nuevo para tener token fresco.
  await checkAsync('login para admin-reset → 200',
    post('/api/auth/login', { email: testEmail, license_key: licenseKey, password: 'ResetPass99!' }),
    r => {
      if (r.status === 200) token = r.data.token;
      return r.status === 200;
    }
  );

  await checkAsync('admin reset-password → 200',
    post(`/api/admin/licenses/${licenseId}/reset-password`, null, 'admin'),
    r => r.status === 200 && r.data.password_hash === null
  );

  // sesión revocada tras reset
  await checkAsync('verify tras reset admin → 401 (sesión revocada)',
    post('/api/auth/verify', null, token),
    r => r.status === 401
  );

  // login tras reset → not_activated (sin contraseña)
  await checkAsync('login tras reset → 409 not_activated',
    post('/api/auth/login', { email: testEmail, license_key: licenseKey, password: 'ResetPass99!' }),
    r => r.status === 409 && r.data.error === 'not_activated'
  );

  // ═══════════════════════════════════════════════════════════
  // 11. Activate tras reset (ahora sin password → debe funcionar)
  // ═══════════════════════════════════════════════════════════
  const freshPassword = 'Reactiv8ted!';  // ≥8 chars ✓
  await checkAsync('activate tras reset → 201 + token',
    post('/api/auth/activate', { email: testEmail, license_key: licenseKey, password: freshPassword }),
    r => {
      if (r.status === 201) token = r.data.token;
      return r.status === 201 && r.data.success && !!r.data.token;
    }
  );

  // ═══════════════════════════════════════════════════════════
  // 12. Admin set-password (asigna a licencia que YA tiene)
  // ═══════════════════════════════════════════════════════════
  const adminSetPass = 'AdminSetP4ss!';
  await checkAsync('admin set-password → 200',
    post(`/api/admin/licenses/${licenseId}/set-password`, { password: adminSetPass }, 'admin'),
    r => r.status === 200 && !!r.data.password_hash
  );

  // login con la password seteada por admin
  await checkAsync('login con pass set por admin → 200',
    post('/api/auth/login', { email: testEmail, license_key: licenseKey, password: adminSetPass }),
    r => {
      if (r.status === 200) token = r.data.token;
      return r.status === 200 && r.data.success;
    }
  );

  // ═══════════════════════════════════════════════════════════
  // 12. Fase 1: /api/payments/stripe/reveal
  // ═══════════════════════════════════════════════════════════
  // Sin session_id
  await checkAsync('reveal sin session_id → 400',
    get('/api/payments/stripe/reveal'),
    r => r.status === 400
  );

  // Con session_id inexistente
  await checkAsync('reveal session_id inex → 404',
    get('/api/payments/stripe/reveal?session_id=cs_test_inexistente'),
    r => r.status === 404 && r.data.error === 'not_found'
  );

  // Crear licencia y setear payment_ref directo en DB (el admin no expone esos campos)
  let paidLicenseKey;
  await checkAsync('admin createLicense (para reveal) → 201',
    post('/api/admin/licenses', { email: 'paid@nokfi.local', plan: 'basic' }, 'admin'),
    r => {
      if (r.status !== 201) return false;
      paidLicenseKey = r.data.key;
      // Setear payment_ref directo en DB para simular webhook ya procesado
      getDB().prepare(`UPDATE licenses SET payment_provider='stripe', payment_ref='cs_test_reveal_ok' WHERE id=?`)
        .run(r.data.id);
      return true;
    }
  );

  await checkAsync('reveal ok → 200 + clave',
    get('/api/payments/stripe/reveal?session_id=cs_test_reveal_ok'),
    r => r.status === 200 && r.data.key === paidLicenseKey && r.data.email === 'paid@nokfi.local'
  );

  // ═══════════════════════════════════════════════════════════
  // 14. Weak password en activate (coverage extra)
  // ═══════════════════════════════════════════════════════════
  // Creamos otra licencia fresca sin password
  let freshLicenseKey;
  await checkAsync('admin createLicense fresh (sin pass) → 201',
    post('/api/admin/licenses', { email: 'fresh@nokfi.local', plan: 'basic' }, 'admin'),
    r => {
      if (r.status === 201) freshLicenseKey = r.data.key;
      return r.status === 201 && r.data.password_hash === null;
    }
  );

  await checkAsync('activate weak password → 400',
    post('/api/auth/activate', { email: 'fresh@nokfi.local', license_key: freshLicenseKey, password: 'Short1' }),
    r => r.status === 400 && r.data.error === 'weak_password'
  );

  // ═══════════════════════════════════════════════════════════
  // 15. Logout
  // ═══════════════════════════════════════════════════════════
  await checkAsync('logout → 200',
    post('/api/auth/logout', null, token),
    r => r.status === 200 && r.data.success === true
  );

  await checkAsync('verify tras logout → 401',
    post('/api/auth/verify', null, token),
    r => r.status === 401
  );

  // ═══════════════════════════════════════════════════════════
  // FASE 3 — SUSCRIPCIÓN (planes mini/pro/max, portal, billing, MRR)
  // ═══════════════════════════════════════════════════════════
  const { aiQuotaForPlan, getLicenseByStripeSubscriptionId, updateSubscription, createLicense: dbCreateLicense } = require('../db/database');

  // — 3.a Coerción de plan legacy 'basic' → 'mini' (back-compat) + billing legacy —
  await checkAsync('admin createLicense plan=basic (coerción) → 201 + plan=mini + billing=legacy',
    post('/api/admin/licenses', { email: 'coerce@nokfi.local', plan: 'basic' }, 'admin'),
    r => r.status === 201 && r.data.plan === 'mini' && r.data.billing_model === 'legacy'
  );

  // — 3.b publicLicenseView expone campos de suscripción (ai_quota tiered) —
  await checkAsync('login Fase 3 → 200 + license.ai_quota + sin stripe',
    post('/api/auth/login', { email: testEmail, license_key: licenseKey, password: 'AdminSetP4ss!' }),
    r => {
      if (r.status === 200) token = r.data.token;
      return r.status === 200
        && r.data.license.ai_quota === 10          // mini → 10
        && r.data.license.has_subscription === false
        && r.data.license.billing_model === 'legacy'
        && r.data.license.cancel_at_period_end === false
        && r.data.license.current_period_ends_at === null
        && r.data.license.trial_ends_at === null   // sin trial → null expuesto
        && r.data.license.password_hash === undefined; // nunca expuesto
    }
  );

  // — 3.c aiQuotaForPlan tiered (mini 10 / pro 50 / max 130) —
  check('aiQuotaForPlan tiered mini=10 pro=50 max=130 unknown=10',
    () => aiQuotaForPlan('mini') === 10 && aiQuotaForPlan('pro') === 50
       && aiQuotaForPlan('max') === 130 && aiQuotaForPlan('???') === 10
  );

  // — 3.d Stripe checkout sin STRIPE_SECRET_KEY → 500 stripe_not_configured —
  await checkAsync('stripe create-checkout sin key → 500 stripe_not_configured',
    post('/api/payments/stripe/create-checkout', { email: 'buy@nokfi.local', plan: 'pro' }),
    r => r.status === 500 && r.data.error === 'stripe_not_configured'
  );
  // Deuda I: plan inválido → 400 invalid_plan ANTES de tocar Stripe (no coercionar).
  await checkAsync('stripe create-checkout plan inválido → 400 invalid_plan',
    post('/api/payments/stripe/create-checkout', { email: 'buy@nokfi.local', plan: 'garbage' }),
    r => r.status === 400 && r.data.error === 'invalid_plan'
  );
  // Deuda B: con key pero sin STRIPE_PRICE_<PLAN> → 500 stripe_price_not_configured.
  // El guard va DESPUÉS del de STRIPE_SECRET_KEY. Simulamos una key presente (el
  // resto del suite borra la key para forzar stripe_not_configured) y ausencia de
  // price_id → debe fallar con el mensaje específico, sin tocar Stripe.
  process.env.STRIPE_SECRET_KEY = 'sk_test_fake_000000000000';
  delete process.env.STRIPE_PRICE_MINI;
  delete process.env.STRIPE_PRICE_PRO;
  delete process.env.STRIPE_PRICE_MAX;
  await checkAsync('stripe create-checkout sin price_id → 500 stripe_price_not_configured',
    post('/api/payments/stripe/create-checkout', { email: 'buy@nokfi.local', plan: 'pro' }),
    r => r.status === 500 && r.data.error === 'stripe_price_not_configured'
  );
  delete process.env.STRIPE_SECRET_KEY;

  // — 3.e Proveedores alternativos eliminados al pasar a Stripe-only →
  //     sus rutas ya no existen; Express cae al 404 global del backend —
  await checkAsync('paypal create-order → 404 (ruta retirada)',
    post('/api/payments/paypal/create-order', { email: 'x@nokfi.local', plan: 'mini' }),
    r => r.status === 404 && r.data.error === 'not_found'
  );
  await checkAsync('coinbase create-charge → 404 (ruta retirada)',
    post('/api/payments/coinbase/create-charge', { email: 'x@nokfi.local', plan: 'mini' }),
    r => r.status === 404 && r.data.error === 'not_found'
  );
  await checkAsync('revolut create-order → 404 (ruta retirada)',
    post('/api/payments/revolut/create-order', { email: 'x@nokfi.local', plan: 'mini' }),
    r => r.status === 404 && r.data.error === 'not_found'
  );

  // — 3.f Portal: sin auth → 401 —
  await checkAsync('stripe create-portal-session sin auth → 401',
    post('/api/payments/stripe/create-portal-session', null),
    r => r.status === 401
  );
  // — 3.g Portal: licencia legacy (sin stripe_customer_id) → 400 not_stripe_customer —
  await checkAsync('stripe create-portal-session legacy → 400 not_stripe_customer',
    post('/api/payments/stripe/create-portal-session', null, token),
    r => r.status === 400 && r.data.error === 'not_stripe_customer'
  );

  // — 3.h Helpers de suscripción a nivel BD (simulan webhook) —
  const subLicense = dbCreateLicense({
    email: 'sub@nokfi.local', plan: 'pro', payment_provider: 'stripe',
    payment_ref: 'cs_sub_test', amount_eur: 20, billing_model: 'subscription',
    stripe_customer_id: 'cus_test_pro', stripe_subscription_id: 'sub_test_pro',
    current_period_ends_at: '2026-08-19T00:00:00Z', created_by: 'webhook_stripe_sub'
  });
  check('createLicense sub → billing=subscription + stripe fields',
    () => subLicense.billing_model === 'subscription'
       && subLicense.stripe_customer_id === 'cus_test_pro'
       && subLicense.stripe_subscription_id === 'sub_test_pro'
       && subLicense.current_period_ends_at === '2026-08-19T00:00:00Z'
  );
  check('getLicenseByStripeSubscriptionId localiza la licencia',
    () => { const f = getLicenseByStripeSubscriptionId('sub_test_pro'); return !!f && f.id === subLicense.id; }
  );
  // simulate customer.subscription.updated: cancel programado
  const cancelled = updateSubscription(subLicense.id, {
    plan: 'max', cancel_at_period_end: 1, current_period_ends_at: '2026-09-19T00:00:00Z'
  });
  check('updateSubscription → plan change + cancel_at_period_end=1',
    () => cancelled.plan === 'max' && cancelled.cancel_at_period_end === 1
       && cancelled.current_period_ends_at === '2026-09-19T00:00:00Z'
  );
  // simulate customer.subscription.deleted → expired
  const expired = updateSubscription(subLicense.id, { status: 'expired' });
  check('updateSubscription → status=expired',
    () => expired.status === 'expired'
  );

  // — 3.i requireLicense bloquea licencia 'expired' (vía /auth/verify) —
  // sesión creada directamente en BD sobre la licencia expirada:
  const { createSession } = require('../db/database');
  const expSess = createSession(subLicense.id, '127.0.0.1');
  // Añadimos un getLicenseByEmailAndKey? no hace falta: usamos verify con el token
  await checkAsync('verify licencia expired → 403 license_inactive',
    post('/api/auth/verify', null, expSess.token),
    r => r.status === 403 && r.data.error === 'license_inactive'
  );

  // — 3.j Admin PUT updateLicense acepta plan mini/pro/max + status expired —
  // Reusamos la licencia principal (id=licenseId, plan era 'mini').
  // `post` siempre envía POST; para PUT usamos `call` directamente.
  await checkAsync('admin PUT plan=pro → 200 + plan=pro',
    call('PUT', `/api/admin/licenses/${licenseId}`, { body: { plan: 'pro' }, auth: 'admin' }),
    r => r.status === 200 && r.data.plan === 'pro'
  );
  await checkAsync('admin PUT plan=basic (rechazado) → 400 invalid_plan',
    call('PUT', `/api/admin/licenses/${licenseId}`, { body: { plan: 'basic' }, auth: 'admin' }),
    r => r.status === 400 && r.data.error === 'invalid_plan'
  );
  await checkAsync('admin PUT status=expired → 200 + expired',
    call('PUT', `/api/admin/licenses/${licenseId}`, { body: { status: 'expired' }, auth: 'admin' }),
    r => r.status === 200 && r.data.status === 'expired'
  );
  // revierte a mini/active para no romper tests siguientes si los hubiera
  call('PUT', `/api/admin/licenses/${licenseId}`, { body: { status: 'active', plan: 'mini' }, auth: 'admin' });

  updateSubscription(subLicense.id, { status: 'active', plan: 'pro', billing_model: 'subscription', stripe_customer_id: 'cus_test_pro' });
  await checkAsync('admin stats (Fase 3) → MRR pro 20€ + plans/billing desglose',
    get('/api/admin/stats', 'admin'),
    r => r.status === 200
      && typeof r.data.revenue.mrr_eur === 'number'
      && r.data.revenue.mrr_eur >= 20               // el pro subscription cuenta (20€)
      && r.data.billing && r.data.billing.subscription >= 1
      && r.data.plans && r.data.plans.pro && r.data.plans.pro.active >= 1
      && typeof r.data.licenses.expired === 'number'
  );

  // ═══════════════════════════════════════════════════════════
  // 3.l Trial de 14 días (plan mini) — trial_ends_at se persiste/expone, se
  //     cuenta en billing.trialing, y NO suma al MRR ni a paying_subscribers.
  //     Simula el flujo real del webhook: alta con trial futuro → primer cobro
  //     (invoice.paid amount>0) limpia trial_ends_at a null.
  // ═══════════════════════════════════════════════════════════
  const before = await get('/api/admin/stats', 'admin');
  const mrrBefore = before.data.revenue.mrr_eur;
  const payingBefore = before.data.billing.paying_subscribers;
  const trialingBefore = before.data.billing.trialing ?? 0;

  // Alta con trial (como la que haría handleStripeCheckoutCompleted del mini)
  const trialEndISO = new Date(Date.now() + 14 * 86400000).toISOString();
  const trialLicense = dbCreateLicense({
    email: 'trial@nokfi.local', plan: 'mini', payment_provider: 'stripe',
    payment_ref: 'cs_trial_test', billing_model: 'subscription',
    stripe_customer_id: 'cus_trial', stripe_subscription_id: 'sub_trial',
    current_period_ends_at: trialEndISO, trial_ends_at: trialEndISO,
    password: 'TrialP4ss!', created_by: 'webhook_stripe_sub'
  });
  check('createLicense con trial → trial_ends_at persistido (ISO futuro)',
    () => trialLicense.trial_ends_at === trialEndISO
  );

  // Stats: la licencia en trial cuenta como trialing, NO como paying, NO suma 5€
  await checkAsync('stats con trial → billing.trialing +1, MRR sin 5€ del trial, paying sin cambiar',
    get('/api/admin/stats', 'admin'),
    r => r.status === 200
      && r.data.billing.trialing === trialingBefore + 1
      && r.data.revenue.mrr_eur === mrrBefore              // el trial (5€) NO se suma al MRR
      && r.data.billing.paying_subscribers === payingBefore // el trial NO es paying subscriber
  );

  // login expone trial_ends_at (publicLicenseView — cambio Layer 2 en auth.js)
  await checkAsync('login licencia en trial → 200 + license.trial_ends_at expuesto',
    post('/api/auth/login', { email: 'trial@nokfi.local', license_key: trialLicense.key, password: 'TrialP4ss!' }),
    r => r.status === 200 && r.data.license.trial_ends_at === trialEndISO
  );

  // Simula invoice.paid con cobro real (día 14): clear trial_ends_at → null.
  // updateSubscription con null explícito (bug C) → setIf escribe NULL.
  const trialCleared = updateSubscription(trialLicense.id, { status: 'active', trial_ends_at: null });
  check('updateSubscription trial_ends_at=null → limpia el flag (fin de trial)',
    () => trialCleared.trial_ends_at === null
  );
  // Y stats vuelve a sin trialing (el trial ya no cuenta)
  await checkAsync('stats tras fin de trial → billing.trialing vuelve al valor previo',
    get('/api/admin/stats', 'admin'),
    r => r.status === 200 && r.data.billing.trialing === trialingBefore
  );

  // ═══════════════════════════════════════════════════════════
  // 3.k2 Chargebacks (sesión 2, #1/#16) — charge.dispute.created
  //     Webhook FIRMADO de verdad (HMAC-SHA256 como Stripe) contra la ruta
  //     real. El bug: la disputa llega referenciada por payment_intent (pi_…)
  //     y en DB se guardaba solo el cs_… de la Checkout Session → nunca había
  //     match y el evento se marcaba procesado → contracargo perdido.
  //     Ahora: match local por payment_intent_ref → revoca; sin match → 500
  //     para que Stripe reintente (y el evento queda processed=0).
  // ═══════════════════════════════════════════════════════════
  const crypto = require('crypto');
  const { getLicenseByPaymentIntent } = require('../db/database');
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_e2e_test_secret';

  function postStripeWebhook(payload, { badSig = false } = {}) {
    const secret = badSig ? 'whsec_WRONG' : process.env.STRIPE_WEBHOOK_SECRET;
    const rawBody = JSON.stringify(payload);
    const tsec = Math.floor(Date.now() / 1000);
    const sig = crypto.createHmac('sha256', secret).update(`${tsec}.${rawBody}`).digest('hex');
    return new Promise((resolve, reject) => {
      const req = http.request(`${baseUrl}/api/webhooks/stripe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Stripe-Signature': `t=${tsec},v1=${sig}` }
      }, (res) => {
        let data = '';
        res.on('data', d => data += d);
        res.on('end', () => {
          let parsed; try { parsed = JSON.parse(data); } catch { parsed = data; }
          resolve({ status: res.statusCode, data: parsed });
        });
      });
      req.on('error', reject);
      req.setTimeout(5000, () => { req.destroy(); reject(new Error('timeout')); });
      req.write(rawBody);
      req.end();
    });
  }

  const cbLicense = dbCreateLicense({
    email: 'cb@nokfi.local', plan: 'pro', payment_provider: 'stripe',
    payment_ref: 'cs_cb_test', payment_intent_ref: 'pi_cb_ok', billing_model: 'subscription',
    stripe_customer_id: 'cus_cb', stripe_subscription_id: 'sub_cb',
    password: 'CbP4ssword!', created_by: 'webhook_stripe_sub'
  });
  check('createLicense persiste payment_intent_ref (pi_…)',
    () => cbLicense.payment_intent_ref === 'pi_cb_ok'
  );
  check('getLicenseByPaymentIntent localiza la licencia por pi_…',
    () => getLicenseByPaymentIntent('stripe', 'pi_cb_ok')?.id === cbLicense.id
  );

  const cbSession = createSession(cbLicense.id, '127.0.0.1');
  check('sesión viva de la licencia antes de la disputa',
    () => !!getDB().prepare('SELECT id FROM sessions WHERE token = ?')
      .get(crypto.createHash('sha256').update(cbSession.token).digest('hex'))
  );

  const disputeOk = {
    id: 'evt_dispute_ok_1', type: 'charge.dispute.created',
    data: { object: { id: 'dp_test_1', object: 'dispute', charge: 'ch_cb_1', payment_intent: 'pi_cb_ok' } }
  };
  await checkAsync('webhook charge.dispute.created con pi conocido → 200 received',
    postStripeWebhook(disputeOk),
    r => r.status === 200 && r.data.received === true
  );
  check('la disputa revoca la licencia (status=revoked)',
    () => getDB().prepare('SELECT status FROM licenses WHERE id = ?').get(cbLicense.id).status === 'revoked'
  );
  check('la disputa cierra las sesiones de la licencia',
    () => getDB().prepare('SELECT COUNT(*) c FROM sessions WHERE license_id = ?').get(cbLicense.id).c === 0
  );
  check('el evento de disputa queda registrado processed=1',
    () => getDB().prepare("SELECT processed FROM payment_events WHERE provider='stripe' AND event_id='evt_dispute_ok_1'").get().processed === 1
  );

  // Disputa irresoluble: pi desconocido y sin STRIPE_SECRET_KEY (borrada al
  // inicio del suite) no hay resolución vía API → 500 para reintento de Stripe.
  const disputeUnknown = {
    id: 'evt_dispute_unknown_1', type: 'charge.dispute.created',
    data: { object: { id: 'dp_test_2', object: 'dispute', charge: 'ch_x', payment_intent: 'pi_desconocido' } }
  };
  await checkAsync('webhook dispute sin match → 500 dispute_unresolved (Stripe reintentará)',
    postStripeWebhook(disputeUnknown),
    r => r.status === 500 && r.data.error === 'dispute_unresolved'
  );
  check('el evento irresoluble queda processed=0 (visible en reconciliación)',
    () => getDB().prepare("SELECT processed FROM payment_events WHERE provider='stripe' AND event_id='evt_dispute_unknown_1'").get().processed === 0
  );

  await checkAsync('webhook con firma inválida → 400 invalid_signature',
    postStripeWebhook(disputeOk, { badSig: true }),
    r => r.status === 400 && r.data.error === 'invalid_signature'
  );

  delete process.env.STRIPE_WEBHOOK_SECRET;

  // ═══════════════════════════════════════════════════════════
  // 3.m Catálogo público GET /api/payments/plans (anti-drift env-driven)
  //     Público (sin auth), no depende de Stripe. Debe devolver los 3 planes con
  //     price_eur 5/20/50 (los defaults forzados arriba en el entorno) y trial
  //     ===true solo en mini. Pricing.jsx consume este endpoint.
  // ═══════════════════════════════════════════════════════════
  await checkAsync('GET /api/payments/plans → 200 + 3 planes + price_eur 5/20/50 + trial solo mini',
    get('/api/payments/plans'),
    r => {
      if (r.status !== 200 || !Array.isArray(r.data.plans) || r.data.plans.length !== 3) return false;
      const byId = Object.fromEntries(r.data.plans.map(p => [p.id, p]));
      return Boolean(byId.mini && byId.pro && byId.max)
        && byId.mini.price_eur === 5 && byId.mini.trial === true
        && byId.pro.price_eur === 20 && byId.pro.trial === false
        && byId.max.price_eur === 50 && byId.max.trial === false
        && typeof byId.mini.quota === 'number' && byId.mini.quota === 10;
    }
  );

  // ═══════════════════════════════════════════════════════════
  // 3.n Historial de análisis (G2): GET /api/analyses y GET /api/analyses/:id
  //     Persistencia scopeada por licencia. Se crean análisis VÍA DB DIRECTA
  //     (createAnalysis) para aislar de Gemini (que no está en el e2e). Se
  //     usan DOS licencias DEDICADAS y frescas (no la licencia principal del
  //     suite, que ya fue mutada por los tests de password-reset/change) para
  //     que el login sea determinista: una licencia solo ve su propio
  //     historial y obtiene 404 al pedir el análisis de otra.
  // ═══════════════════════════════════════════════════════════
  const { createAnalysis, listAnalyses, getAnalysis } = require('../db/database');

  // Licencia A (historial propia): fresca, password conocida y estable.
  let licenseKeyA = null, licenseIdA = null, tokenA = null;
  await checkAsync('admin createLicense A (historial, mini) → 201',
    post('/api/admin/licenses', { email: 'historial-a@nokfi.local', plan: 'mini', password: 'HistoryP4ss!' }, 'admin'),
    r => {
      if (r.status !== 201) return false;
      licenseKeyA = r.data.key; licenseIdA = r.data.id;
      return !!r.data.key && r.data.plan === 'mini';
    }
  );
  await checkAsync('login de licencia A → 200 (para tests de historial)',
    post('/api/auth/login', { email: 'historial-a@nokfi.local', license_key: licenseKeyA, password: 'HistoryP4ss!' }),
    r => { if (r.status === 200) tokenA = r.data.token; return r.status === 200; }
  );

  // Licencia B (ajena): para verificar el scoping.
  let licenseKeyB = null, licenseIdB = null;
  await checkAsync('admin createLicense B (ajena, para scoping) → 201',
    post('/api/admin/licenses', { email: 'historial-b@nokfi.local', plan: 'pro', password: 'OtherP4ss!' }, 'admin'),
    r => {
      if (r.status !== 201) return false;
      licenseKeyB = r.data.key; licenseIdB = r.data.id;
      return !!r.data.key && r.data.plan === 'pro';
    }
  );

  // Análisis de A (2) y de B (1) — vía DB directa, aislando de Gemini.
  const idA1 = createAnalysis({ license_id: licenseIdA, kind: 'excel', title: 'Stock / Almacén', result_html: '<h3>Resumen A1</h3>', prompt_chars: 123 });
  const idA2 = createAnalysis({ license_id: licenseIdA, kind: 'cuestionario', title: 'Diagnóstico', result_html: '<h3>Resumen A2</h3>', prompt_chars: 456 });
  const idB1 = createAnalysis({ license_id: licenseIdB, kind: 'excel', title: 'Caja B', result_html: '<h3>Resumen B1</h3>', prompt_chars: 789 });
  check('createAnalysis devuelve Number ids', () => [idA1, idA2, idB1].every(x => Number.isInteger(x)));

  checkAsync('GET /api/analyses SIN auth → 401',
    get('/api/analyses'),
    r => r.status === 401
  );

  await checkAsync('GET /api/analyses (A) → 200 + lista ligera (sin result_html) solo de A, recientes primero',
    get('/api/analyses', tokenA),
    r => {
      if (r.status !== 200 || !Array.isArray(r.data.analyses) || r.data.analyses.length !== 2) return false;
      const rows = r.data.analyses;
      // No expone result_html en la lista (ligera)
      if (rows.some(r => 'result_html' in r)) return false;
      // Orden DESC: el último insertado (idA2) primero. Campos presentes.
      return rows[0].id === idA2 && rows[1].id === idA1
        && rows[0].title === 'Diagnóstico' && rows[1].kind === 'excel'
        && typeof rows[0].created_at === 'string';
    }
  );

  await checkAsync('GET /api/analyses/:id propio (A) → 200 + result_html',
    get(`/api/analyses/${idA1}`, tokenA),
    r => r.status === 200 && r.data.id === idA1 && r.data.result_html === '<h3>Resumen A1</h3>' && r.data.title === 'Stock / Almacén'
  );

  await checkAsync('GET /api/analyses/:id AJENO (id de B con token de A) → 404 (scoping)',
    get(`/api/analyses/${idB1}`, tokenA),
    r => r.status === 404 && r.data.error === 'not_found'
  );

  await checkAsync('GET /api/analyses/:id inexistente → 404',
    get('/api/analyses/999999', tokenA),
    r => r.status === 404 && r.data.error === 'not_found'
  );

  await checkAsync('GET /api/analyses/:id no-numérico → 400',
    get('/api/analyses/abc', tokenA),
    r => r.status === 400 && r.data.error === 'invalid_id'
  );

  // getAnalysis/listAnalyses a nivel DB confirman el scoping (defensa directa).
  // (better-sqlite3 .get() devuelve undefined, no null, cuando no hay fila — por
  //  eso comparamos con !…, igual que hace routes/analyses.js con !analysis.)
  check('getAnalysis scoping: idB1 con licenseIdA → vacío, con licenseIdB → row',
    () => !getAnalysis(licenseIdA, idB1) && !!getAnalysis(licenseIdB, idB1)
  );
  check('listAnalyses: A tiene 2, B tiene 1 (listas separadas)',
    () => listAnalyses(licenseIdA).length === 2 && listAnalyses(licenseIdB).length === 1
  );

  // ── Integración REAL del path de captura (no aislada): stub de Gemini →
  //    POST /api/proxy/ai (routes/proxy.js real) → createAnalysis → history.
  //    Sustituye global.fetch por una respuesta canned con la forma real de
  //    Gemini (data.candidates[0].content.parts[].text) — aisla de red/claves
  //    y es determinista. Ningún otro test del suite usa fetch (usan http a
  //    localhost), así que el stub es local y se restaura. Comprueba que el
  //    análisis generado queda visible en el historial de SU licencia.
  const savedFetch = global.fetch;
  const origGeminiKey = process.env.GEMINI_API_KEY;
  const fakeGeminiHtml = '<h3>Diagnóstico fake</h3><p>Recomendación de prueba.</p>';
  const promptText = 'Analiza este negocio de prueba.';
  global.fetch = async () => ({
    ok: true, status: 200,
    json: async () => ({ candidates: [{ content: { parts: [{ text: fakeGeminiHtml }] } }] }),
    text: async () => ''
  });
  process.env.GEMINI_API_KEY = 'fake-key-for-test';

  await checkAsync('POST /api/proxy/ai (stub Gemini) → 200 + texto de la IA',
    post('/api/proxy/ai', { prompt: promptText, max_tokens: 100, kind: 'cuestionario', title: 'Diagnóstico de prueba' }, tokenA),
    r => r.status === 200 && r.data.text === fakeGeminiHtml
  );

  const capturedId = listAnalyses(licenseIdA)[0].id; // más recientes primero → recién capturado
  await checkAsync('GET /api/analyses incluye el análisis capturado (kind/title/prompt_chars correctos, lista ligera)',
    get('/api/analyses', tokenA),
    r => {
      if (r.status !== 200 || !Array.isArray(r.data.analyses)) return false;
      const last = r.data.analyses[0];
      return last.id === capturedId && last.kind === 'cuestionario'
        && last.title === 'Diagnóstico de prueba' && last.prompt_chars === promptText.length
        && !('result_html' in last); // lista ligera: sin result_html
    }
  );

  await checkAsync('GET /api/analyses/:id del capturado → 200 + result_html persistido',
    get(`/api/analyses/${capturedId}`, tokenA),
    r => r.status === 200 && r.data.result_html === fakeGeminiHtml && r.data.id === capturedId
  );

  global.fetch = savedFetch;
  if (origGeminiKey === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = origGeminiKey;

  // ═══════════════════════════════════════════════════════════
  // Deuda H — cuota diaria de IA ATOMICA (tabla `ai_usage`, slots UNIQUE).
  // Mini tiene cuota 10 (config/plans.js). Verificamos en vivo contra el endpoint
  // real POST /api/proxy/ai + stub de global.fetch determinista:
  //   (1) las 10 primeras pasan (200); la 11.ª → 429 con mensaje específico.
  //   (2) rollback: si Gemini falla (502/503), el slot se LIBERA → no cuenta.
  // Licencias frescas minis (ai_usage vacía hoy) para determinismo.
  // ═══════════════════════════════════════════════════════════
  {
    const { countAiAnalysesToday, aiQuotaForPlan } = require('../db/database');
    check('Deuda H: cuotas por plan = mini 10 / pro 50 / max 130 (aiQuotaForPlan)',
      () => aiQuotaForPlan('mini') === 10 && aiQuotaForPlan('pro') === 50 && aiQuotaForPlan('max') === 130
    );

    const savedFetch2 = global.fetch;
    const origGeminiKey2 = process.env.GEMINI_API_KEY;
    process.env.GEMINI_API_KEY = 'fake-key-for-quota-test';
    // Stub de éxito para las 10 llamadas que llenan la cuota (misma forma real
    // de la respuesta de Gemini que el test del proxy de arriba). Sin esto las
    // llamadas irían a Gemini real con la key falsa → 400.
    global.fetch = async () => ({
      ok: true, status: 200,
      json: async () => ({ candidates: [{ content: { parts: [{ text: '<p>ok</p>' }] } }] }),
      text: async () => ''
    });
    const quotaPrompt = { prompt: 'Análisis para la prueba de cuota.', max_tokens: 100 };
    const quotaEmail = 'quota-h@nokfi.local', quotaPass = 'QuotaPass12!';
    let quotaKey = null, quotaId = null, quotaToken = null;

    await checkAsync('Deuda H: admin createLicense mini (cuota) → 201',
      post('/api/admin/licenses', { email: quotaEmail, plan: 'mini', password: quotaPass }, 'admin'),
      r => { if (r.status === 201) { quotaKey = r.data.key; quotaId = r.data.id; } return r.status === 201; }
    );
    await checkAsync('Deuda H: login cuota → 200 + token',
      post('/api/auth/login', { email: quotaEmail, license_key: quotaKey, password: quotaPass }),
      r => { if (r.status === 200) quotaToken = r.data.token; return r.status === 200; }
    );

    // La cuota NO está agotada: una peticion que falle debe responder 502 y
    // liberar el slot ANTES de haber reservado (éxito no puede tambalear).
    // (comprobación del rollback en una licencia distinta, más abajo)

    // (1) Llenar la cuota: resolver todas las promesas secuencialmente (mejor-sqlite3
    //     serializa, así el orden es determinista). Cada 200 reserva y CONSERVA su slot.
    let tenOk = true;
    for (let i = 0; i < 10; i++) {
      const r = await post('/api/proxy/ai', quotaPrompt, quotaToken);
      if (r.status !== 200) tenOk = false;
    }
    check('Deuda H: 10 análisis mini (cuota 10) → los 10 fueron 200', () => tenOk);
    check('Deuda H: countAiAnalysesToday(id) == 10 tras los 10 usos', () => countAiAnalysesToday(quotaId) === 10);

    await checkAsync('Deuda H: 11.ª petición (cuota 10) → 429 + mensaje "Has agotado tu cuota diaria"',
      post('/api/proxy/ai', quotaPrompt, quotaToken),
      r => r.status === 429
        && r.data.error === 'license_daily_limit_reached'
        && typeof r.data.message === 'string'
        && r.data.message.includes('Has agotado tu cuota diaria')
        && r.data.message.includes('10') // menciona la cuota concreta
    );
    check('Deuda H: tras el 429, countAiAnalysesToday sigue == 10 (no se infló)', () => countAiAnalysesToday(quotaId) === 10);

    // (2) Rollback en una licencia fresca: Gemini falla → 502 → slot liberado.
    const rollEmail = 'quota-r@nokfi.local', rollPass = 'RollPass12!';
    let rKey = null, rId = null, rToken = null;
    await checkAsync('Deuda H: admin createLicense mini (rollback) → 201',
      post('/api/admin/licenses', { email: rollEmail, plan: 'mini', password: rollPass }, 'admin'),
      r => { if (r.status === 201) { rKey = r.data.key; rId = r.data.id; } return r.status === 201; }
    );
    await checkAsync('Deuda H: login rollback → 200 + token',
      post('/api/auth/login', { email: rollEmail, license_key: rKey, password: rollPass }),
      r => { if (r.status === 200) rToken = r.data.token; return r.status === 200; }
    );

    // error de proveedor (500) → 502 ai_provider_error y slot devuelto
    global.fetch = async () => ({ ok: false, status: 500, json: async () => ({}), text: async () => 'boom' });
    await checkAsync('Deuda H: Gemini falla (500) → 502 ai_provider_error + mensaje',
      post('/api/proxy/ai', quotaPrompt, rToken),
      r => r.status === 502 && r.data.error === 'ai_provider_error' && typeof r.data.message === 'string' && r.data.message.length > 0
    );
    check('Deuda H: tras 502, countAiAnalysesToday(rId) == 0 (slot liberado, no cuenta)',
      () => countAiAnalysesToday(rId) === 0);

    // cuota global del free tier agotada (429 de Gemini) → 503 ai_quota_exceeded y slot devuelto
    global.fetch = async () => ({ ok: false, status: 429, json: async () => ({}), text: async () => 'quota' });
    await checkAsync('Deuda H: Gemini 429 (cuota global) → 503 ai_quota_exceeded + mensaje',
      post('/api/proxy/ai', quotaPrompt, rToken),
      r => r.status === 503 && r.data.error === 'ai_quota_exceeded' && typeof r.data.message === 'string' && r.data.message.length > 0
    );
    check('Deuda H: tras 503, countAiAnalysesToday(rId) == 0 (slot liberado, no cuenta)',
      () => countAiAnalysesToday(rId) === 0);

    global.fetch = savedFetch2;
    if (origGeminiKey2 === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = origGeminiKey2;
  }

  // ═══════════════════════════════════════════════════════════
  // 3.o Perfil de empresa (G-a): GET /api/profile + PUT /api/profile
  //     Persistencia del onboarding (sección 14), 1 fila por licencia,
  //     scoped por req.license.id. Licencia DEDICADA y fresca (no la principal
  //     del suite, mutada por password-change) para login determinista.
  //     Cubre: 401 sin auth, GET vacío inicial, PUT onboarding, merge parcial
  //     (un campo omitido no se vacía), filtro de enum invalid (omiti + preserve),
  //     saneado de texto libre, scoping entre dos licencias.
  // ═══════════════════════════════════════════════════════════
  const { getCompanyProfile } = require('../db/database');

  // Licencia P (perfil propia): fresca, password conocida y estable.
  let licenseKeyP = null, licenseIdP = null, tokenP = null;
  await checkAsync('admin createLicense P (perfil, mini) → 201',
    post('/api/admin/licenses', { email: 'perfil-a@nokfi.local', plan: 'mini', password: 'ProfileP4ss!' }, 'admin'),
    r => {
      if (r.status !== 201) return false;
      licenseKeyP = r.data.key; licenseIdP = r.data.id;
      return !!r.data.key && r.data.plan === 'mini';
    }
  );
  await checkAsync('login de licencia P → 200 (para tests de perfil)',
    post('/api/auth/login', { email: 'perfil-a@nokfi.local', license_key: licenseKeyP, password: 'ProfileP4ss!' }),
    r => { if (r.status === 200) tokenP = r.data.token; return r.status === 200; }
  );
  // Licencia Q (ajena): para verificar scoping.
  let licenseKeyQ = null, licenseIdQ = null, tokenQ = null;
  await checkAsync('admin createLicense Q (ajena, para scoping) → 201',
    post('/api/admin/licenses', { email: 'perfil-b@nokfi.local', plan: 'pro', password: 'OtherP4ss!' }, 'admin'),
    r => {
      if (r.status !== 201) return false;
      licenseKeyQ = r.data.key; licenseIdQ = r.data.id;
      return !!r.data.key && r.data.plan === 'pro';
    }
  );
  await checkAsync('login de licencia Q → 200 (para scoping)',
    post('/api/auth/login', { email: 'perfil-b@nokfi.local', license_key: licenseKeyQ, password: 'OtherP4ss!' }),
    r => { if (r.status === 200) tokenQ = r.data.token; return r.status === 200; }
  );

  await checkAsync('GET /api/profile SIN auth → 401',
    get('/api/profile'),
    r => r.status === 401
  );

  await checkAsync('GET /api/profile (P) inicial → 200 + perfil vacío (no 404)',
    get('/api/profile', tokenP),
    r => r.status === 200 && r.data.profile
      && r.data.profile.companyName === '' && r.data.profile.onboardingCompleted === false
      && Array.isArray(r.data.profile.mainExpenses) && r.data.profile.mainExpenses.length === 0
  );

  await checkAsync('PUT /api/profile SIN auth → 401',
    put('/api/profile', { companyName: 'X' }, null),
    r => r.status === 401
  );

  // Guard 400: body no es objeto (array) → invalid_body
  await checkAsync('PUT /api/profile con body array → 400 invalid_body',
    put('/api/profile', ['no', 'es', 'objeto'], tokenP),
    r => r.status === 400 && r.data.error === 'invalid_body'
  );

  // Guard 400: objeto sin campos válidos → empty_profile
  await checkAsync('PUT /api/profile con {} (sin campos) → 400 empty_profile',
    put('/api/profile', {}, tokenP),
    r => r.status === 400 && r.data.error === 'empty_profile'
  );

  // PUT onboarding completo (texto libre con control chars/espacios → saneado).
  await checkAsync('PUT /api/profile onboarding completo → 200 + guardado saneado',
    put('/api/profile', {
      companyName: '\x07   Taller García   \x07',   // BEL + espacios → 'Taller García'
      sector: 'Comercio',
      size: '2-5',
      mainExpenses: ['Alquiler', 'Personal'],
      onboardingCompleted: true,
      welcomeCardDismissed: false
    }, tokenP),
    r => r.status === 200 && r.data.profile
      && r.data.profile.companyName === 'Taller García'   // saneado: control chars fuera, espacios colapsados
      && r.data.profile.sector === 'Comercio'
      && r.data.profile.size === '2-5'
      && r.data.profile.mainExpenses.length === 2
      && r.data.profile.onboardingCompleted === true
  );

  // GET refleja el onboarding persistido (scoping: P solo ve el suyo).
  await checkAsync('GET /api/profile (P) tras onboarding → 200 + persistido',
    get('/api/profile', tokenP),
    r => r.status === 200 && r.data.profile.companyName === 'Taller García'
      && r.data.profile.sector === 'Comercio' && r.data.profile.onboardingCompleted === true
  );

  // MERGE PARCIAL: PUT que solo envía welcomeCardDismissed → el resto se PRESERVA.
  await checkAsync('PUT /api/profile merge parcial (solo welcomeCardDismissed) → resto preservado',
    put('/api/profile', { welcomeCardDismissed: true }, tokenP),
    r => r.status === 200 && r.data.profile
      && r.data.profile.welcomeCardDismissed === true
      && r.data.profile.companyName === 'Taller García'    // preservado (no enviado)
      && r.data.profile.sector === 'Comercio'              // preservado
      && r.data.profile.size === '2-5'                     // preservado
      && r.data.profile.mainExpenses.length === 2           // preservado
      && r.data.profile.onboardingCompleted === true        // preservado
  );

  // ENUM INVÁLIDO se OMITE (no se blankealiza) → merge preserva el valor actual;
  // mainExpenses se filtra (solo valida queda):
  //   sector='Sector Hackeado' → fuera de VALID_SECTORS → omitido → preserva 'Comercio'
  //   size='XXL'               → fuera de VALID_SIZES   → omitido → preserva '2-5'
  //   mainExpenses con 'Inválido' → filtrado → queda solo ['Personal']
  await checkAsync('PUT /api/profile enum inválido → omitido (preserva) + expenses filtradas',
    put('/api/profile', { sector: 'Sector Hackeado', size: 'XXL', mainExpenses: ['Inválido', 'Personal'] }, tokenP),
    r => r.status === 200 && r.data.profile
      && r.data.profile.sector === 'Comercio'              // preservado (el enviado era invalid)
      && r.data.profile.size === '2-5'                     // preservado (el enviado era invalid)
      && r.data.profile.mainExpenses.length === 1
      && r.data.profile.mainExpenses[0] === 'Personal'     // el invalid 'Inválido' filtrado
      && r.data.profile.companyName === 'Taller García'    // preservado (no estaba en este PUT)
  );

  // SCOPING: Q (ajena) lee su propio perfil → vacío (no leakage del de P).
  await checkAsync('GET /api/profile (Q ajena) → 200 + vacío (no leak del de P)',
    get('/api/profile', tokenQ),
    r => r.status === 200 && r.data.profile.companyName === '' && r.data.profile.sector === ''
  );

  // Q intenta leer/escribir el perfil de P con su propio token → solo afecta a Q (no hay license_id en body).
  await checkAsync('PUT /api/profile (Q) → 200 + su propio perfil (no toca el de P)',
    put('/api/profile', { companyName: 'Empresa Q', sector: 'Salud', size: 'solo', mainExpenses: ['Marketing'], onboardingCompleted: true }, tokenQ),
    r => r.status === 200 && r.data.profile.companyName === 'Empresa Q' && r.data.profile.sector === 'Salud'
  );

  // Defensa directa a nivel DB: el perfil de P NO fue tocado por el PUT de Q.
  check('getCompanyProfile scoping: P sigue intacto tras PUT de Q (DB-direct)',
    () => { const p = getCompanyProfile(licenseIdP); return p && p.company_name === 'Taller García' && p.sector === 'Comercio'; }
  );

  // Numeric/string edge: companyName solo con control chars/espacios → '' tras saneado; aún válido (no vacía la guard empty_profile porque el campo estaba presente y string).
  await checkAsync('PUT companyName solo-control-espacios → 200 con company_name saneado a vacío',
    put('/api/profile', { companyName: '   \x07\x08   ' }, tokenQ),
    r => r.status === 200 && r.data.profile.companyName === ''
  );

  // ═══════════════════════════════════════════════════════════
  // RECUPERACIÓN DE ACCESO CON OTP (olvido de clave/contraseña)
  // Emails dedicados para no chocar con el límite 3 OTP/hora de
  // otras licencias del test. El mailer no envía emails reales en
  // test (sin RESEND_API_KEY → skip silencioso).
  // ═══════════════════════════════════════════════════════════
  const { createOtp, countRecentOtps } = require('../db/database');

  const recA = dbCreateLicense({ email: 'recovery-a@nokfi.local', plan: 'mini', password: 'RecoveryPass1!' });

  // R1. request-recovery con email inexistente → 200 genérico (anti-enumeración)
  await checkAsync('recovery: request email inexistente → 200 genérico',
    post('/api/auth/request-recovery', { email: 'nadie-xyz@nokfi.local' }),
    r => r.status === 200 && r.data.success === true
  );
  check('recovery: email inexistente NO crea OTP',
    () => countRecentOtps('nadie-xyz@nokfi.local') === 0
  );

  // R2. request-recovery con email real → 200 genérico + OTP creado
  await checkAsync('recovery: request email real → 200 genérico',
    post('/api/auth/request-recovery', { email: 'recovery-a@nokfi.local' }),
    r => r.status === 200 && r.data.success === true
  );
  check('recovery: email real crea 1 OTP',
    () => countRecentOtps('recovery-a@nokfi.local') === 1
  );

  // R3. verify con código incorrecto → 400 invalid_code (attempts=1)
  await checkAsync('recovery: verify código malo → 400 invalid_code',
    post('/api/auth/verify-recovery-otp', { email: 'recovery-a@nokfi.local', code: '999998' }),
    r => r.status === 400 && r.data.error === 'invalid_code'
  );

  // R4. 4 fallos más → en el 5º el código se quema → 429 code_burned
  await post('/api/auth/verify-recovery-otp', { email: 'recovery-a@nokfi.local', code: '999998' });
  await post('/api/auth/verify-recovery-otp', { email: 'recovery-a@nokfi.local', code: '999998' });
  await post('/api/auth/verify-recovery-otp', { email: 'recovery-a@nokfi.local', code: '999998' });
  await checkAsync('recovery: 5º intento fallido → 429 code_burned',
    post('/api/auth/verify-recovery-otp', { email: 'recovery-a@nokfi.local', code: '999998' }),
    r => r.status === 429 && r.data.error === 'code_burned'
  );

  // R5. OTP hasheado en reposo: createOtp devuelve el código en claro,
  //     pero en la tabla solo hay SHA-256 (64 hex).
  const otpReal = createOtp('recovery-a@nokfi.local');
  check('recovery: OTP hasheado en reposo (no en claro en la tabla)',
    () => {
      const row = getDB().prepare('SELECT code_hash FROM otp_codes WHERE email = ? ORDER BY id DESC LIMIT 1')
        .get('recovery-a@nokfi.local');
      return row && row.code_hash !== otpReal.code && /^[0-9a-f]{64}$/.test(row.code_hash);
    }
  );

  // R6. verify con el código correcto → 200 + recovery_token + keys
  let recoveryToken = null;
  await checkAsync('recovery: verify código correcto → 200 + recovery_token + keys',
    post('/api/auth/verify-recovery-otp', { email: 'recovery-a@nokfi.local', code: otpReal.code }),
    r => {
      if (r.status === 200) recoveryToken = r.data.recovery_token;
      return r.status === 200
        && !!r.data.recovery_token
        && Array.isArray(r.data.keys)
        && r.data.keys.some(k => k.key === recA.key);
    }
  );

  // R7. resend-recovered-keys con token vivo → 200 (no consume el token)
  await checkAsync('recovery: resend keys con token vivo → 200',
    post('/api/auth/resend-recovered-keys', { recovery_token: recoveryToken }),
    r => r.status === 200 && r.data.success === true
  );

  // R8. confirm-recovery → cambia contraseña SOLO de la licencia elegida
  //     (segunda licencia con el mismo email para probar el aislamiento)
  const recA2 = dbCreateLicense({ email: 'recovery-a@nokfi.local', plan: 'pro', password: 'SecondLicense1!' });
  await checkAsync('recovery: confirm-recovery sin license_key → 400 invalid_input',
    post('/api/auth/confirm-recovery', { recovery_token: recoveryToken, new_password: 'NewRecoveryPass2!' }),
    r => r.status === 400 && r.data.error === 'invalid_input'
  );
  await checkAsync('recovery: confirm-recovery con license_key → 200 + sesión',
    post('/api/auth/confirm-recovery', { recovery_token: recoveryToken, license_key: recA.key, new_password: 'NewRecoveryPass2!' }),
    r => r.status === 200 && r.data.success && !!r.data.token
  );
  await checkAsync('recovery: login con la nueva contraseña → 200',
    post('/api/auth/login', { email: 'recovery-a@nokfi.local', license_key: recA.key, password: 'NewRecoveryPass2!' }),
    r => r.status === 200
  );
  await checkAsync('recovery: la OTRA licencia del mismo email conserva su contraseña',
    post('/api/auth/login', { email: 'recovery-a@nokfi.local', license_key: recA2.key, password: 'SecondLicense1!' }),
    r => r.status === 200
  );

  // R9. confirm-recovery reusando el token → 400 (un solo uso)
  await checkAsync('recovery: confirm-recovery token reusado → 400',
    post('/api/auth/confirm-recovery', { recovery_token: recoveryToken, license_key: recA.key, new_password: 'AnotherPass3!' }),
    r => r.status === 400 && r.data.error === 'invalid_or_expired_token'
  );

  // R9b. license_key que no pertenece al email verificado → 400 license_key_mismatch
  const otpForMismatch = createOtp('recovery-a@nokfi.local');
  const verifyMismatch = await post('/api/auth/verify-recovery-otp', { email: 'recovery-a@nokfi.local', code: otpForMismatch.code });
  await checkAsync('recovery: license_key ajena al email → 400 license_key_mismatch',
    post('/api/auth/confirm-recovery', {
      recovery_token: verifyMismatch.data.recovery_token,
      license_key: licenseKey, // clave de OTRA cuenta (testEmail)
      new_password: 'AnotherPass3!'
    }),
    r => r.status === 400 && r.data.error === 'license_key_mismatch'
  );

  // R10. Límite 3 OTP/hora por email → el 4º request devuelve 429
  dbCreateLicense({ email: 'recovery-b@nokfi.local', plan: 'mini' });
  await post('/api/auth/request-recovery', { email: 'recovery-b@nokfi.local' });
  await post('/api/auth/request-recovery', { email: 'recovery-b@nokfi.local' });
  await post('/api/auth/request-recovery', { email: 'recovery-b@nokfi.local' });
  await checkAsync('recovery: 4º OTP en una hora → 429 otp_limit_reached',
    post('/api/auth/request-recovery', { email: 'recovery-b@nokfi.local' }),
    r => r.status === 429 && r.data.error === 'otp_limit_reached'
  );

  // ═══════════════════════════════════════════════════════════
  // Sesión 2 — Tanda B (#4 fechas, #5 migración, #6/#7/#14 oráculos)
  // ═══════════════════════════════════════════════════════════
  const { verifyOtp, getSession, peekResetToken, hashTokensAtRest } = require('../db/database');

  // ── #6: rate-limit uniforme por email, exista o no el par email+clave ──
  const spamEmail = 'spam-pwreset@nokfi.local';
  for (let i = 0; i < 5; i++) {
    await post('/api/auth/request-password-reset', { email: spamEmail, license_key: 'AAAA-BBBB-CCCC-DDDD' });
  }
  await checkAsync('#6 6ª solicitud de reset en 1h con par INEXISTENTE → 429 uniforme (sin oráculo)',
    post('/api/auth/request-password-reset', { email: spamEmail, license_key: 'AAAA-BBBB-CCCC-DDDD' }),
    r => r.status === 429 && r.data.error === 'reset_limit_reached'
  );

  // ── #6: licencia al límite anual → 200 genérico + aviso por email, NUNCA 429 ──
  // (testEmail ya consumió su reset anual en la sección 9: confirm-password-reset)
  const unusedRtBefore = getDB().prepare(
    "SELECT COUNT(*) AS c FROM reset_tokens WHERE license_id = ? AND purpose = 'password_reset' AND used = 0"
  ).get(licenseId).c;
  await checkAsync('#6 licencia al límite anual → 200 genérico (no 429 — el aviso va por email)',
    post('/api/auth/request-password-reset', { email: testEmail, license_key: licenseKey }),
    r => r.status === 200 && r.data.success === true
  );
  check('#6 …y NO se crea ningún reset_token nuevo para esa licencia',
    () => getDB().prepare(
      "SELECT COUNT(*) AS c FROM reset_tokens WHERE license_id = ? AND purpose = 'password_reset' AND used = 0"
    ).get(licenseId).c === unusedRtBefore
  );

  // ── #7: recovery con email inexistente — mismo 429 que con uno real ──
  // (cada request a email inexistente espera el dummy delay de 400ms → ~1.2s aquí)
  const ghostEmail = 'ghost-recovery@nokfi.local';
  await post('/api/auth/request-recovery', { email: ghostEmail });
  await post('/api/auth/request-recovery', { email: ghostEmail });
  await post('/api/auth/request-recovery', { email: ghostEmail });
  await checkAsync('#7 4ª solicitud recovery con email INEXISTENTE → 429 uniforme (sin oráculo)',
    post('/api/auth/request-recovery', { email: ghostEmail }),
    r => r.status === 429 && r.data.error === 'otp_limit_reached'
  );

  // ── #14: tope diario de OTP (10/24h) aunque el contador horario esté libre ──
  const dailyEmail = 'daily-cap@nokfi.local';
  const insLog = getDB().prepare(
    "INSERT INTO auth_request_log (email, kind, created_at) VALUES (?, 'recovery', datetime('now', '-2 hours'))"
  );
  for (let i = 0; i < 10; i++) insLog.run(dailyEmail);
  await checkAsync('#14 con 10 solicitudes recovery en 24h (horario libre) → 429 otp_limit_reached',
    post('/api/auth/request-recovery', { email: dailyEmail }),
    r => r.status === 429 && r.data.error === 'otp_limit_reached'
  );

  // ── #4: expiración el MISMO DÍA UTC ya no cuenta como vigente ──
  // Antes: expires_at ISO con 'T' comparado con datetime('now') con espacio
  // → 'T'(0x54) > ' '(0x20) → lo que expiraba el mismo día seguía valiendo
  // hasta medianoche. Ahora las comparaciones SQL usan NOW_ISO (mismo formato).
  const pastIso = new Date(Date.now() - 60000).toISOString(); // hace 1 min, mismo día UTC

  const otpExpired = createOtp('fecha-bug@nokfi.local');
  getDB().prepare('UPDATE otp_codes SET expires_at = ? WHERE email = ?').run(pastIso, 'fecha-bug@nokfi.local');
  check('#4 OTP expirado hace 1 minuto → verifyOtp lo rechaza (no_code)',
    () => verifyOtp('fecha-bug@nokfi.local', otpExpired.code).ok === false
  );

  const rtExpired = createRT(licenseId, 'password_reset', 30);
  const rtHash = crypto.createHash('sha256').update(rtExpired.token).digest('hex');
  getDB().prepare('UPDATE reset_tokens SET expires_at = ? WHERE token = ?').run(pastIso, rtHash);
  check('#4 reset token expirado hace 1 minuto → peekResetToken no lo devuelve',
    () => !peekResetToken(rtExpired.token, 'password_reset')
  );

  const sessExpired = createSession(licenseId, '127.0.0.1');
  check('#4 sesión recién creada SÍ es válida (control positivo)',
    () => !!getSession(sessExpired.token)
  );
  const sessHash = crypto.createHash('sha256').update(sessExpired.token).digest('hex');
  getDB().prepare('UPDATE sessions SET expires_at = ? WHERE token = ?').run(pastIso, sessHash);
  check('#4 sesión expirada hace 1 minuto → getSession devuelve null',
    () => getSession(sessExpired.token) === null
  );

  // ── #5: hashTokensAtRest v2 — ÚLTIMO test de la suite, a propósito ──
  // Re-hashea TODAS las sesiones y reset_tokens (discriminar por formato es
  // imposible: plano y SHA-256 son ambos 64 hex minúsculas). Después de este
  // punto ningún token previo es válido, por eso va al final, tras R10.
  const plainToken = 'abcdef0123456789'.repeat(4); // 64 hex minúsculas = token plano pre-auditoría
  const plainHash = crypto.createHash('sha256').update(plainToken).digest('hex');
  getDB().prepare(
    "INSERT INTO reset_tokens (token, purpose, license_id, expires_at) VALUES (?, 'password_reset', ?, datetime('now', '+30 minutes'))"
  ).run(plainToken, licenseId);
  getDB().pragma('user_version = 0'); // simula una DB pre-v2
  hashTokensAtRest(getDB());
  check('#5 token plano (64 hex minúsculas) queda hasheado tras la migración v2',
    () => !!getDB().prepare('SELECT id FROM reset_tokens WHERE token = ?').get(plainHash)
      && !getDB().prepare('SELECT id FROM reset_tokens WHERE token = ?').get(plainToken)
  );
  check('#5 user_version queda en 1 y una segunda pasada es no-op',
    () => {
      hashTokensAtRest(getDB()); // no debe lanzar ni re-tocar nada
      return getDB().pragma('user_version', { simple: true }) === 1
        && !!getDB().prepare('SELECT id FROM reset_tokens WHERE token = ?').get(plainHash);
    }
  );

  } catch (e) {
    console.error('TEST CRASH:', e.message);
    failed++;
  }

  // ── cleanup ────────────────────────────────────────────────
  // server.js auto-listen: no exponemos el handle, cerramos vía close() del DB
  try {
    const db = getDB();
    db.close();
  } catch {}
  // pequeño delay para que suelte el archivo WAL antes de unlink
  await new Promise(r => setTimeout(r, 300));
  try {
    fs.unlinkSync(process.env.DB_PATH);
    fs.unlinkSync(process.env.DB_PATH + '-wal');
    fs.unlinkSync(process.env.DB_PATH + '-shm');
    console.log('DB temporal eliminada');
  } catch {}

  // ── result ─────────────────────────────────────────────────
  console.log(`\n${'═'.repeat(50)}`);
  console.log(`✅ ${passed} OK  ❌ ${failed} FAIL  (${passed + failed} total)`);
  console.log(`${'═'.repeat(50)}`);

  process.exit(failed > 0 ? 1 : 0);
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });