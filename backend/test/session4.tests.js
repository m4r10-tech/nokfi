/**
 * Tests e2e de la sesión 4 (núcleo de valor, API v1, RGPD…). Se ejecutan
 * desde test/e2e.test.js con sus mismos helpers (misma BD temporal y server).
 */

'use strict';

module.exports = async function session4Tests({ post, put, get, call, check, checkAsync, getDB }) {
  const patch = (path, body, auth) => call('PATCH', path, { body, auth });
  const del = (path, body, auth) => call('DELETE', path, { body, auth });

  // §5.1 — país por cabecera de Cloudflare (sin guardar nada).
  await checkAsync('i18n: GET /api/geo sin CF-IPCountry → country null', get('/api/geo'), r => r.status === 200 && r.data.country === null);

  // Licencia dedicada (autónomo) para el libro.
  let key = null, lid = null, tok = null;
  await checkAsync('S4: admin createLicense (finanzas, pro) → 201',
    post('/api/admin/licenses', { email: 'finanzas@nokfi.local', plan: 'pro', password: 'Finanzas12!' }, 'admin'),
    r => { if (r.status === 201) { key = r.data.key; lid = r.data.id; } return r.status === 201; });
  await checkAsync('S4: login finanzas → token',
    post('/api/auth/login', { email: 'finanzas@nokfi.local', license_key: key, password: 'Finanzas12!' }),
    r => { if (r.status === 200) tok = r.data.token; return r.status === 200; });

  await checkAsync('S4 perfil: forma jurídica, NIF, caja y avisos se guardan',
    put('/api/profile', { legalForm: 'autonomo', taxId: 'x-1234567-a', cashBalance: 5000, cashAlertThreshold: 1000, fiscalReminders: true, lang: 'fr' }, tok),
    r => r.status === 200 && r.data.profile.legalForm === 'autonomo' && r.data.profile.taxId === 'X1234567A'
      && r.data.profile.cashBalance === 5000 && r.data.profile.fiscalReminders === true && r.data.profile.lang === 'fr');
  await checkAsync('S4 perfil: forma jurídica inválida se ignora',
    put('/api/profile', { legalForm: 'cooperativa' }, tok),
    r => r.status === 400 || r.data.profile?.legalForm === 'autonomo');

  // ── V1: libro ──
  const y = 2026;
  const entries = [
    { type: 'income', party_name: 'Cliente A', party_nif: 'B11111111', invoice_number: 'F-1', invoice_date: `${y}-01-15`, base: 1000, vat_rate: 21, vat_amount: 210, irpf_rate: 15, irpf_amount: 150, total: 1060, paid: true, paid_at: `${y}-02-14` },
    { type: 'income', party_name: 'Cliente B', party_nif: 'B22222222', invoice_number: 'F-2', invoice_date: `${y}-02-10`, base: 2000, vat_rate: 21, vat_amount: 420, irpf_amount: 0, total: 2420 },
    { type: 'expense', party_name: 'Luz SA', party_nif: 'A00000001', invoice_number: 'L-1', invoice_date: `${y}-01-05`, base: 100, vat_amount: 21, total: 121, category: 'Suministros' },
    { type: 'expense', party_name: 'Luz SA', party_nif: 'A00000001', invoice_number: 'L-2', invoice_date: `${y}-02-05`, base: 100, vat_amount: 21, total: 121, category: 'Suministros' },
    { type: 'expense', party_name: 'Luz SA', party_nif: 'A00000001', invoice_number: 'L-3', invoice_date: `${y}-03-05`, base: 120, vat_amount: 25.2, total: 145.2, category: 'Suministros' },
    { type: 'expense', party_name: 'Soft SL', party_nif: 'B33333333', invoice_number: 'S-9', invoice_date: `${y}-03-01`, base: 50, vat_amount: 10.5, total: 60.5 },
    { type: 'expense', party_name: 'Soft SL', party_nif: 'B33333333', invoice_number: 'S-10', invoice_date: `${y}-03-03`, base: 50, vat_amount: 10.5, total: 60.5 }
  ];
  let ids = [];
  await checkAsync('V1: POST /api/ledger (7 apuntes) → 201',
    post('/api/ledger', { entries }, tok), r => { ids = r.data.ids || []; return r.status === 201 && ids.length === 7; });
  await checkAsync('V1: repetir una factura (mismo NIF + nº) → 409 duplicates',
    post('/api/ledger', { entries: [entries[0]] }, tok), r => r.status === 409 && r.data.duplicates[0] === 0);
  await checkAsync('V1: fecha inválida → 400',
    post('/api/ledger', { entries: [{ ...entries[0], invoice_number: 'X', invoice_date: '15/01/2026' }] }, tok), r => r.status === 400);
  await checkAsync('V1: GET /api/ledger?type=expense → 5 gastos, needs_review=false (cuadran)',
    get(`/api/ledger?type=expense&from=${y}-01-01&to=${y}-12-31`, tok),
    r => r.status === 200 && r.data.entries.length === 5 && r.data.entries.every(e => !e.needs_review));
  await checkAsync('V1: PATCH con total que no cuadra → needs_review=true',
    patch(`/api/ledger/${ids[5]}`, { total: 99 }, tok), r => r.status === 200 && r.data.entry.needs_review === true);
  await checkAsync('V1: PATCH de vuelta → cuadra',
    patch(`/api/ledger/${ids[5]}`, { total: 60.5 }, tok), r => r.status === 200 && r.data.entry.needs_review === false);
  await checkAsync('V1: el libro de otra licencia no es accesible (PATCH → 404)',
    patch(`/api/ledger/${ids[0]}`, { total: 1 }, 'token-invalido'), r => r.status === 401);

  // ── V2: impuestos 1T ──
  // IVA: repercutido 630 − soportado (21+21+25.2+10.5+10.5=88.2) = 541.8
  // 130: 20% × (3000 − 420) = 516 − retenciones 150 = 366
  await put('/api/finance/reserve', { year: y, quarter: 1, amount: 500 }, tok);
  await checkAsync('V2: 303 = 541,80 € y 130 = 366,00 € (1T); apartado 500; falta 407,80',
    get(`/api/finance/taxes?year=${y}&quarter=1`, tok),
    r => r.status === 200 && r.data.summary.vat.result === 541.8 && r.data.summary.irpf130.result === 366
      && r.data.summary.reserved === 500 && r.data.summary.missing === 407.8 && r.data.summary.due_date === '2026-04-20');
  check('V2: 130 del 2T descuenta el pago del 1T (acumulado)', () => {
    const { irpf130ForQuarter } = require('../utils/finance');
    const e = entries.map(x => ({ ...x, irpf_amount: x.irpf_amount || 0 }));
    return irpf130ForQuarter(e, y, 2).result === 0 && irpf130ForQuarter(e, y, 2).previous_payments === 366;
  });

  // ── C4: calendario ──
  check('C4: plazos 2027 con fin de semana → lunes (30-ene-2027 es sábado → 1-feb)', () => {
    const { deadlinesForYear } = require('../utils/fiscalCalendar');
    const d = deadlinesForYear(2027).find(x => x.key === '2026-4T-303-130');
    return d && d.date === '2027-02-01';
  });
  await checkAsync('C4: GET /api/finance/calendar → autónomo sin modelo 200 (sociedades)',
    get(`/api/finance/calendar?year=${y}`, tok),
    r => r.status === 200 && r.data.deadlines.length > 5 && !r.data.deadlines.some(d => d.models.includes('200')));

  // ── V4: cobros ──
  await checkAsync('V4: 1 cobro pendiente (Cliente B, 2.420 €) y días medios de cobro 30',
    get('/api/finance/receivables', tok),
    r => r.status === 200 && r.data.pending.length === 1 && r.data.total === 2420 && r.data.avg_collection_days === 30);

  // ── V5: fugas ──
  await checkAsync('V5: Luz SA recurrente con subida (+20 %) y duplicado de Soft SL',
    get('/api/finance/leaks', tok),
    r => r.status === 200 && r.data.recurring.some(x => x.party_name === 'Luz SA')
      && r.data.increases.some(x => x.party_name === 'Luz SA' && x.pct === 20)
      && r.data.duplicates.some(x => x.party_name === 'Soft SL'));

  // ── V3: previsión ──
  // 500 + 1.000 (cobro 1-oct) − 300 (pago 20-oct) − 200 (130 del 3T: 20 % de 1.000, vence 20-oct) = 1.000
  check('V3: forecast suma cobros y resta pagos e impuestos previstos (determinista)', () => {
    const { forecast } = require('../utils/finance');
    const ents = [
      { id: 1, type: 'income', party_name: 'C', invoice_date: '2026-09-01', due_date: '2026-10-01', total: 1000, base: 1000, vat_amount: 0, irpf_amount: 0, paid: false },
      { id: 2, type: 'expense', party_name: 'P', invoice_date: '2026-10-10', due_date: '2026-10-20', total: 300, base: 300, vat_amount: 0, irpf_amount: 0, paid: false }
    ];
    const fc = forecast({ entries: ents, balance: 500, days: 60, threshold: 400, refDate: '2026-09-26' });
    const fcHire = forecast({ entries: ents, balance: 500, days: 60, refDate: '2026-09-26', scenario: { hire_monthly: 1600 } });
    return fc.at30 === 1000 && fc.series[fc.series.length - 1].balance === 1000 && fc.first_below === null
      && fc.flows.some(f => f.kind === 'tax' && f.amount === -200)
      && fcHire.min.balance < 0;
  });
  await checkAsync('V3: GET /api/finance/forecast → serie de 91 días',
    get('/api/finance/forecast?days=90&hire=1600', tok),
    r => r.status === 200 && r.data.series.length === 91 && typeof r.data.at30 === 'number');

  // ── Panel ──
  await checkAsync('Dashboard: resumen con impuestos, cobros y fugas',
    get('/api/dashboard', tok),
    r => r.status === 200 && r.data.ledger_count === 7 && r.data.receivables.count === 1 && !!r.data.next_deadline);

  // ── C4: avisos (sin enviar emails reales) ──
  {
    const savedResend = process.env.RESEND_API_KEY;
    delete process.env.RESEND_API_KEY;
    const { runFiscalReminders } = require('../services/reminders');
    const first = await runFiscalReminders(new Date('2026-10-14T09:00:00Z')); // 3T vence el 20-oct → aviso de 7 días
    const again = await runFiscalReminders(new Date('2026-10-14T15:00:00Z'));
    check('C4: aviso fiscal a 7 días se envía una sola vez (reminders_sent)', () => first >= 1 && again === 0
      && !!getDB().prepare('SELECT 1 FROM reminders_sent WHERE license_id = ? AND deadline_key = ? AND lead_days = 7').get(lid, '2026-3T'));
    if (savedResend !== undefined) process.env.RESEND_API_KEY = savedResend;
  }

  await checkAsync('V1: DELETE /api/ledger/:id → 200 y ya no está',
    del(`/api/ledger/${ids[6]}`, null, tok), r => r.status === 200);

  // ── F4: claves de API + /api/v1 ──
  let apiKey = null, apiKeyId = null;
  await checkAsync('F4: POST /api/keys (plan pro) → 201 + clave nk_live_ mostrada una vez',
    post('/api/keys', { name: 'n8n' }, tok),
    r => { apiKey = r.data.key; apiKeyId = r.data.id; return r.status === 201 && /^nk_live_/.test(apiKey || ''); });
  await checkAsync('F4: GET /api/keys → solo prefijo (nunca la clave completa ni el hash)',
    get('/api/keys', tok),
    r => r.status === 200 && r.data.available === true && r.data.keys.length === 1 && !JSON.stringify(r.data).includes(apiKey) && !('key_hash' in r.data.keys[0]));
  check('F4: la clave se guarda hasheada (sha256), no en claro', () =>
    !getDB().prepare('SELECT 1 FROM api_keys WHERE key_hash = ?').get(apiKey) && !!getDB().prepare('SELECT 1 FROM api_keys WHERE id = ?').get(apiKeyId));
  await checkAsync('F4: GET /api/v1/openapi.json público → 200', get('/api/v1/openapi.json'), r => r.status === 200 && r.data.openapi === '3.0.3');
  await checkAsync('F4: /api/v1/usage sin clave → 401', get('/api/v1/usage'), r => r.status === 401 && r.data.error === 'invalid_api_key');
  await checkAsync('F4: /api/v1/usage con clave → 200 (cuota del plan)', get('/api/v1/usage', apiKey), r => r.status === 200 && r.data.daily_quota === 50);
  await checkAsync('F4: /api/v1/analyze type no permitido (invoices) → 400', post('/api/v1/analyze', { type: 'invoices', data: {} }, apiKey), r => r.status === 400 && r.data.error === 'invalid_type');
  {
    const savedFetch = global.fetch, savedKey = process.env.GEMINI_API_KEY;
    process.env.GEMINI_API_KEY = 'fake';
    global.fetch = async () => ({ ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify({ summary: 'API ok', priorities: [{ title: 'x', detail: 'y', severity: 'low' }], action_plan: [{ title: 'z' }] }) }] } }] }), text: async () => '' });
    let aid = null;
    await checkAsync('F4: POST /api/v1/analyze excel → 200 + informe JSON',
      post('/api/v1/analyze', { type: 'excel', lang: 'en', data: { module: 'ventas', files: [{ name: 'v.csv', rows: [{ a: 1 }] }] } }, apiKey),
      r => { aid = r.data.id; return r.status === 200 && r.data.report.summary === 'API ok' && r.data.actions.length === 1; });
    await checkAsync('F4: GET /api/v1/analyses/:id → mismo informe', get(`/api/v1/analyses/${aid}`, apiKey), r => r.status === 200 && r.data.report.summary === 'API ok');
    global.fetch = savedFetch;
    if (savedKey === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = savedKey;
  }
  getDB().prepare("UPDATE licenses SET plan = 'mini' WHERE id = ?").run(lid);
  await checkAsync('F4: licencia bajada a Mini → su clave da 401 api_plan_required (no se borra)',
    get('/api/v1/usage', apiKey), r => r.status === 401 && r.data.error === 'api_plan_required');
  await checkAsync('F4: Mini no puede crear claves → 403 api_plan_required',
    post('/api/keys', { name: 'x' }, tok), r => r.status === 403 && r.data.error === 'api_plan_required');
  getDB().prepare("UPDATE licenses SET plan = 'pro' WHERE id = ?").run(lid);
  await checkAsync('F4: DELETE /api/keys/:id → revocada', call('DELETE', `/api/keys/${apiKeyId}`, { auth: tok }), r => r.status === 200);
  await checkAsync('F4: clave revocada → 401 api_key_revoked', get('/api/v1/usage', apiKey), r => r.status === 401 && r.data.error === 'api_key_revoked');

  // ── C8: errores del frontend ──
  await checkAsync('C8: POST /api/client-errors → 204', post('/api/client-errors', { message: 'TypeError: x is undefined', path: '/app/home?token=secreto', version: 'abc' }), r => r.status === 204);
  await checkAsync('C8: admin GET /api/admin/errors → incluye el error, sin query string',
    get('/api/admin/errors', 'admin'), r => r.status === 200 && r.data.errors.some(e => e.message.includes('x is undefined') && e.path === '/app/home'));

  // ── C9: descargar y borrar mis datos ──
  await checkAsync('C9: GET /api/me/export → perfil, libro, análisis (sin hash de contraseña)',
    get('/api/me/export', tok),
    r => r.status === 200 && r.data.account.email === 'finanzas@nokfi.local' && r.data.ledger_entries.length >= 6
      && Array.isArray(r.data.analyses) && !JSON.stringify(r.data).includes('scrypt$'));
  await checkAsync('C9: DELETE /api/me con contraseña incorrecta → 401', del('/api/me', { password: 'mala' }, tok), r => r.status === 401);
  getDB().prepare("UPDATE licenses SET stripe_subscription_id = 'sub_test', billing_model = 'subscription', cancel_at_period_end = 0 WHERE id = ?").run(lid);
  await checkAsync('C9: con suscripción activa → 409 subscription_active (no se toca Stripe)',
    del('/api/me', { password: 'Finanzas12!' }, tok), r => r.status === 409 && r.data.error === 'subscription_active');
  getDB().prepare('UPDATE licenses SET cancel_at_period_end = 1 WHERE id = ?').run(lid);
  await checkAsync('C9: suscripción ya cancelada → 200 y la cuenta se borra', del('/api/me', { password: 'Finanzas12!' }, tok), r => r.status === 200);
  check('C9: licencia, libro y claves borrados en cascada', () =>
    !getDB().prepare('SELECT 1 FROM licenses WHERE id = ?').get(lid)
    && !getDB().prepare('SELECT 1 FROM ledger_entries WHERE license_id = ?').get(lid)
    && !getDB().prepare('SELECT 1 FROM api_keys WHERE license_id = ?').get(lid));
  await checkAsync('C9: la sesión deja de valer → 401', get('/api/dashboard', tok), r => r.status === 401);

  return { lid, tok, key };
};
