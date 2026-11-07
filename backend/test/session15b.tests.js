/**
 * test/session15b.tests.js — S15b, lote 2 (pagos).
 *
 * Modelo de cobro nuevo (U3–U5), bloqueo por renovación rechazada (U4), P2–P9.
 * La API de Stripe se simula sustituyendo global.fetch solo para
 * https://api.stripe.com (se guardan las llamadas para comprobar los parámetros);
 * los webhooks van FIRMADOS de verdad contra la ruta real, como en e2e.test.js.
 */

'use strict';

const http = require('http');
const crypto = require('crypto');

module.exports = async function session15bTests({ post, get, call, check, getDB }) {
  const db = require('../db/database');
  const { createLicense, createSession, getLicenseById } = db;
  const baseUrl = `http://localhost:${process.env.PORT}`;
  const now = () => Math.floor(Date.now() / 1000);

  // ── entorno de pagos simulado ──
  const saved = {
    key: process.env.STRIPE_SECRET_KEY, wh: process.env.STRIPE_WEBHOOK_SECRET,
    mini: process.env.STRIPE_PRICE_MINI, pro: process.env.STRIPE_PRICE_PRO, max: process.env.STRIPE_PRICE_MAX,
    landing: process.env.LANDING_PUBLIC_URL, app: process.env.APP_PUBLIC_URL, fetch: global.fetch
  };
  process.env.STRIPE_SECRET_KEY = 'sk_test_fake_s15b';
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_s15b';
  process.env.STRIPE_PRICE_MINI = 'price_t_mini';
  process.env.STRIPE_PRICE_PRO = 'price_t_pro';
  process.env.STRIPE_PRICE_MAX = 'price_t_max';
  process.env.LANDING_PUBLIC_URL = 'https://nokfi.test';
  process.env.APP_PUBLIC_URL = 'https://nokfi.test';

  let calls = [];
  let routes = {}; // 'METHOD path' → (params) => ({ status, body })
  global.fetch = async (url, opts = {}) => {
    const u = String(url);
    if (!u.startsWith('https://api.stripe.com/v1/')) return saved.fetch(url, opts);
    const method = opts.method || 'GET';
    const path = u.slice('https://api.stripe.com/v1/'.length).split('?')[0];
    const params = Object.fromEntries(new URLSearchParams(opts.body || u.split('?')[1] || ''));
    calls.push({ method, path, params });
    const h = routes[`${method} ${path}`];
    const r = h ? h(params) : { status: 404, body: { error: { code: 'resource_missing', message: 'no route' } } };
    return { ok: r.status < 300, status: r.status, json: async () => r.body, text: async () => JSON.stringify(r.body) };
  };
  const reset = () => { calls = []; routes = {}; };
  const callTo = (method, path) => calls.find(c => c.method === method && c.path === path);

  function webhook(payload) {
    const raw = JSON.stringify(payload);
    const t = now();
    const sig = crypto.createHmac('sha256', process.env.STRIPE_WEBHOOK_SECRET).update(`${t}.${raw}`).digest('hex');
    return new Promise((resolve, reject) => {
      const req = http.request(`${baseUrl}/api/webhooks/stripe`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Stripe-Signature': `t=${t},v1=${sig}` }
      }, (res) => {
        let data = ''; res.on('data', d => data += d);
        res.on('end', () => { let p; try { p = JSON.parse(data); } catch { p = data; } resolve({ status: res.statusCode, data: p }); });
      });
      req.on('error', reject); req.write(raw); req.end();
    });
  }
  const evt = (id, type, object, extra = {}) => ({ id, type, api_version: '2026-06-24.dahlia', created: now(), data: { object }, ...extra });
  const subObj = (id, { status = 'active', price = 'price_t_pro', plan = 'pro', end = now() + 31 * 86400, trial_end = null, cancel = false, pm = null } = {}) =>
    ({ id, object: 'subscription', customer: 'cus_' + id, status, cancel_at_period_end: cancel, trial_end, default_payment_method: pm,
      metadata: { plan }, items: { data: [{ id: 'si_' + id, current_period_end: end, price: { id: price } }] } });

  let n = 0;
  function mkLicense(plan, extra = {}) {
    n++;
    const l = createLicense({
      email: `s15b-${n}@nokfi.local`, plan, payment_provider: 'stripe', payment_ref: `cs_s15b_${n}`,
      billing_model: 'subscription', stripe_customer_id: `cus_s15b_${n}`, stripe_subscription_id: `sub_s15b_${n}`,
      current_period_ends_at: new Date(Date.now() + 10 * 86400000).toISOString(), password: 'S15bPass!x', created_by: 'webhook_stripe_sub', ...extra
    });
    return { l, token: createSession(l.id, '127.0.0.1').token };
  }

  try {
    // ═══ U3 — cambio de plan: aviso previo ═══
    const A = mkLicense('pro');
    const prev = await get('/api/payments/stripe/change-plan/preview?plan=max', A.token);
    const monthAhead = Date.parse(prev.data.ends_at) - Date.now();
    check('S15b U3: el aviso previo da el precio completo del plan nuevo y la fecha de fin (un mes desde hoy)', () =>
      prev.status === 200 && prev.data.amount_eur === 50 && prev.data.current_plan === 'pro'
      && monthAhead > 27 * 86400000 && monthAhead < 32 * 86400000 && prev.data.ends_trial === false);
    const same = await get('/api/payments/stripe/change-plan/preview?plan=pro', A.token);
    const bad = await post('/api/payments/stripe/change-plan', { plan: 'gold' }, A.token);
    check('S15b U3: mismo plan → 409 same_plan; plan inválido → 400', () => same.status === 409 && same.data.error === 'same_plan' && bad.status === 400);

    // Subida Pro → Max: cobro completo hoy y periodo nuevo.
    reset();
    const endUp = now() + 30 * 86400;
    routes[`GET subscriptions/${A.l.stripe_subscription_id}`] = () => ({ status: 200, body: subObj(A.l.stripe_subscription_id) });
    routes[`POST subscriptions/${A.l.stripe_subscription_id}`] = () => ({ status: 200, body: subObj(A.l.stripe_subscription_id, { price: 'price_t_max', plan: 'max', end: endUp }) });
    const up = await post('/api/payments/stripe/change-plan', { plan: 'max' }, A.token);
    const upCall = callTo('POST', `subscriptions/${A.l.stripe_subscription_id}`);
    const afterUp = getLicenseById(A.l.id);
    check('S15b U3/P2: subir de plan llama a Stripe con anchor=now, sin prorrata y error_if_incomplete', () =>
      up.status === 200 && upCall && upCall.params['items[0][price]'] === 'price_t_max' && upCall.params['items[0][id]'] === `si_${A.l.stripe_subscription_id}`
      && upCall.params.billing_cycle_anchor === 'now' && upCall.params.proration_behavior === 'none'
      && upCall.params.payment_behavior === 'error_if_incomplete' && upCall.params.trial_end === undefined);
    check('S15b U3: tras cobrar, el plan es Max y el periodo nuevo termina cuando dice Stripe', () =>
      afterUp.plan === 'max' && afterUp.current_period_ends_at === new Date(endUp * 1000).toISOString() && up.data.amount_eur === 50);

    // Bajada Max → Mini: también cobra el precio completo de Mini hoy.
    reset();
    routes[`GET subscriptions/${A.l.stripe_subscription_id}`] = () => ({ status: 200, body: subObj(A.l.stripe_subscription_id, { price: 'price_t_max', plan: 'max' }) });
    routes[`POST subscriptions/${A.l.stripe_subscription_id}`] = () => ({ status: 200, body: subObj(A.l.stripe_subscription_id, { price: 'price_t_mini', plan: 'mini', end: endUp + 100 }) });
    const down = await post('/api/payments/stripe/change-plan', { plan: 'mini' }, A.token);
    const downCall = callTo('POST', `subscriptions/${A.l.stripe_subscription_id}`);
    check('S15b U3: bajar de plan también empieza un periodo nuevo cobrado hoy (sin esperar al final)', () =>
      down.status === 200 && getLicenseById(A.l.id).plan === 'mini' && downCall.params.billing_cycle_anchor === 'now'
      && downCall.params.proration_behavior === 'none' && down.data.amount_eur === 5);

    // Cobro rechazado → el plan no cambia.
    reset();
    routes[`GET subscriptions/${A.l.stripe_subscription_id}`] = () => ({ status: 200, body: subObj(A.l.stripe_subscription_id, { price: 'price_t_mini', plan: 'mini' }) });
    routes[`POST subscriptions/${A.l.stripe_subscription_id}`] = () => ({ status: 402, body: { error: { type: 'card_error', code: 'card_declined', decline_code: 'generic_decline', message: 'Your card was declined.' } } });
    const before = getLicenseById(A.l.id);
    const declined = await post('/api/payments/stripe/change-plan', { plan: 'max' }, A.token);
    const afterDecl = getLicenseById(A.l.id);
    check('S15b U3: si el cobro falla → 402 payment_failed y el plan y el periodo no cambian', () =>
      declined.status === 402 && declined.data.error === 'payment_failed'
      && afterDecl.plan === 'mini' && afterDecl.current_period_ends_at === before.current_period_ends_at);

    // ═══ P3 — cambiar durante el trial acaba el trial y cobra hoy ═══
    reset();
    const T = mkLicense('mini', { trial_ends_at: new Date(Date.now() + 9 * 86400000).toISOString() });
    const tPrev = await get('/api/payments/stripe/change-plan/preview?plan=pro', T.token);
    routes[`GET subscriptions/${T.l.stripe_subscription_id}`] = () => ({ status: 200, body: subObj(T.l.stripe_subscription_id, { status: 'trialing', price: 'price_t_mini', plan: 'mini', trial_end: now() + 9 * 86400 }) });
    routes[`POST subscriptions/${T.l.stripe_subscription_id}`] = () => ({ status: 200, body: subObj(T.l.stripe_subscription_id, { price: 'price_t_pro', plan: 'pro', trial_end: now() }) });
    const tChange = await post('/api/payments/stripe/change-plan', { plan: 'pro' }, T.token);
    const tCall = callTo('POST', `subscriptions/${T.l.stripe_subscription_id}`);
    const afterT = getLicenseById(T.l.id);
    check('S15b P3: en trial, el aviso dice que acaba la prueba y el cambio manda trial_end=now', () =>
      tPrev.data.ends_trial === true && tChange.status === 200 && tCall.params.trial_end === 'now' && tCall.params.billing_cycle_anchor === 'now');
    check('S15b P3: tras el cambio en trial, trial_ends_at queda a null (no con la hora del cambio)', () =>
      afterT.trial_ends_at === null && afterT.plan === 'pro');
    // El webhook de Stripe trae trial_end = hora del cambio (pasada) con status active.
    const p3 = await webhook(evt('evt_s15b_p3', 'customer.subscription.updated', subObj(T.l.stripe_subscription_id, { price: 'price_t_pro', plan: 'pro', trial_end: now() - 5 })));
    check('S15b P3: subscription.updated con trial_end pasado y status active no deja trial_ends_at con fecha', () =>
      p3.status === 200 && getLicenseById(T.l.id).trial_ends_at === null);

    // ═══ U5 — cancelar: sigue hasta el fin del periodo pagado ═══
    reset();
    const C = mkLicense('pro');
    const cEnd = now() + 20 * 86400;
    routes[`POST subscriptions/${C.l.stripe_subscription_id}`] = (p) => ({ status: 200, body: { ...subObj(C.l.stripe_subscription_id, { end: cEnd, cancel: p.cancel_at_period_end === 'true' }), cancel_at: cEnd } });
    const cancel = await post('/api/payments/stripe/cancel', null, C.token);
    const afterC = getLicenseById(C.l.id);
    check('S15b U5: cancelar → cancel_at_period_end en Stripe y la cuenta sigue activa hasta el fin del periodo', () =>
      cancel.status === 200 && callTo('POST', `subscriptions/${C.l.stripe_subscription_id}`).params.cancel_at_period_end === 'true'
      && afterC.cancel_at_period_end === 1 && afterC.status === 'active' && afterC.current_period_ends_at === new Date(cEnd * 1000).toISOString());
    const vr = await post('/api/auth/verify', null, C.token);
    check('S15b U5: tras cancelar se puede seguir entrando (sesión válida)', () => vr.status === 200 && vr.data.valid === true);
    const del = await webhook(evt('evt_s15b_cdel', 'customer.subscription.deleted', { ...subObj(C.l.stripe_subscription_id, { status: 'canceled', end: cEnd }), ended_at: cEnd }));
    check('S15b U5: al llegar el fin del periodo (subscription.deleted) la cuenta caduca', () =>
      del.status === 200 && getLicenseById(C.l.id).status === 'expired');

    // ═══ U4 — renovación rechazada → suscripción parada y cuenta bloqueada ═══
    reset();
    const B = mkLicense('pro');
    routes[`DELETE subscriptions/${B.l.stripe_subscription_id}`] = () => ({ status: 200, body: subObj(B.l.stripe_subscription_id, { status: 'canceled' }) });
    routes['POST invoices/in_s15b_fail/void'] = () => ({ status: 200, body: { id: 'in_s15b_fail', status: 'void' } });
    const failInv = { id: 'in_s15b_fail', object: 'invoice', customer: B.l.stripe_customer_id, billing_reason: 'subscription_cycle', status: 'open', attempt_count: 1, amount_paid: 0,
      parent: { type: 'subscription_details', subscription_details: { subscription: B.l.stripe_subscription_id } } };
    const pf = await webhook(evt('evt_s15b_pf', 'invoice.payment_failed', failInv));
    const afterB = getLicenseById(B.l.id);
    check('S15b U4: invoice.payment_failed de renovación bloquea la cuenta (blocked_reason=payment_failed)', () =>
      pf.status === 200 && afterB.status === 'suspended' && afterB.blocked_reason === 'payment_failed');
    check('S15b U4: se para la suscripción en Stripe y se anula la factura fallida', () => {
      const d = callTo('DELETE', `subscriptions/${B.l.stripe_subscription_id}`);
      return !!d && d.params.prorate === 'false' && d.params.invoice_now === 'false' && !!callTo('POST', 'invoices/in_s15b_fail/void');
    });
    check('S15b U4: se cierran las sesiones abiertas', () => getDB().prepare('SELECT COUNT(*) c FROM sessions WHERE license_id = ?').get(B.l.id).c === 0);
    const late = await webhook(evt('evt_s15b_late', 'customer.subscription.updated', subObj(B.l.stripe_subscription_id)));
    check('S15b U4: un subscription.updated tardío con status active no desbloquea', () =>
      late.status === 200 && getLicenseById(B.l.id).status === 'suspended' && getLicenseById(B.l.id).blocked_reason === 'payment_failed');
    await webhook(evt('evt_s15b_bdel', 'customer.subscription.deleted', { ...subObj(B.l.stripe_subscription_id, { status: 'canceled' }), ended_at: now() }));

    const wrong = await post('/api/auth/login', { email: B.l.email, license_key: B.l.key, password: 'mala-clave-1' });
    const blocked = await post('/api/auth/login', { email: B.l.email, license_key: B.l.key, password: 'S15bPass!x' });
    check('S15b U4: login con contraseña mala → 401 genérico (no revela el bloqueo)', () => wrong.status === 401 && wrong.data.error === 'invalid_credentials');
    check('S15b U4: login correcto → 403 account_blocked con token solo para reanudar', () =>
      blocked.status === 403 && blocked.data.error === 'account_blocked' && blocked.data.reason === 'payment_failed' && !!blocked.data.resume_token);
    const rt = blocked.data.resume_token;
    const dash = await get('/api/dashboard', rt);
    check('S15b U4: ese token no da acceso a la app (403)', () => dash.status === 403);

    reset();
    routes['POST checkout/sessions'] = () => ({ status: 200, body: { id: 'cs_s15b_resume', url: 'https://checkout.stripe.test/resume' } });
    const resume = await post('/api/payments/stripe/resume-checkout', { plan: 'max', locale: 'es' }, rt);
    const rc = callTo('POST', 'checkout/sessions');
    check('S15b U4: reanudar crea un checkout del plan elegido para la misma cuenta y cliente, sin trial', () =>
      resume.status === 200 && resume.data.checkout_url === 'https://checkout.stripe.test/resume'
      && rc.params['metadata[resume_license_id]'] === String(B.l.id) && rc.params.customer === getLicenseById(B.l.id).stripe_customer_id && !!rc.params.customer
      && rc.params['line_items[0][price]'] === 'price_t_max' && rc.params['subscription_data[trial_period_days]'] === undefined);
    const notBlocked = await post('/api/payments/stripe/resume-checkout', { plan: 'max' }, A.token);
    check('S15b U4: una cuenta no bloqueada no puede usar resume-checkout (409)', () => notBlocked.status === 409);

    reset();
    const newEnd = now() + 30 * 86400;
    routes['GET subscriptions/sub_s15b_resumed'] = () => ({ status: 200, body: subObj('sub_s15b_resumed', { price: 'price_t_max', plan: 'max', end: newEnd }) });
    const keyBefore = getLicenseById(B.l.id).key;
    const resumed = await webhook(evt('evt_s15b_resumed', 'checkout.session.completed', {
      id: 'cs_s15b_resume', object: 'checkout.session', mode: 'subscription', customer: B.l.stripe_customer_id, subscription: 'sub_s15b_resumed',
      amount_total: 5000, metadata: { plan: 'max', email: B.l.email, resume_license_id: String(B.l.id) }
    }));
    const afterR = getLicenseById(B.l.id);
    check('S15b U4: pagar un plan nuevo reactiva la MISMA cuenta (misma clave, plan nuevo, sin bloqueo)', () =>
      resumed.status === 200 && afterR.status === 'active' && afterR.blocked_reason === null && afterR.plan === 'max'
      && afterR.stripe_subscription_id === 'sub_s15b_resumed' && afterR.key === keyBefore
      && afterR.current_period_ends_at === new Date(newEnd * 1000).toISOString()
      && getDB().prepare('SELECT COUNT(*) c FROM licenses WHERE email = ?').get(B.l.email).c === 1);
    const relog = await post('/api/auth/login', { email: B.l.email, license_key: B.l.key, password: 'S15bPass!x' });
    check('S15b U4: tras reanudar se entra con normalidad', () => relog.status === 200 && relog.data.success === true);

    // Si Stripe no responde al parar la suscripción → 500 para que reintente (la cuenta ya queda bloqueada).
    reset();
    const B2 = mkLicense('mini');
    routes[`DELETE subscriptions/${B2.l.stripe_subscription_id}`] = () => ({ status: 500, body: { error: { message: 'boom' } } });
    const pf2 = await webhook(evt('evt_s15b_pf2', 'invoice.payment_failed', { ...failInv, id: 'in_s15b_fail2', parent: { subscription_details: { subscription: B2.l.stripe_subscription_id } } }));
    check('S15b U4: si no se puede parar la suscripción → 500 (Stripe reintenta) y la cuenta ya está bloqueada', () =>
      pf2.status === 500 && getLicenseById(B2.l.id).blocked_reason === 'payment_failed');

    // Stripe responde 429 (lock_timeout) mientras aún procesa la factura: se reintenta (visto en Stripe test real).
    reset();
    const B3 = mkLicense('mini');
    let tries = 0;
    routes[`DELETE subscriptions/${B3.l.stripe_subscription_id}`] = () => (++tries === 1
      ? { status: 429, body: { error: { code: 'lock_timeout', message: 'locked' } } }
      : { status: 200, body: { id: B3.l.stripe_subscription_id, status: 'canceled' } });
    const pf3 = await webhook(evt('evt_s15b_pf3', 'invoice.payment_failed', { ...failInv, id: 'in_s15b_fail3', parent: { subscription_details: { subscription: B3.l.stripe_subscription_id } } }));
    check('S15b U4: un 429 de Stripe al parar la suscripción se reintenta y el evento queda procesado', () =>
      pf3.status === 200 && tries === 2 && getLicenseById(B3.l.id).blocked_reason === 'payment_failed');

    // ═══ P5 — eventos pendientes → no-2xx ═══
    reset();
    const pend = await webhook(evt('evt_s15b_pend_paid', 'invoice.paid', { id: 'in_orphan', object: 'invoice', customer: 'cus_x', billing_reason: 'subscription_cycle', amount_paid: 2000, currency: 'eur',
      parent: { subscription_details: { subscription: 'sub_s15b_unknown' } }, lines: { data: [{ period: { end: now() + 86400 } }] } }));
    const pendRow = getDB().prepare("SELECT processed FROM payment_events WHERE event_id = 'evt_s15b_pend_paid'").get();
    check('S15b P5: invoice.paid antes que la licencia → 503 (Stripe reintenta) y queda processed=0', () =>
      pend.status === 503 && pend.data.error === 'event_pending' && pendRow && pendRow.processed === 0);
    const pendUpd = await webhook(evt('evt_s15b_pend_upd', 'customer.subscription.updated', subObj('sub_s15b_unknown2')));
    check('S15b P5: subscription.updated antes que la licencia → 503', () => pendUpd.status === 503);
    const old = await webhook({ ...evt('evt_s15b_pend_old', 'customer.subscription.updated', subObj('sub_s15b_unknown3')), created: now() - 7 * 3600 });
    const gone = await webhook(evt('evt_s15b_pend_gone', 'customer.subscription.updated', subObj('sub_s15b_unknown4', { status: 'canceled' })));
    check('S15b P5: un evento viejo (> 6 h) o de una suscripción ya terminada → 200 (no reintentar en bucle)', () =>
      old.status === 200 && gone.status === 200);

    // ═══ P6/P7 — /reveal una sola vez y texto de trial ═══
    const R = mkLicense('mini', { trial_ends_at: new Date(Date.now() + 14 * 86400000).toISOString() });
    const r1 = await get(`/api/payments/stripe/reveal?session_id=${R.l.payment_ref}`);
    const r2 = await get(`/api/payments/stripe/reveal?session_id=${R.l.payment_ref}`);
    check('S15b P7: /reveal dice si es un trial (hoy no se cobra) para no mostrar «¡Pago completado!»', () =>
      r1.status === 200 && r1.data.key === R.l.key && r1.data.trial === true && !!r1.data.trial_ends_at);
    check('S15b P6: recargar justo después (margen de 2 min) aún la muestra', () => r2.status === 200);
    getDB().prepare('UPDATE licenses SET key_revealed_at = ? WHERE id = ?').run(new Date(Date.now() - 10 * 60000).toISOString(), R.l.id);
    const r3 = await get(`/api/payments/stripe/reveal?session_id=${R.l.payment_ref}`);
    check('S15b P6: pasado el margen, la misma URL ya no muestra la clave (410 already_revealed, sin clave)', () =>
      r3.status === 410 && r3.data.error === 'already_revealed' && r3.data.key === undefined);

    // ═══ P4 — anti-trial repetido por huella de tarjeta ═══
    reset();
    const trialEnd = now() + 14 * 86400;
    routes['GET subscriptions/sub_s15b_t1'] = () => ({ status: 200, body: subObj('sub_s15b_t1', { status: 'trialing', price: 'price_t_mini', plan: 'mini', trial_end: trialEnd, end: trialEnd, pm: 'pm_s15b_1' }) });
    routes['GET subscriptions/sub_s15b_t2'] = () => ({ status: 200, body: subObj('sub_s15b_t2', { status: 'trialing', price: 'price_t_mini', plan: 'mini', trial_end: trialEnd, end: trialEnd, pm: 'pm_s15b_2' }) });
    routes['GET payment_methods/pm_s15b_1'] = () => ({ status: 200, body: { id: 'pm_s15b_1', card: { fingerprint: 'fp_s15b_same' } } });
    routes['GET payment_methods/pm_s15b_2'] = () => ({ status: 200, body: { id: 'pm_s15b_2', card: { fingerprint: 'fp_s15b_same' } } });
    const paidEnd = now() + 30 * 86400;
    routes['POST subscriptions/sub_s15b_t2'] = () => ({ status: 200, body: subObj('sub_s15b_t2', { price: 'price_t_mini', plan: 'mini', trial_end: now(), end: paidEnd }) });
    const co = (id, email, sub) => evt(id, 'checkout.session.completed', { id: 'cs_' + id, object: 'checkout.session', mode: 'subscription', customer: 'cus_' + id, subscription: sub, customer_email: email, amount_total: 0, metadata: { plan: 'mini', email } });
    const t1 = await webhook(co('evt_s15b_t1', 's15b-trial1@nokfi.local', 'sub_s15b_t1'));
    const L1 = db.getLicenseByStripeSubscriptionId('sub_s15b_t1');
    check('S15b P4: primer trial con una tarjeta → 14 días de prueba y huella guardada', () =>
      t1.status === 200 && L1 && !!L1.trial_ends_at && !!getDB().prepare("SELECT 1 FROM trial_fingerprints WHERE fingerprint = 'fp_s15b_same'").get()
      && !callTo('POST', 'subscriptions/sub_s15b_t1'));
    const t2 = await webhook(co('evt_s15b_t2', 's15b-trial2@nokfi.local', 'sub_s15b_t2'));
    const L2 = db.getLicenseByStripeSubscriptionId('sub_s15b_t2');
    const endCall = callTo('POST', 'subscriptions/sub_s15b_t2');
    check('S15b P4: la misma tarjeta con otro email → sin trial (trial_end=now, se cobra hoy)', () =>
      t2.status === 200 && L2 && L2.trial_ends_at === null && endCall && endCall.params.trial_end === 'now'
      && L2.current_period_ends_at === new Date(paidEnd * 1000).toISOString());

    // ═══ P9 — al abandonar el checkout se vuelve a Precios con el plan ═══
    reset();
    routes['POST checkout/sessions'] = () => ({ status: 200, body: { id: 'cs_x', url: 'https://checkout.stripe.test/x' } });
    await post('/api/payments/stripe/create-checkout', { email: 'buy-s15b@nokfi.local', plan: 'pro', locale: 'es' });
    const es = callTo('POST', 'checkout/sessions');
    reset();
    routes['POST checkout/sessions'] = () => ({ status: 200, body: { id: 'cs_y', url: 'https://checkout.stripe.test/y' } });
    await post('/api/payments/stripe/create-checkout', { email: 'buy-s15b@nokfi.local', plan: 'max', locale: 'en' });
    const en = callTo('POST', 'checkout/sessions');
    check('S15b P9: cancel_url del checkout vuelve a /pricing (o /en/pricing) con el plan, no a la home', () =>
      es && es.params.cancel_url === 'https://nokfi.test/pricing?plan=pro&cancelled=true'
      && en && en.params.cancel_url === 'https://nokfi.test/en/pricing?plan=max&cancelled=true');

    // ═══ P8 — borrar la cuenta: Stripe y logs anonimizados ═══
    reset();
    const D = mkLicense('pro', { email: 's15b-borrar@nokfi.local' });
    getDB().prepare('UPDATE licenses SET cancel_at_period_end = 1 WHERE id = ?').run(D.l.id);
    db.audit('LICENSE_CREATED_STRIPE_SUB', { license_id: D.l.id, detail: `email=${D.l.email} plan=pro` });
    db.audit('LOGIN_FAILED_NOT_FOUND', { detail: `email=${D.l.email}` });
    getDB().prepare("INSERT INTO auth_request_log (email, kind) VALUES (?, 'password_reset')").run(D.l.email);
    routes[`DELETE subscriptions/${D.l.stripe_subscription_id}`] = () => ({ status: 200, body: { id: D.l.stripe_subscription_id, status: 'canceled' } });
    routes[`DELETE customers/${D.l.stripe_customer_id}`] = () => ({ status: 500, body: { error: { message: 'boom' } } });
    const dFail = await call('DELETE', '/api/me', { body: { password: 'S15bPass!x' }, auth: D.token });
    check('S15b P8: si Stripe falla al borrar el cliente → 502 y la cuenta NO se borra (se puede reintentar)', () =>
      dFail.status === 502 && !!getLicenseById(D.l.id));
    reset();
    routes[`DELETE subscriptions/${D.l.stripe_subscription_id}`] = () => ({ status: 404, body: { error: { code: 'resource_missing', message: 'No such subscription' } } });
    routes[`DELETE customers/${D.l.stripe_customer_id}`] = () => ({ status: 200, body: { id: D.l.stripe_customer_id, deleted: true } });
    const dOk = await call('DELETE', '/api/me', { body: { password: 'S15bPass!x' }, auth: D.token });
    check('S15b P8: borrar la cuenta cancela la suscripción y borra el cliente de Stripe', () =>
      dOk.status === 200 && !!callTo('DELETE', `subscriptions/${D.l.stripe_subscription_id}`)
      && !!callTo('DELETE', `customers/${D.l.stripe_customer_id}`) && !getLicenseById(D.l.id));
    const hash = 'sha256:' + crypto.createHash('sha256').update(D.l.email).digest('hex');
    check('S15b P8: audit_log y auth_request_log ya no guardan el email (hash en su lugar)', () =>
      !getDB().prepare('SELECT 1 FROM audit_log WHERE instr(detail, ?) > 0').get(D.l.email)
      && !!getDB().prepare('SELECT 1 FROM audit_log WHERE instr(detail, ?) > 0').get(hash)
      && !getDB().prepare('SELECT 1 FROM auth_request_log WHERE email = ?').get(D.l.email)
      && !!getDB().prepare('SELECT 1 FROM auth_request_log WHERE email = ?').get(hash));
  } finally {
    global.fetch = saved.fetch;
    for (const [k, v] of Object.entries({ STRIPE_SECRET_KEY: saved.key, STRIPE_WEBHOOK_SECRET: saved.wh, STRIPE_PRICE_MINI: saved.mini,
      STRIPE_PRICE_PRO: saved.pro, STRIPE_PRICE_MAX: saved.max, LANDING_PUBLIC_URL: saved.landing, APP_PUBLIC_URL: saved.app })) {
      if (v === undefined) delete process.env[k]; else process.env[k] = v;
    }
  }
};
