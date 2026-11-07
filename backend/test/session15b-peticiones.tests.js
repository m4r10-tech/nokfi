/**
 * test/session15b-peticiones.tests.js — S15b, lote 1 (peticiones del usuario).
 *
 *   U10  sociedad: sin 130/IRPF en el calendario, el chat y el contexto financiero
 *
 * Se ejecuta desde test/e2e.test.js con sus helpers (misma BD temporal y server).
 * Sin IA real.
 */

'use strict';

module.exports = async function session15bPeticionesTests({ post, put, get, check }) {
  async function account(email, legalForm, plan = 'pro') {
    const lic = await post('/api/admin/licenses', { email, plan, password: 'Peticion15b!' }, 'admin');
    const login = await post('/api/auth/login', { email, license_key: lic.data.key, password: 'Peticion15b!' });
    const tok = login.data.token;
    if (legalForm) await put('/api/profile', { legalForm }, tok);
    return { tok, lid: lic.data.id, key: lic.data.key };
  }

  // ═══ U10 — sociedad (opción B): sin 130 ni «IRPF»; 111/115 como «Si te aplica» ═══
  {
    const { deadlinesFor } = require('../utils/fiscalCalendar');
    const soc = deadlinesFor(2026, 'sociedad');
    const quarterly = soc.filter(d => d.models.includes('303'));
    check('S15b U10: calendario de sociedad sin el 130 en ningún plazo', () => soc.every(d => !d.models.includes('130')));
    check('S15b U10: los trimestrales de sociedad son solo el IVA (303, tipo quarterly_vat, sin el texto con IRPF)', () =>
      quarterly.length === 4 && quarterly.every(d => d.models.join() === '303' && d.kind === 'quarterly_vat'));
    const wh = soc.filter(d => d.kind === 'withholdings');
    check('S15b U10: 111/115 de sociedad en los 4 trimestres, aparte y como «Si te aplica» (conditional)', () =>
      wh.length === 4 && wh.every(d => d.models.join() === '111,115' && d.conditional === true)
      && new Set(soc.map(d => d.key)).size === soc.length);
    const auto = deadlinesFor(2026, 'autonomo');
    check('S15b U10: el calendario del autónomo no cambia (303+130+111+115 en el 1T)', () =>
      auto.find(d => d.key === '2026-1T')?.models.join() === '303,130,111,115' && auto.find(d => d.key === '2026-1T').kind === 'quarterly');

    const c = await account('peticiones-sl@nokfi.local', 'sociedad');
    const cal = await get('/api/finance/calendar?year=2026', c.tok);
    check('S15b U10: GET /api/finance/calendar de una SL no lleva 130', () =>
      cal.status === 200 && cal.data.deadlines.length > 0 && cal.data.deadlines.every(d => !d.models.includes('130')));

    const { chatSystemPrompt } = require('../services/ai/chat');
    const { financeContext } = require('../services/ai/financeContext');
    const { getCompanyProfile } = require('../db/database');
    const fin = financeContext(c.lid, { lang: 'es' }).text;
    const prompt = chatSystemPrompt({ profile: getCompanyProfile(c.lid), lang: 'es', financeText: fin });
    check('S15b U10/F2: el chat de una SL no ofrece «303/130» y le dice al modelo que no presenta el 130', () =>
      !prompt.includes('303/130') && /NO presenta el modelo 130/.test(fin) && /202/.test(fin) && /111 y el 115/.test(fin));
    const a = await account('peticiones-auto@nokfi.local', 'autonomo');
    const pa = chatSystemPrompt({ profile: getCompanyProfile(a.lid), lang: 'es', financeText: financeContext(a.lid, { lang: 'es' }).text });
    check('S15b U10: el chat del autónomo sigue con 303/130 y sin el aviso de sociedad', () => pa.includes('303/130') && !/NO presenta el modelo 130/.test(pa));
  }

  // ═══ U1 — paquetes de créditos (Stripe simulado, webhooks firmados de verdad) ═══
  const ENV = ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET', 'STRIPE_PRICE_PACK_50', 'STRIPE_PRICE_PACK_220', 'STRIPE_PRICE_PACK_550', 'APP_PUBLIC_URL'];
  const saved = Object.fromEntries(ENV.map(k => [k, process.env[k]]));
  const savedFetch = global.fetch;
  Object.assign(process.env, {
    STRIPE_SECRET_KEY: 'sk_test_fake_s15b_packs', STRIPE_WEBHOOK_SECRET: 'whsec_s15b_packs', APP_PUBLIC_URL: 'https://nokfi.test',
    STRIPE_PRICE_PACK_50: 'price_t_pack50', STRIPE_PRICE_PACK_220: 'price_t_pack220', STRIPE_PRICE_PACK_550: 'price_t_pack550'
  });
  let calls = [];
  global.fetch = async (url, opts = {}) => {
    const u = String(url);
    if (!u.startsWith('https://api.stripe.com/v1/')) return savedFetch(url, opts);
    const params = Object.fromEntries(new URLSearchParams(opts.body || ''));
    calls.push({ method: opts.method || 'GET', path: u.slice('https://api.stripe.com/v1/'.length).split('?')[0], params });
    const body = { id: 'cs_test_pack', url: 'https://checkout.stripe.test/pay/cs_test_pack' };
    return { ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) };
  };
  const http = require('http');
  const crypto = require('crypto');
  function webhook(payload) {
    const raw = JSON.stringify(payload);
    const t = Math.floor(Date.now() / 1000);
    const sig = crypto.createHmac('sha256', process.env.STRIPE_WEBHOOK_SECRET).update(`${t}.${raw}`).digest('hex');
    return new Promise((resolve, reject) => {
      const req = http.request(`http://localhost:${process.env.PORT}/api/webhooks/stripe`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Stripe-Signature': `t=${t},v1=${sig}` }
      }, (res) => { let d = ''; res.on('data', c => d += c); res.on('end', () => { let p; try { p = JSON.parse(d); } catch { p = d; } resolve({ status: res.statusCode, data: p }); }); });
      req.on('error', reject); req.write(raw); req.end();
    });
  }
  const packSession = (id, license_id, { pack = 'pack50', amount = 500, paid = true } = {}) => ({
    id, object: 'checkout.session', mode: 'payment', payment_status: paid ? 'paid' : 'unpaid', amount_total: amount, currency: 'eur',
    customer: 'cus_pack', payment_intent: `pi_${id}`, livemode: false, metadata: { kind: 'credit_pack', pack, license_id: String(license_id) }
  });
  const evt = (id, type, object) => ({ id, type, api_version: '2026-06-24.dahlia', created: Math.floor(Date.now() / 1000), data: { object } });

  try {
    const db = require('../db/database');
    const credits = require('../db/credits');

    const cat = await get('/api/payments/plans');
    const packs = Object.fromEntries((cat.data.credit_packs || []).map(p => [p.id, p]));
    check('S15b U1: el catálogo público lista los 3 paquetes (50 = 5 €, 220 = 20 €, 550 = 50 €)', () =>
      cat.status === 200 && Object.keys(packs).length === 3 && packs.pack50.credits === 50 && packs.pack50.price_eur === 5
      && packs.pack220.credits === 220 && packs.pack220.price_eur === 20 && packs.pack550.credits === 550 && packs.pack550.price_eur === 50
      && cat.data.plans.map(p => p.id).join() === 'mini,pro,max');

    // Checkout: solo con plan activo (Q1).
    const P = await account('peticiones-pack@nokfi.local', null, 'mini');
    calls = [];
    const co = await post('/api/payments/stripe/credit-checkout', { pack: 'pack220', locale: 'fr' }, P.tok);
    const c0 = calls.find(c => c.path === 'checkout/sessions');
    check('S15b U1: comprar un paquete crea un Checkout de pago único con su Price y la cuenta en metadata', () =>
      co.status === 200 && co.data.checkout_url && c0 && c0.params.mode === 'payment' && c0.params['line_items[0][price]'] === 'price_t_pack220'
      && c0.params['metadata[kind]'] === 'credit_pack' && c0.params['metadata[pack]'] === 'pack220' && c0.params['metadata[license_id]'] === String(P.lid)
      && c0.params['payment_intent_data[metadata][license_id]'] === String(P.lid) && c0.params.locale === 'fr' && !c0.params['subscription_data[trial_period_days]']);
    const bad = await post('/api/payments/stripe/credit-checkout', { pack: 'pack999' }, P.tok);
    check('S15b U1: paquete desconocido → 400 invalid_pack', () => bad.status === 400 && bad.data.error === 'invalid_pack');

    const E = await account('peticiones-pack-expirado@nokfi.local', null, 'pro');
    db.updateSubscription(E.lid, { current_period_ends_at: new Date(Date.now() - 10 * 86400000).toISOString() });
    calls = [];
    const noPlan = await post('/api/payments/stripe/credit-checkout', { pack: 'pack50' }, E.tok);
    check('S15b U1/Q1: sin plan activo (periodo acabado) → 403 plan_required y no se llama a Stripe', () =>
      noPlan.status === 403 && noPlan.data.error === 'plan_required' && calls.length === 0);
    const B = await account('peticiones-pack-bloq@nokfi.local', null, 'pro');
    db.updateLicense(B.lid, { status: 'suspended' });
    const blocked = await post('/api/payments/stripe/credit-checkout', { pack: 'pack50' }, B.tok);
    check('S15b U1/Q1: una cuenta suspendida no puede comprar paquetes', () => blocked.status === 403 && calls.length === 0);

    // Webhook: acredita una sola vez.
    const before = credits.creditBalance(P.lid);
    const w1 = await webhook(evt('evt_pack_1', 'checkout.session.completed', packSession('cs_pack_1', P.lid)));
    const after1 = credits.creditBalance(P.lid);
    const w2 = await webhook(evt('evt_pack_1', 'checkout.session.completed', packSession('cs_pack_1', P.lid)));
    const w3 = await webhook(evt('evt_pack_1b', 'checkout.session.async_payment_succeeded', packSession('cs_pack_1', P.lid)));
    check('S15b U1: el webhook de un paquete pagado suma sus 50 créditos', () => w1.status === 200 && before === 0 && after1 === 50);
    check('S15b U1: el mismo evento repetido, u otro evento de la misma sesión, no vuelve a sumar', () =>
      w2.status === 200 && w2.data.duplicate === true && w3.status === 200 && credits.creditBalance(P.lid) === 50
      && db.getDB().prepare('SELECT COUNT(*) c FROM credit_purchases WHERE license_id = ?').get(P.lid).c === 1);
    const w4 = await webhook(evt('evt_pack_unpaid', 'checkout.session.completed', packSession('cs_pack_2', P.lid, { paid: false })));
    check('S15b U1: un Checkout aún sin cobrar no suma créditos', () => w4.status === 200 && credits.creditBalance(P.lid) === 50);
    const w5 = await webhook(evt('evt_pack_2', 'checkout.session.async_payment_succeeded', packSession('cs_pack_2', P.lid)));
    check('S15b U1: …y cuando se cobra (async_payment_succeeded) se suman una vez', () => w5.status === 200 && credits.creditBalance(P.lid) === 100);
    const licAfter = db.getLicenseById(P.lid);
    check('S15b U1: comprar un paquete no toca el plan ni crea otra licencia', () =>
      licAfter.plan === 'mini' && licAfter.status === 'active' && db.getDB().prepare("SELECT COUNT(*) c FROM licenses WHERE email = 'peticiones-pack@nokfi.local'").get().c === 1);

    const mine = await get('/api/payments/credits', P.tok);
    check('S15b U1: GET /api/payments/credits da el saldo, si puede comprar, los paquetes y las compras', () =>
      mine.status === 200 && mine.data.balance === 100 && mine.data.can_buy === true && mine.data.packs.length === 3
      && mine.data.purchases.length === 2 && mine.data.purchases[0].credits === 50);
    const dash = await get('/api/dashboard', P.tok);
    check('S15b U1: el panel de inicio muestra el saldo de paquetes junto a la cuota', () => dash.status === 200 && dash.data.ai_pack_credits === 100);

    // Consumo: primero los del día, luego los del paquete (Q2).
    const quota = require('../services/ai/quota');
    const C = await account('peticiones-consumo@nokfi.local', null, 'mini');
    credits.grantPack({ license_id: C.lid, pack: 'pack50', credits: 2, session_id: 'cs_test_consumo' });
    const lic = db.getLicenseById(C.lid);
    const first = quota.acquire(lic, { family: 'single' });
    check('S15b U1/Q2: con créditos del día libres se gasta uno del día y el paquete no se toca', () =>
      db.countAiAnalysesToday(C.lid) === 1 && credits.creditBalance(C.lid) === 2);
    first.onSuccess();
    for (let i = 1; i < 10; i++) quota.acquire(lic, { family: 'single' }).onSuccess();
    const p1 = quota.acquire(lic, { family: 'single' });
    check('S15b U1/Q2: acabados los 10 del día (Mini), se gasta 1 del paquete', () => db.countAiAnalysesToday(C.lid) === 10 && credits.creditBalance(C.lid) === 1);
    p1.onFailure();
    check('S15b U1/Q2: si la IA falla, el crédito del paquete se devuelve', () => credits.creditBalance(C.lid) === 2);
    quota.acquire(lic, { family: 'single' }).onSuccess();
    quota.acquire(lic, { family: 'single' }).onSuccess();
    let err = null;
    try { quota.acquire(lic, { family: 'single' }); } catch (e) { err = e; }
    check('S15b U1/Q2: sin créditos del día ni del paquete → license_daily_limit_reached (el saldo nunca baja de 0)', () =>
      err && err.code === 'license_daily_limit_reached' && credits.creditBalance(C.lid) === 0);
    check('S15b U2: el mensaje de cuota habla de créditos y de paquetes', () => /créditos/.test(quota.quotaMessage(10)) && /paquete/.test(quota.quotaMessage(10)) && !/análisis/.test(quota.quotaMessage(10)));

    // Saldo único web + API (Q3) y /api/v1/usage con campos viejos y nuevos.
    const A = await account('peticiones-api@nokfi.local', null, 'pro');
    credits.grantPack({ license_id: A.lid, pack: 'pack220', credits: 220, session_id: 'cs_test_api' });
    const key = (await post('/api/keys', { name: 'packs' }, A.tok)).data.key;
    const u = await get("/api/v1/usage", key);
    check('S15b U1/U2: /api/v1/usage mantiene daily_quota y used_today y añade los campos de créditos', () =>
      u.status === 200 && u.data.daily_quota === 50 && u.data.used_today === 0 && u.data.daily_credits === 50 && u.data.daily_credits_used === 0
      && u.data.daily_credits_left === 50 && u.data.pack_credits === 220 && u.data.credits_available === 270);
    const sum = await get('/api/keys/summary', A.tok);
    check('S15b U1/Q3: Desarrolladores muestra el mismo saldo de paquetes que la API', () => sum.status === 200 && sum.data.quota.pack === 220);

    // Contracargo de un paquete: se localiza la cuenta (antes 500 en bucle).
    const D = await account('peticiones-disputa@nokfi.local', null, 'pro');
    await webhook(evt('evt_pack_d', 'checkout.session.completed', packSession('cs_pack_d', D.lid)));
    const disp = await webhook(evt('evt_pack_dispute', 'charge.dispute.created', { id: 'dp_pack', object: 'dispute', payment_intent: 'pi_cs_pack_d', charge: null }));
    check('S15b U1: un contracargo de un paquete encuentra la cuenta (no queda en 500)', () => disp.status === 200 && db.getLicenseById(D.lid).status === 'revoked');
  } finally {
    global.fetch = savedFetch;
    for (const [k, v] of Object.entries(saved)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  }
};
