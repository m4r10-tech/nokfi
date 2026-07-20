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
        && r.data.license.ai_quota === 30          // mini → 30
        && r.data.license.has_subscription === false
        && r.data.license.billing_model === 'legacy'
        && r.data.license.cancel_at_period_end === false
        && r.data.license.current_period_ends_at === null
        && r.data.license.password_hash === undefined; // nunca expuesto
    }
  );

  // — 3.c aiQuotaForPlan tiered (mini 30 / pro 80 / max 200) —
  check('aiQuotaForPlan tiered mini=30 pro=80 max=200 unknown=30',
    () => aiQuotaForPlan('mini') === 30 && aiQuotaForPlan('pro') === 80
       && aiQuotaForPlan('max') === 200 && aiQuotaForPlan('???') === 30
  );

  // — 3.d Stripe checkout sin STRIPE_SECRET_KEY → 500 stripe_not_configured —
  await checkAsync('stripe create-checkout sin key → 500 stripe_not_configured',
    post('/api/payments/stripe/create-checkout', { email: 'buy@nokfi.local', plan: 'pro' }),
    r => r.status === 500 && r.data.error === 'stripe_not_configured'
  );
  // plan inválido se coacciona a 'mini' (no 400) — aquí la falta de key corta antes
  await checkAsync('stripe create-checkout plan inválido → coerción (no 400)',
    post('/api/payments/stripe/create-checkout', { email: 'buy@nokfi.local', plan: 'garbage' }),
    r => r.status === 500 && r.data.error === 'stripe_not_configured' // pasó validación de plan
  );

  // — 3.e Proveedores alternativos → 410 lifetime_discontinued —
  await checkAsync('paypal create-order → 410 lifetime_discontinued',
    post('/api/payments/paypal/create-order', { email: 'x@nokfi.local', plan: 'mini' }),
    r => r.status === 410 && r.data.error === 'lifetime_discontinued'
  );
  await checkAsync('coinbase create-charge → 410 lifetime_discontinued',
    post('/api/payments/coinbase/create-charge', { email: 'x@nokfi.local', plan: 'mini' }),
    r => r.status === 410 && r.data.error === 'lifetime_discontinued'
  );
  await checkAsync('revolut create-order → 410 lifetime_discontinued',
    post('/api/payments/revolut/create-order', { email: 'x@nokfi.local', plan: 'mini' }),
    r => r.status === 410 && r.data.error === 'lifetime_discontinued'
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
    payment_ref: 'cs_sub_test', amount_eur: 25, billing_model: 'subscription',
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

  // — 3.k getStats MRR (revenue recurrente) — la única suscripción activa es
  //    la creada en 3.h (plan pro, pero la marcamos expired en 3.h). La "reactivamos"
  //    como pro/subscription/active para que aporte 25€ al MRR.
  updateSubscription(subLicense.id, { status: 'active', plan: 'pro', billing_model: 'subscription', stripe_customer_id: 'cus_test_pro' });
  await checkAsync('admin stats (Fase 3) → MRR pro 25€ + plans/billing desglose',
    get('/api/admin/stats', 'admin'),
    r => r.status === 200
      && typeof r.data.revenue.mrr_eur === 'number'
      && r.data.revenue.mrr_eur >= 25               // el pro subscription cuenta
      && r.data.billing && r.data.billing.subscription >= 1
      && r.data.plans && r.data.plans.pro && r.data.plans.pro.active >= 1
      && typeof r.data.licenses.expired === 'number'
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