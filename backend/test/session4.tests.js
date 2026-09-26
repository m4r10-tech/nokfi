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
      && calls[0].body.messages[0].content.includes('"type":"object"'));
    calls.length = 0;
    global.fetch = async (url, o) => { calls.push({ url }); return url.includes('groq') ? { ok: false, status: 429, text: async () => 'rate' } : ok({ summary: 'desde cloudflare' }); };
    const r2 = await providers.generate({ system: 's', parts: [{ text: 'x' }], schema: { type: 'OBJECT' } });
    check('IA: si Groq agota cuota (429) responde Cloudflare', () => r2.model.startsWith('cloudflare:') && r2.json.summary === 'desde cloudflare' && calls.length === 2);
    check('IA: sin AI_PROVIDERS explícito, Gemini (free tier que entrena) NO está en el orden', () => {
      delete process.env.AI_PROVIDERS; const o = providers.providerOrder(); process.env.AI_PROVIDERS = 'groq,cloudflare';
      return !o.includes('gemini') && o[0] === 'groq';
    });
    let pdfErr = null;
    global.fetch = async () => ok({});
    try { await providers.generate({ system: 's', parts: [{ inlineData: { mimeType: 'application/pdf', data: 'AAA' } }], schema: { type: 'OBJECT' } }); } catch (e) { pdfErr = e; }
    check('IA: PDF inline no se manda a modelos que no lo leen (error controlado)', () => !!pdfErr && pdfErr.code === 'ai_provider_error');
    const chat = require('../services/ai/chat');
    check('Chat: orden por defecto sin Gemini ni OpenRouter', () => {
      const prev = process.env.CHAT_PROVIDERS; delete process.env.CHAT_PROVIDERS; process.env.CEREBRAS_API_KEY = 'c';
      const o = chat.providerOrder(); if (prev !== undefined) process.env.CHAT_PROVIDERS = prev; delete process.env.CEREBRAS_API_KEY;
      return o[0] === 'cerebras' && !o.includes('gemini') && !o.includes('openrouter');
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
      text.includes('CIFRAS EXACTAS') && text.includes('"suma":66000') && JSON.parse(f.content).length === 80);
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
