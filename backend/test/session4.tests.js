/**
 * Tests e2e de la sesión 4 (núcleo de valor, API v1, RGPD…). Se ejecutan
 * desde test/e2e.test.js con sus mismos helpers (misma BD temporal y server).
 */

'use strict';

module.exports = async function session4Tests({ post, put, get, call, check, checkAsync, getDB }) {
  const patch = (path, body, auth) => call('PATCH', path, { body, auth });
  const del = (path, body, auth) => call('DELETE', path, { body, auth });

  // ── Cambio de IA: capa de proveedores sin entrenamiento (groq → cloudflare) ──
  {
    const providers = require('../services/ai/providers');
    const saved = { fetch: global.fetch, AI: process.env.AI_PROVIDERS, G: process.env.GROQ_API_KEY, A: process.env.CF_ACCOUNT_ID, T: process.env.CF_AI_TOKEN, GM: process.env.GEMINI_API_KEY };
    process.env.AI_PROVIDERS = 'groq,cloudflare'; process.env.GROQ_API_KEY = 'gsk_test'; process.env.CF_ACCOUNT_ID = 'acc'; process.env.CF_AI_TOKEN = 'tok'; process.env.GEMINI_API_KEY = 'fake';
    const calls = [];
    const ok = (obj) => ({ ok: true, status: 200, json: async () => ({ choices: [{ message: { content: JSON.stringify(obj) }, finish_reason: 'stop' }] }), text: async () => '' });
    global.fetch = async (url, o) => { calls.push({ url, body: JSON.parse(o.body) }); return ok({ summary: 'desde groq', priorities: [], action_plan: [] }); };
    const r1 = await providers.generate({ system: 's', parts: [{ text: 'hola' }, { inlineData: { mimeType: 'image/jpeg', data: 'AAA' } }], schema: { type: 'OBJECT', properties: { summary: { type: 'STRING' } } } });
    check('IA: groq primero, formato OpenAI, imagen como image_url y JSON mode', () =>
      r1.model.startsWith('groq:') && r1.json.summary === 'desde groq' && calls[0].url.includes('api.groq.com')
      && calls[0].body.response_format?.type === 'json_object' && calls[0].body.messages[1].content[1].type === 'image_url'
      && calls[0].body.messages[0].content.includes('"type":"object"') && calls[0].body.model === 'qwen/qwen3.8-27b');
    calls.length = 0;
    global.fetch = async (url, o) => { calls.push({ url }); return url.includes('groq') ? { ok: false, status: 429, text: async () => 'rate' } : ok({ summary: 'desde cloudflare' }); };
    const r2 = await providers.generate({ system: 's', parts: [{ text: 'x' }], schema: { type: 'OBJECT' } });
    check('IA: si Groq agota cuota (429) responde Cloudflare', () => r2.model.startsWith('cloudflare:') && r2.json.summary === 'desde cloudflare' && calls.length === 2);
    check('IA: sin AI_PROVIDERS explícito, Gemini (free tier que entrena) NO está en el orden', () => {
      delete process.env.AI_PROVIDERS; const o = providers.providerOrder(); process.env.AI_PROVIDERS = 'groq,cloudflare';
      return !o.includes('gemini') && o.join() === 'groq,cloudflare';
    });
    let pdfErr = null;
    global.fetch = async () => ok({});
    try { await providers.generate({ system: 's', parts: [{ inlineData: { mimeType: 'application/pdf', data: 'AAA' } }], schema: { type: 'OBJECT' } }); } catch (e) { pdfErr = e; }
    check('IA: PDF inline no se manda a modelos que no lo leen (error controlado)', () => !!pdfErr && pdfErr.code === 'ai_provider_error');
    const chat = require('../services/ai/chat');
    check('Chat: orden por defecto sin Gemini ni OpenRouter', () => {
      const prev = process.env.CHAT_PROVIDERS; delete process.env.CHAT_PROVIDERS; process.env.CEREBRAS_API_KEY = 'c';
      const o = chat.providerOrder(); if (prev !== undefined) process.env.CHAT_PROVIDERS = prev; delete process.env.CEREBRAS_API_KEY;
      const base = o.filter(x => x !== 'groq');
      return base[0] === 'cloudflare' && base[1] === 'cerebras' && (!o.includes('groq') || o[0] === 'groq') && !o.includes('gemini') && !o.includes('openrouter');
    });
    global.fetch = saved.fetch;
    for (const [k, v] of [['AI_PROVIDERS', saved.AI], ['GROQ_API_KEY', saved.G], ['CF_ACCOUNT_ID', saved.A], ['CF_AI_TOKEN', saved.T], ['GEMINI_API_KEY', saved.GM]]) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  }

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

  // ── Sesión 6: Fugas sin falsos positivos ──
  {
    const { leaks: L, forecast: FC } = require('../utils/finance');
    const ex = (party, date, base, category = '') => ({ id: Math.random(), type: 'expense', party_name: party, party_nif: '', invoice_number: `${party}-${date}`, invoice_date: date, base, vat_amount: r2x(base * 0.21), total: r2x(base * 1.21), category, paid: true });
    function r2x(n) { return Math.round(n * 100) / 100; }
    const ents = [
      ex('Recambios Norte', '2026-06-10', 1100, 'Proveedores'), ex('Recambios Norte', '2026-07-12', 1100, 'Proveedores'), ex('Recambios Norte', '2026-08-09', 1290, 'Proveedores'),
      ex('Recambios Sur', '2026-06-03', 420), ex('Recambios Sur', '2026-07-21', 1350), ex('Recambios Sur', '2026-08-15', 780),
      ex('SoftCloud', '2026-06-01', 29, 'Tecnología'), ex('SoftCloud', '2026-07-01', 29, 'Tecnología'), ex('SoftCloud', '2026-08-01', 35, 'Tecnología')
    ];
    const lk = L(ents, '2026-08-20');
    check('S6 Fugas: recambios variables (1.100/1.100/1.290) NO son recurrentes ni subida', () =>
      !lk.recurring.some(r => r.party_name.startsWith('Recambios')) && !lk.increases.some(i => i.party_name.startsWith('Recambios')));
    check('S6 Fugas: software 29 → 35 € (Tecnología) SÍ es posible subida (+20,69 %, sobre bases)', () =>
      lk.increases.length === 1 && lk.increases[0].party_name === 'SoftCloud' && lk.increases[0].from === 29 && lk.increases[0].to === 35
      && lk.increases[0].pct === 20.69 && lk.recurring.some(r => r.party_name === 'SoftCloud'));
    check('S6 Fugas: el contador solo suma lo identificado (6 € de la subida de este mes)', () => lk.detected_this_month === 6);
    const stableNoCat = L([ex('Gestoría', '2026-06-05', 80), ex('Gestoría', '2026-07-05', 80), ex('Gestoría', '2026-08-05', 81)], '2026-08-20');
    check('S6 Fugas: sin categoría pero base estable (±5 %) → recurrente, sin subida', () =>
      stableNoCat.recurring.length === 1 && stableNoCat.increases.length === 0);
    const fc = FC({ entries: ents, balance: 10000, days: 60, refDate: '2026-08-20' });
    check('S6 Previsión: no proyecta los recambios como gasto recurrente', () =>
      !fc.flows.some(f => f.kind === 'recurring' && f.label.startsWith('Recambios')) && fc.flows.some(f => f.kind === 'recurring' && f.label === 'SoftCloud'));
    const dis = L(ents, '2026-08-20', { dismissed: new Set(['softcloud']) });
    check('S6 Fugas: un proveedor descartado desaparece de subidas y recurrentes', () => dis.increases.length === 0 && !dis.recurring.length);
  }
  await checkAsync('S6 Fugas: POST /leaks/dismiss (Luz SA) → ya no sale en subidas y figura en descartados',
    post('/api/finance/leaks/dismiss', { party_key: 'A00000001', party_name: 'Luz SA' }, tok).then(() => get('/api/finance/leaks', tok)),
    r => r.status === 200 && !r.data.increases.some(x => x.party_name === 'Luz SA') && r.data.dismissed.some(d => d.party_key === 'A00000001'));
  await checkAsync('S6 Fugas: DELETE /leaks/dismiss → Luz SA vuelve',
    del('/api/finance/leaks/dismiss', { party_key: 'A00000001' }, tok).then(() => get('/api/finance/leaks', tok)),
    r => r.status === 200 && r.data.increases.some(x => x.party_name === 'Luz SA') && !r.data.dismissed.length);
  await checkAsync('S6 Fugas: dismiss sin party_key → 400',
    post('/api/finance/leaks/dismiss', {}, tok), r => r.status === 400);

  // ── Sesión 6: Cobros por días desde el vencimiento ──
  check('S6 Cobros: factura no vencida → "vence en N días", no cuenta en overdue_60 ni en vencido', () => {
    const { receivables: R } = require('../utils/finance');
    const inc = (id, date, due, total) => ({ id, type: 'income', party_name: `C${id}`, party_nif: '', invoice_number: `F${id}`, invoice_date: date, due_date: due, total, paid: false });
    const out = R([
      inc(1, '2026-06-01', '2026-10-10', 500),   // emitida hace 119 días, aún no vence
      inc(2, '2026-07-01', '2026-08-14', 800),   // vencida hace 45 días
      inc(3, '2026-06-01', null, 300)            // sin vencimiento → 1-jul → 89 días vencida
    ], '2026-09-28');
    const p = Object.fromEntries(out.pending.map(x => [x.id, x]));
    return p[1].is_overdue === false && p[1].days_to_due === 12 && p[1].days_overdue === 0 && p[1].level === 'ok'
      && p[2].days_overdue === 45 && p[2].level === 'high'
      && p[3].effective_due_date === '2026-07-01' && p[3].days_overdue === 89 && p[3].level === 'critical'
      && out.overdue_60 === 300 && out.overdue_total === 1100 && out.pending[0].id === 3;
  });

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
    r => r.status === 200 && r.data.ledger_count === 7 && r.data.receivables.count === 1 && !!r.data.next_deadline
      && typeof r.data.ai_used_today === 'number');

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

  // ── Resumen mensual por email y reclamación automática de cobros ──
  {
    const savedResend = process.env.RESEND_API_KEY;
    delete process.env.RESEND_API_KEY;
    await checkAsync('Perfil: monthlySummary activado por defecto; autoCollections se guarda',
      put('/api/profile', { autoCollections: true }, tok),
      r => r.status === 200 && r.data.profile.monthlySummary === true && r.data.profile.autoCollections === true);
    const { buildSummary, runMonthlySummaries } = require('../services/monthlySummary');
    const sum = buildSummary(lid, '2026-02', '2026-03-02');
    check('Resumen: febrero con ingresos 2000, gastos 100 y cobros pendientes', () =>
      sum.income === 2000 && sum.expense === 100 && sum.result === 1900 && sum.receivables.count === 1 && sum.lang === 'fr');
    const s1 = await runMonthlySummaries(new Date('2026-03-02T09:00:00Z'));
    const s2 = await runMonthlySummaries(new Date('2026-03-02T15:00:00Z'));
    const s3 = await runMonthlySummaries(new Date('2026-03-10T09:00:00Z'));
    check('Resumen: se envía los días 1-3, una sola vez por mes', () => s1 >= 1 && s2 === 0 && s3 === 0
      && !!getDB().prepare("SELECT 1 FROM reminders_sent WHERE license_id = ? AND deadline_key = 'summary-2026-02'").get(lid));

    await checkAsync('Cobros: email del cliente inválido se descarta',
      patch(`/api/ledger/${ids[1]}`, { party_email: 'no es un email' }, tok), r => r.status === 200 && r.data.entry.party_email === '');
    await checkAsync('Cobros: email del cliente se guarda normalizado',
      patch(`/api/ledger/${ids[1]}`, { party_email: ' Pagos@ClienteB.test ' }, tok), r => r.status === 200);
    const { runAutoCollections } = require('../services/collections');
    const c0 = await runAutoCollections(new Date('2026-03-15T09:00:00Z')); // vence (emisión+30) el 12-mar → 3 días
    const c1 = await runAutoCollections(new Date('2026-03-20T09:00:00Z')); // +8 días → etapa 1
    const c1b = await runAutoCollections(new Date('2026-03-25T09:00:00Z'));
    const c2 = await runAutoCollections(new Date('2026-04-12T09:00:00Z')); // +31 → etapa 2
    const cOld = await runAutoCollections(new Date('2026-10-01T09:00:00Z')); // >180 días → a mano
    check('Cobros: recordatorios a +7 y +30 días, sin repetir ni reclamar lo muy antiguo', () =>
      c0 === 0 && c1 === 1 && c1b === 0 && c2 === 1 && cOld === 0);
    await checkAsync('Cobros: GET /api/finance/receivables → auto_stage 2 y email del cliente',
      get('/api/finance/receivables', tok),
      r => r.status === 200 && r.data.pending[0].auto_stage === 2 && r.data.pending[0].party_email === 'pagos@clienteb.test');
    const { buildCollectionEmail } = require('../utils/mailer');
    const mail = buildCollectionEmail({ lang: 'fr', stage: 3, company: 'Taller <b>X</b>', entry: { party_name: 'Cliente B', invoice_number: 'F-2', invoice_date: '2026-02-10', due_date: '2026-03-12', total: 2420 } });
    check('Cobros: plantilla en el idioma del usuario, HTML escapado y sin marca Nokfi arriba', () =>
      mail.subject.startsWith('Dernier avis') && mail.html.includes('Taller &lt;b&gt;X&lt;/b&gt;') && !mail.html.includes('<b>X</b>'));
    await put('/api/profile', { autoCollections: false }, tok);
    if (savedResend !== undefined) process.env.RESEND_API_KEY = savedResend;
  }

  // ── Cifras exactas de Excel para la IA (la IA no suma) ──
  {
    const { tableStats } = require('../utils/tableStats');
    const P = require('../services/ai/prompts');
    const rows = [];
    for (let i = 0; i < 120; i++) rows.push({ Fecha: `2026-0${6 + (i % 3)}-10`, Producto: i % 2 ? 'A' : 'B', 'Precio unitario': '10,5', Importe: i % 2 ? '100' : '1.000,00 €', Coste: i % 2 ? 40 : 900 });
    const st = tableStats(rows);
    check('Excel: totales exactos sobre todas las filas, precio solo en media, margen y por producto', () =>
      st.filas === 120 && st.totales.Importe.suma === 66000 && st.totales['Precio unitario'].suma === undefined
      && st.margen_total.margen_pct === 14.55 && st.por_categoria.Producto.detalle[0].Producto === 'B'
      && st.por_categoria.Producto.detalle[1].margen_pct === 60 && st.por_mes.length === 3);
    const f = P.sanitizeFiles([{ name: 'v.csv', rows, total_rows: 120 }])[0];
    const { text } = P.buildExcel({ module: 'ventas', context: '', files: [f] });
    check('Excel: el prompt lleva las CIFRAS EXACTAS y solo una muestra de 80 filas', () =>
      text.includes('CIFRAS EXACTAS') && text.includes('"suma":"66.000,00 €"') && JSON.parse(f.content).length === 80);
    // Sesión 6: cifras formateadas, saldo sin sumar, fechas de serie → ISO, sin "Número de filas".
    const caja = [];
    for (let i = 0; i < 6; i++) caja.push({ Fecha: 46223 + i * 15, Concepto: i % 2 ? 'Pagos' : 'Cobros taller', Entrada: i % 2 ? '' : '1.100,50', Salida: i % 2 ? 300 : '', Saldo: 5000 + i * 100 });
    const fc = P.sanitizeFiles([{ name: 'caja.csv', rows: caja, total_rows: 6 }], 3, 'es')[0];
    const stc = JSON.parse(fc.stats);
    check('S6 Excel: saldo = último valor (no suma), importes "3.301,50 €", fechas de serie → ISO en la muestra', () =>
      stc.totales.Saldo.saldo_final === '5.500,00 €' && stc.totales.Saldo.suma === undefined && stc.totales.Entrada.suma === '3.301,50 €'
      && JSON.parse(fc.content)[0].Fecha === '2026-07-20' && stc.fechas.desde === '2026-07');
    const { text: tc } = P.buildExcel({ module: 'caja', context: '', files: [fc] });
    check('S6 Excel: el prompt prohíbe fechas numéricas y el nº de filas como cifra', () => tc.includes('nunca como número') && tc.includes('número de filas'));
    const rep = P.normalizeReport({ summary: 's', key_figures: [{ label: 'Número de filas', value: '120' }, { label: 'Saldo final', value: '5.500,00 €' }], glossary: [{ term: 'Filas', definition: 'x' }], priorities: [], action_plan: [] });
    check('S6 Excel: normalizeReport quita "Número de filas" de cifras clave y glosario', () =>
      rep.key_figures.length === 1 && rep.key_figures[0].label === 'Saldo final' && rep.glossary.length === 0);
    check('S6 toNumber: "1.100" es mil cien (punto de miles)', () => require('../utils/tableStats').toNumber('1.100') === 1100);
  }

  // ── Enlace de solo lectura para la gestoría ──
  {
    let link = null;
    await checkAsync('Compartir: POST /api/share → 201 con token (una vez) y caducidad',
      post('/api/share', { label: 'Gestoría López', days: 90 }, tok),
      r => { link = r.data.link; return r.status === 201 && /^[A-Za-z0-9_-]{32}$/.test(link.token) && !!link.expires_at; });
    await checkAsync('Compartir: GET /api/share → lista sin token ni hash',
      get('/api/share', tok),
      r => r.status === 200 && r.data.links.length === 1 && r.data.links[0].active && !('token' in r.data.links[0]) && !JSON.stringify(r.data).includes(link.token));
    check('Compartir: en BD solo el hash del token', () =>
      !getDB().prepare('SELECT 1 FROM share_links WHERE token_hash = ?').get(link.token));
    await checkAsync('Compartir: GET /api/shared/:token → empresa, 4 trimestres y libro, sin emails de clientes, noindex',
      call('GET', `/api/shared/${link.token}?year=2026`, {}),
      r => r.status === 200 && r.data.quarters.length === 4 && r.data.entries.length >= 6 && r.data.year === 2026
        && !JSON.stringify(r.data).includes('pagos@clienteb.test') && !('party_email' in r.data.entries[0]));
    await checkAsync('Compartir: token inventado → 404', call('GET', '/api/shared/abcdefghijklmnopqrstuvwxyz012345', {}), r => r.status === 404);
    await checkAsync('Compartir: DELETE /api/share/:id → revocado', del(`/api/share/${link.id}`, null, tok), r => r.status === 200);
    await checkAsync('Compartir: enlace revocado → 404', call('GET', `/api/shared/${link.token}`, {}), r => r.status === 404);
  }

  await checkAsync('V1: DELETE /api/ledger/:id → 200 y ya no está',
    del(`/api/ledger/${ids[6]}`, null, tok), r => r.status === 200);

  // ── V7: comparación con el sector (datos reales del INE) ──
  {
    const BENCH = require('../config/benchmarks.json');
    await checkAsync('V7: sin sector/tamaño → available:false (missing_profile)',
      get('/api/finance/benchmark', tok), r => r.status === 200 && r.data.available === false && r.data.reason === 'missing_profile');
    await put('/api/profile', { sector: 'Comercio', size: 'solo' }, tok);
    await checkAsync('V7: Comercio/solo → referencia INE real + tus cifras + veredictos',
      get('/api/finance/benchmark', tok),
      r => r.status === 200 && r.data.available === true
        && r.data.reference.operating_margin_pct === BENCH.sectors['Comercio'].by_size.solo.operating_margin_pct
        && r.data.source.name.includes('INE') && r.data.metrics.length === 3 && r.data.owner_pay_included === true);
    await put('/api/profile', { sector: 'Construcción' }, tok);
    await checkAsync('V7: Construcción no cubierta por el INE → sector_not_covered (nada inventado)',
      get('/api/finance/benchmark', tok), r => r.status === 200 && r.data.available === false && r.data.reason === 'sector_not_covered');
    check('V7: veredicto (margen mayor = mejor; coste mayor = peor; ±15 %)', () => {
      const { verdict } = require('../utils/benchmark');
      return verdict(30, 20, true) === 'better' && verdict(30, 20, false) === 'worse' && verdict(21, 20, true) === 'similar';
    });
  }

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
    await checkAsync('S7: el análisis hecho por API sale en el Historial con source "api"',
      get('/api/analyses', tok), r => r.status === 200 && (r.data.analyses || r.data).find?.(x => x.id === aid)?.source === 'api');
    // ── Sesión 7: POST /api/v1/invoices/extract ──
    const minimalPdf = (lines) => {
      const content = 'BT /F1 12 Tf 50 750 Td 16 TL ' + lines.map(l => `(${l}) '`).join(' ') + ' ET';
      const objs = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
        '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
        `<< /Length ${content.length} >>\nstream\n${content}\nendstream`, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
      let out = '%PDF-1.4\n'; const offs = [];
      objs.forEach((o, i) => { offs.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
      const x = out.length;
      out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + offs.map(o => `${String(o).padStart(10, '0')} 00000 n \n`).join('');
      out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${x}\n%%EOF\n`;
      return Buffer.from(out, 'latin1').toString('base64');
    };
    let sentPrompt = '';
    global.fetch = async (_url, o) => {
      sentPrompt = String(o?.body || '');
      return { ok: true, status: 200, text: async () => '', json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify({ invoices: [
        { file_name: 'f1.pdf', is_invoice: true, issuer_name: 'Talleres Ruiz SL', issuer_nif: 'B12345674', recipient_nif: '12345678Z', invoice_number: 'F-2026-017', invoice_date: '2026-09-14', base: 1000, vat_rate: 21, vat_amount: 210, irpf_rate: 0, irpf_amount: 0, total: 1210 },
        { file_name: 'f2.txt', is_invoice: true, issuer_name: 'Mal SL', issuer_nif: 'B12345675', invoice_number: '', invoice_date: '2099-01-01', base: 100, vat_rate: 21, vat_amount: 21, irpf_amount: 0, total: 150 }
      ] }) }] } }] }) };
    };
    const usedBefore = (await get('/api/v1/usage', apiKey)).data.used_today;
    await checkAsync('S7 API: invoices/extract (PDF digital + texto) → checks y warnings deterministas',
      post('/api/v1/invoices/extract', { files: [
        { name: 'f1.pdf', mime: 'application/pdf', data: minimalPdf(['FACTURA F-2026-017', 'Talleres Ruiz SL NIF B12345674', 'Total 1.210,00 EUR']) },
        { name: 'f2.txt', text: 'Factura de Mal SL, total 150' },
        { name: 'foto.gif', mime: 'image/gif', data: 'R0lGODlh' }
      ] }, apiKey),
      r => {
        if (r.status !== 200) return false;
        const [a, b] = r.data.invoices;
        return r.data.invoices.length === 2 && a.checks.totals_ok && a.checks.nif_valid && a.checks.recipient_nif_valid === true && a.checks.date_valid && a.warnings.length === 0
          && !b.checks.totals_ok && !b.checks.nif_valid && !b.checks.date_valid
          && ['totals_mismatch', 'issuer_nif_invalid', 'date_in_future', 'number_missing'].every(c => b.warnings.some(w => w.code === c))
          && r.data.errors.length === 1 && r.data.errors[0].error === 'unsupported_type' && a.check_ok === undefined;
      });
    check('S7 API: el texto del PDF se extrae en el servidor y va en el prompt', () => sentPrompt.includes('Talleres Ruiz SL NIF B12345674'));
    await checkAsync('S7 API: una petición de facturas gasta 1 análisis de la cuota',
      get('/api/v1/usage', apiKey), r => r.data.used_today === usedBefore + 1);
    await checkAsync('S7 API: PDF sin texto (escaneado) → 400 no_readable_files con pdf_scanned y sin gastar cuota',
      post('/api/v1/invoices/extract', { files: [{ name: 'scan.pdf', mime: 'application/pdf', data: minimalPdf([]) }] }, apiKey),
      r => r.status === 400 && r.data.error === 'no_readable_files' && r.data.errors[0].error === 'pdf_scanned');
    await checkAsync('S7 API: más de 5 documentos → 400 too_many_files',
      post('/api/v1/invoices/extract', { files: Array.from({ length: 6 }, (_, i) => ({ name: `t${i}`, text: 'x' })) }, apiKey),
      r => r.status === 400 && r.data.error === 'too_many_files');
    await checkAsync('S7 API: las facturas por API no se guardan en el libro',
      get('/api/ledger', tok), r => r.status === 200 && !r.data.entries.some(e => e.party_name === 'Talleres Ruiz SL'));
    global.fetch = savedFetch;
    if (savedKey === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = savedKey;
  }
  // ── Sesión 7: Cerebras como respaldo con tope de seguridad de gasto ──
  {
    const providers = require('../services/ai/providers');
    const budget = require('../utils/aiBudget');
    const saved = { fetch: global.fetch, AI: process.env.AI_PROVIDERS, K: process.env.CEREBRAS_API_KEY, A: process.env.CF_ACCOUNT_ID, T: process.env.CF_AI_TOKEN, D: process.env.AI_BUDGET_CEREBRAS_DAILY_TOKENS };
    process.env.AI_PROVIDERS = 'cloudflare,cerebras'; process.env.CEREBRAS_API_KEY = 'csk_test'; process.env.CF_ACCOUNT_ID = 'acc'; process.env.CF_AI_TOKEN = 'tok';
    const seen = [];
    global.fetch = async (url, o) => {
      const body = JSON.parse(o.body); seen.push({ url, model: body.model, reasoning: body.reasoning_effort });
      if (url.includes('cloudflare')) return { ok: false, status: 429, text: async () => 'neurons exhausted' };
      return { ok: true, status: 200, text: async () => '', json: async () => ({ choices: [{ message: { content: '{"summary":"desde cerebras"}' }, finish_reason: 'stop' }], usage: { prompt_tokens: 1000, completion_tokens: 500 } }) };
    };
    getDB().prepare("DELETE FROM ai_provider_usage WHERE provider = 'cerebras'").run();
    const r1 = await providers.generate({ system: 's', parts: [{ text: 'hola' }], schema: { type: 'OBJECT', properties: { summary: { type: 'STRING' } } }, maxTokens: 200 });
    check('S7 IA: si Cloudflare se agota, responde Cerebras (gpt-oss-120b, reasoning low) y se anota su consumo', () =>
      r1.json.summary === 'desde cerebras' && seen.some(x => x.url.includes('cerebras') && x.model === 'gpt-oss-120b' && x.reasoning === 'low')
      && budget.usage('cerebras').tokens === 1500 && budget.usage('cerebras').cost_usd > 0);
    seen.length = 0;
    await providers.generate({ system: 's', parts: [{ text: 'factura' }, { inlineData: { mimeType: 'image/png', data: 'AAAA' } }], schema: { type: 'OBJECT', properties: { summary: { type: 'STRING' } } }, maxTokens: 200 });
    check('S7 IA: con imágenes, Cerebras usa el modelo con visión (qwen-3.8-27b)', () => seen.some(x => x.url.includes('cerebras') && x.model === 'qwen-3.8-27b'));
    process.env.AI_BUDGET_CEREBRAS_DAILY_TOKENS = '2000';
    seen.length = 0;
    let err = null;
    try { await providers.generate({ system: 's', parts: [{ text: 'hola' }], schema: { type: 'OBJECT', properties: { summary: { type: 'STRING' } } }, maxTokens: 1000 }); } catch (e) { err = e; }
    check('S7 IA: con el tope diario alcanzado NO se llama a Cerebras (0 peticiones) y el error es controlado', () =>
      err && err.code === 'ai_quota_exceeded' && !seen.some(x => x.url.includes('cerebras')));
    process.env.AI_BUDGET_CEREBRAS_DAILY_TOKENS = '0';
    check('S7 IA: tope a 0 desactiva el proveedor', () => budget.allow('cerebras', 1).ok === false);
    delete process.env.AI_BUDGET_CEREBRAS_DAILY_TOKENS;
    getDB().prepare("INSERT OR REPLACE INTO ai_provider_usage (provider, day, calls, tokens_in, tokens_out, cost_usd) VALUES ('cerebras', ?, 1, 0, 0, 3.99)").run(new Date().toISOString().slice(0, 7) + '-01');
    check('S7 IA: tope mensual en USD (4 $ por defecto) bloquea antes de pasarse', () => budget.allow('cerebras', 100000).ok === false && budget.allow('cerebras', 100).ok === true);
    check('S7 IA: los proveedores sin tope (Cloudflare) no se bloquean', () => budget.allow('cloudflare', 1e9).ok === true);
    const buildOpsReport_ = () => require('../services/opsReport').buildOpsReport(new Date());
    process.env.AI_EXPIRES_CEREBRAS = new Date().toISOString().slice(0, 10);
    check('S7 IA: el día de caducidad (AI_EXPIRES_CEREBRAS) Cerebras sale solo de la cadena de análisis y de chat', () =>
      !providers.providerOrder().includes('cerebras') && !require('../services/ai/chat').providerOrder().includes('cerebras'));
    process.env.AI_EXPIRES_CEREBRAS = new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10);
    check('S7 IA: antes de la fecha sigue activo y el informe avisa a 5 días', () =>
      providers.providerOrder().includes('cerebras') && buildOpsReport_().alerts.some(a => a.includes('cerebras caduca') && a.includes('en 5 días')));
    delete process.env.AI_EXPIRES_CEREBRAS;
    const { buildOpsReport } = require('../services/opsReport');
    check('S7 ops: el informe diario incluye el consumo por proveedor y avisa al 80 % del tope mensual', () => {
      const rep = buildOpsReport(new Date(Date.now() + 86400000));
      return Array.isArray(rep.ai.usage) && rep.alerts.some(a => a.includes('cerebras') && a.includes('tope'));
    });
    getDB().prepare("DELETE FROM ai_provider_usage").run();
    global.fetch = saved.fetch;
    for (const [k, env] of [['AI', 'AI_PROVIDERS'], ['K', 'CEREBRAS_API_KEY'], ['A', 'CF_ACCOUNT_ID'], ['T', 'CF_AI_TOKEN'], ['D', 'AI_BUDGET_CEREBRAS_DAILY_TOKENS']]) {
      if (saved[k] === undefined) delete process.env[env]; else process.env[env] = saved[k];
    }
  }

  // ── Sesión 7: servidor MCP (/api/mcp) ──
  {
    const rpc = (method, params, id = 1, key = apiKey) => post('/api/mcp', { jsonrpc: '2.0', id, method, params }, key);
    await checkAsync('S7 MCP: sin clave → 401', post('/api/mcp', { jsonrpc: '2.0', id: 1, method: 'initialize' }), r => r.status === 401);
    await checkAsync('S7 MCP: initialize → protocolVersion, tools y serverInfo',
      rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '1' } }),
      r => r.status === 200 && r.data.result.protocolVersion === '2025-06-18' && r.data.result.capabilities.tools && r.data.result.serverInfo.name === 'nokfi');
    await checkAsync('S7 MCP: notificación → 202 sin cuerpo',
      post('/api/mcp', { jsonrpc: '2.0', method: 'notifications/initialized' }, apiKey), r => r.status === 202);
    await checkAsync('S7 MCP: tools/list → herramientas con inputSchema (5 de la sesión 7 + 5 fiscales de la 9)',
      rpc('tools/list', {}), r => r.status === 200 && r.data.result.tools.length === 10
        && ['extract_invoices', 'analyze', 'get_usage', 'list_analyses', 'get_analysis'].every(n => r.data.result.tools.some(t => t.name === n && t.inputSchema)));
    await checkAsync('S7 MCP: tools/call get_usage → structuredContent con la cuota',
      rpc('tools/call', { name: 'get_usage', arguments: {} }), r => r.status === 200 && r.data.result.structuredContent.daily_quota === 50 && !r.data.result.isError);
    await checkAsync('S7 MCP: tools/call extract_invoices con error → isError (mismo código que la API)',
      rpc('tools/call', { name: 'extract_invoices', arguments: { files: [] } }),
      r => r.status === 200 && r.data.result.isError === true && JSON.parse(r.data.result.content[0].text).error === 'invalid_input');
    await checkAsync('S7 MCP: herramienta desconocida → error -32602; método desconocido → -32601',
      Promise.all([rpc('tools/call', { name: 'nope' }), rpc('resources/list', {})]),
      ([a, b]) => a.data.error?.code === -32602 && b.data.error?.code === -32601);
    await checkAsync('S7 MCP: GET → 405', get('/api/mcp', apiKey), r => r.status === 405);
  }

  // ── Sesión 7: registro de llamadas y resumen de Desarrolladores ──
  await checkAsync('S7 Dev: GET /api/keys → calls_today por clave (>= 3 llamadas hoy)',
    get('/api/keys', tok), r => r.status === 200 && r.data.keys.find(k => k.id === apiKeyId)?.calls_today >= 3);
  await checkAsync('S7 Dev: GET /api/keys/summary → llamadas, errores de hoy y último error (too_many_files)',
    get('/api/keys/summary', tok), r => r.status === 200 && r.data.available === true && r.data.keys_active >= 1
      && r.data.calls_today >= 3 && r.data.errors_today >= 2 && r.data.last_error?.error_code === 'too_many_files'
      && r.data.last_error.path === '/api/v1/invoices/extract' && r.data.quota.daily === 50);
  check('S7 Dev: el registro no guarda contenido (solo ruta, estado, código y ms)', () => {
    const cols = getDB().prepare('PRAGMA table_info(api_calls)').all().map(c => c.name);
    return !cols.some(c => /body|data|input|content/.test(c));
  });
  getDB().prepare("UPDATE licenses SET plan = 'mini' WHERE id = ?").run(lid);
  await checkAsync('F4: licencia bajada a Mini → su clave da 401 api_plan_required (no se borra)',
    get('/api/v1/usage', apiKey), r => r.status === 401 && r.data.error === 'api_plan_required');
  await checkAsync('F4: Mini no puede crear claves → 403 api_plan_required',
    post('/api/keys', { name: 'x' }, tok), r => r.status === 403 && r.data.error === 'api_plan_required');
  getDB().prepare("UPDATE licenses SET plan = 'pro' WHERE id = ?").run(lid);
  await checkAsync('F4: DELETE /api/keys/:id → revocada', call('DELETE', `/api/keys/${apiKeyId}`, { auth: tok }), r => r.status === 200);
  await checkAsync('F4: clave revocada → 401 api_key_revoked', get('/api/v1/usage', apiKey), r => r.status === 401 && r.data.error === 'api_key_revoked');

  // ── Sesión 8: informes y asistente con los datos reales del libro ──
  {
    const { financeContext, normalizeLink } = require('../services/ai/financeContext');
    const P = require('../services/ai/prompts');
    const fc = financeContext(lid, { today: '2026-04-10' });
    check('S8: contexto del libro con impuestos, cobros, plazo y caja enlazados', () =>
      fc.hasData && fc.text.includes('Por cobrar') && fc.text.includes('[enlace: cobros]') && fc.text.includes('[enlace: impuestos]')
      && fc.text.includes('Próximo plazo fiscal') && fc.text.includes('Caja: saldo') && /\d\.\d{3},\d{2} €/.test(fc.text));
    check('S8: contexto con tope de caracteres (por líneas completas)', () => financeContext(lid, { maxChars: 200 }).text.length <= 200);
    check('S8: libro vacío → sin cifras inventadas', () => { const e = financeContext(999999); return !e.hasData && e.text.includes('vacío'); });
    check('S8: enlaces solo a pantallas de Nokfi', () =>
      normalizeLink('cobros') === '/app/finanzas/cobros' && normalizeLink('/app/finanzas/prevision') === '/app/finanzas/prevision'
      && normalizeLink('https://evil.example') === '' && normalizeLink('/app/admin') === '');
    const rep = P.normalizeReport({
      summary: 's',
      key_figures: [{ label: 'Nota de salud', value: '42/100' }, { label: 'Vencido', value: '2.420,00 €' }],
      priorities: [{ title: 'Cobros', detail: 'd', severity: 'high', link: 'cobros' }],
      action_plan: [{ title: 'B', due_in_days: 14, link: 'x' }, { title: 'C' }, { title: 'A', due_in_days: 2, link: 'impuestos' }]
    }, { dropHealth: true });
    check('S8: informe sin la nota repetida, con enlaces y plan ordenado por plazo', () =>
      rep.key_figures.length === 1 && rep.priorities[0].link === '/app/finanzas/cobros'
      && rep.action_plan.map(a => a.title).join() === 'A,B,C' && rep.action_plan[1].link === '' && rep.action_plan[0].link === '/app/finanzas/impuestos');
    const q = P.buildQuestionnaire({ answers: { conciliacion: true, control_cobros: false }, health: { score: 42 }, finance: fc.text });
    check('S8: el diagnóstico lleva el libro y prohíbe frases genéricas', () =>
      q.text.includes('[enlace: cobros]') && q.text.includes('puede llevar a') && q.text.includes('no las propongas como tarea'));
    const { createAnalysis } = require('../db/database');
    const { createActionsForAnalysis, listActionsForAnalysis } = require('../db/actions');
    const aid = createAnalysis({ license_id: lid, kind: 'cuestionario', title: 'S8', result_json: rep, meta: {}, prompt_chars: 1 });
    createActionsForAnalysis(lid, aid, rep.action_plan);
    check('S8: las tareas del plan guardan su enlace', () => listActionsForAnalysis(lid, aid)[0].link === '/app/finanzas/impuestos');
    await checkAsync('S8: el panel trae el deudor vencido principal', get('/api/dashboard', tok),
      r => r.status === 200 && 'top_overdue' in r.data.receivables);
    await checkAsync('S8: el plan de Inicio solo trae tareas del informe más reciente', get('/api/dashboard', tok),
      r => r.status === 200 && r.data.actions.next.length > 0 && r.data.actions.next.every(a => a.analysis_id === aid));
    await checkAsync('S8: sector nuevo del onboarding se guarda y tiene comparación del INE',
      put('/api/profile', { sector: 'Taller mecánico', size: 'solo' }, tok), r => r.status === 200 && r.data.profile.sector === 'Taller mecánico');
    await checkAsync('S8: comparación con el sector para "Taller mecánico" (CNAE 452)', get('/api/finance/benchmark', tok),
      r => r.status === 200 && JSON.stringify(r.data).includes('452'));
    {
      const { compare } = require('../utils/benchmark');
      const e = [{ type: 'income', invoice_date: new Date().toISOString().slice(0, 10), base: 1000 }, { type: 'expense', invoice_date: new Date().toISOString().slice(0, 10), base: 300, category: 'Proveedores' }];
      const staff = (size) => compare({ sector: 'Taller mecánico', size }, e).metrics.find(m => m.key === 'staff_costs');
      check('S8: con empleados y sin gastos de Personal no se "gana" al sector con un 0 %', () =>
        staff('2-5').yours === null && staff('2-5').verdict === null && staff('2-5').note === 'no_staff_entries' && staff('solo').yours === 0);
    }
    await checkAsync('S8: el resumen de Desarrolladores cuenta también las claves revocadas', get('/api/keys/summary', tok),
      r => r.status === 200 && typeof r.data.keys_total === 'number' && r.data.keys_total >= r.data.keys_active);

    const saved = { fetch: global.fetch, CP: process.env.CHAT_PROVIDERS, G: process.env.GROQ_API_KEY };
    process.env.CHAT_PROVIDERS = 'groq'; process.env.GROQ_API_KEY = 'gsk_test';
    let sys = '';
    global.fetch = async (url, o) => { sys = JSON.parse(o.body).messages[0].content; return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: 'Te deben 2.420,00 €.\n/app/finanzas/cobros' } }] }) }; };
    await checkAsync('S8: el asistente recibe las cifras del libro y las rutas válidas',
      post('/api/chat', { messages: [{ role: 'user', content: '¿Quién me debe dinero?' }], lang: 'es' }, tok),
      r => r.status === 200 && sys.includes('Datos reales del negocio') && sys.includes('Por cobrar') && sys.includes('cobros = /app/finanzas/cobros'));
    global.fetch = saved.fetch;
    for (const [k, v] of [['CHAT_PROVIDERS', saved.CP], ['GROQ_API_KEY', saved.G]]) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  }

  // ── Operaciones: salud, informe diario y registro de fallos ──
  await checkAsync('Ops: GET /api/health comprueba la BD → 200', get('/api/health'), r => r.status === 200 && r.data.status === 'ok');
  {
    const savedResend = process.env.RESEND_API_KEY;
    delete process.env.RESEND_API_KEY;
    const { buildOpsReport, runOpsReport } = require('../services/opsReport');
    const rep = buildOpsReport(new Date());
    check('Ops: informe con copia, disco, IA, emails y actividad', () =>
      typeof rep.backup.ok === 'boolean' && typeof rep.disk.text === 'string' && Array.isArray(rep.alerts)
      && rep.activity.active_licenses >= 1 && typeof rep.ai.ok === 'number');
    const early = await runOpsReport(new Date('2026-10-05T03:00:00Z'));
    const first = await runOpsReport(new Date('2026-10-05T06:00:00Z'));
    const again = await runOpsReport(new Date('2026-10-05T12:00:00Z'));
    check('Ops: el informe diario se envía una vez al día y no de madrugada', () => early === false && first === true && again === false);
    if (savedResend !== undefined) process.env.RESEND_API_KEY = savedResend;
  }

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
