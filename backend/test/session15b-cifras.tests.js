/**
 * Tests e2e de la sesión 15b, lote 4 (cifras e impuestos). Se ejecutan desde
 * test/e2e.test.js con sus mismos helpers (misma BD temporal y server).
 * Sin IA real: el borrador de reclamación usa un fetch simulado.
 */

'use strict';

module.exports = async function session15bCifrasTests({ post, put, get, call, check, checkAsync, getDB }) {
  const patch = (path, body, auth) => call('PATCH', path, { body, auth });
  const U = require('../utils/finance');

  async function account(email, legalForm) {
    const lic = await post('/api/admin/licenses', { email, plan: 'pro', password: 'Cifras15b!' }, 'admin');
    const login = await post('/api/auth/login', { email, license_key: lic.data.key, password: 'Cifras15b!' });
    const tok = login.data.token;
    if (legalForm) await put('/api/profile', { legalForm }, tok);
    return { tok, lid: lic.data.id };
  }

  // ── F1: el 303 descuenta la cuota a compensar de trimestres anteriores ──
  // Caso del informe de la QA (sub3): 1T 956 · 2T −1.176 · 3T 2.289 − 1.176 = 1.113 · 4T 844,20.
  const vatE = (date, type, vat) => ({ type, invoice_date: date, base: vat / 0.21, vat_amount: vat, irpf_amount: 0, total: vat / 0.21 + vat });
  const sub3 = [
    vatE('2026-02-10', 'income', 1880), vatE('2026-02-11', 'expense', 924),
    vatE('2026-05-10', 'income', 2100), vatE('2026-05-11', 'expense', 3276),
    vatE('2026-08-10', 'income', 3045), vatE('2026-08-11', 'expense', 756),
    vatE('2026-11-02', 'income', 1470), vatE('2026-11-03', 'expense', 625.8)
  ];
  {
    const q2 = U.vatForQuarter(sub3, 2026, 2), q3 = U.vatForQuarter(sub3, 2026, 3);
    check('S15b F1: 2T sale −1.176 € a compensar', () => q2.result === -1176 && q2.previous_compensation === 0);
    check('S15b F1: 3T = 2.289 − 1.176 = 1.113 € (no 2.289 €)', () =>
      q3.quarter_result === 2289 && q3.previous_compensation === 1176 && q3.result === 1113);
    const ts = [1, 2, 3, 4].map(q => U.taxSummary(sub3, { year: 2026, quarter: q, legalForm: 'sociedad' }));
    const annualLedger = Math.round(sub3.reduce((s, e) => s + (e.type === 'income' ? e.vat_amount : -e.vat_amount), 0) * 100) / 100;
    const sumTaxes = Math.round(ts.reduce((s, x) => s + x.total_estimated, 0) * 100) / 100;
    check('S15b F1: suma de Impuestos (1T-4T) = IVA anual del Libro (2.913,20 €)', () =>
      annualLedger === 2913.2 && sumTaxes === 2913.2 && ts[2].total_estimated === 1113 && ts[1].vat_refund === 1176 && ts[3].total_estimated === 844.2);
    // Compensación parcial que se arrastra dos trimestres: 1T −100, 2T +60 (queda −40), 3T +100 → 60.
    const chain = [vatE('2026-01-05', 'expense', 100), vatE('2026-04-05', 'income', 60), vatE('2026-07-05', 'income', 100)];
    check('S15b F1: la compensación sobrante sigue arrastrándose (−100, +60 → −40, +100 → 60)', () =>
      U.vatForQuarter(chain, 2026, 2).result === -40 && U.vatForQuarter(chain, 2026, 3).result === 60
      && U.vatForQuarter(chain, 2026, 3).previous_compensation === 40);
    check('S15b F1: el 1T no arrastra nada del año anterior', () =>
      U.vatForQuarter([vatE('2025-11-05', 'expense', 500), vatE('2026-02-05', 'income', 210)], 2026, 1).result === 210);
  }
  const soc = await account('cifras-sociedad@nokfi.local', 'sociedad');
  await checkAsync('S15b F1: libro del caso sub3 por la API → 201',
    post('/api/ledger', { entries: sub3.map((e, i) => ({ ...e, party_name: `P${i}`, invoice_number: `S3-${i}`, paid: true, paid_at: e.invoice_date })) }, soc.tok),
    r => r.status === 201);
  await checkAsync('S15b F1: GET /api/finance/taxes 3T → 1.113 € (303 con la compensación del 2T)',
    get('/api/finance/taxes?year=2026&quarter=3', soc.tok),
    r => r.status === 200 && r.data.summary.vat.result === 1113 && r.data.summary.vat.previous_compensation === 1176
      && r.data.summary.total_estimated === 1113 && r.data.summary.missing === 1113);

  // ── F4: Fugas detecta la periodicidad (trimestral ≠ mensual) ──
  {
    const ex = (party, date, total, category = '') => ({ id: `${party}${date}`, type: 'expense', party_name: party, party_nif: '', invoice_number: `${party}-${date}`, invoice_date: date, base: total / 1.21, vat_amount: total - total / 1.21, irpf_amount: 0, total, category, paid: true });
    const ents = [
      ex('Asesoría QA', '2026-03-31', 363), ex('Asesoría QA', '2026-06-30', 363), ex('Asesoría QA', '2026-09-30', 363),
      ex('SaaS QA', '2026-08-01', 121, 'Tecnología'), ex('SaaS QA', '2026-09-01', 121, 'Tecnología'), ex('SaaS QA', '2026-10-01', 121, 'Tecnología')
    ];
    const lk = U.leaks(ents, '2026-11-05');
    const ase = lk.recurring.find(r => r.party_name === 'Asesoría QA');
    const saas = lk.recurring.find(r => r.party_name === 'SaaS QA');
    check('S15b F4: trimestral de 363 € → 121 €/mes y 1.452 €/año (no 4.356 €)', () =>
      ase && ase.period_months === 3 && ase.amount === 363 && ase.monthly === 121 && ase.yearly === 1452);
    check('S15b F4: mensual sigue igual y el total al mes suma 121 + 121', () =>
      saas && saas.period_months === 1 && saas.monthly === 121 && saas.yearly === 1452 && lk.recurring_monthly_total === 242);
    const fc = U.forecast({ entries: ents, balance: 10000, days: 90, refDate: '2026-11-05' });
    const aseFlows = fc.flows.filter(f => f.kind === 'recurring' && f.label === 'Asesoría QA');
    const saasFlows = fc.flows.filter(f => f.kind === 'recurring' && f.label === 'SaaS QA');
    check('S15b F4: la previsión resta el trimestral una sola vez (30-12, 363 €), no cada mes', () =>
      aseFlows.length === 1 && aseFlows[0].date === '2026-12-30' && aseFlows[0].amount === -363);
    check('S15b F4: la suscripción mensual se sigue proyectando cada mes (3 cargos en 90 días)', () =>
      saasFlows.length === 3 && saasFlows[0].date === '2026-12-01');
  }

  // ── F5: fecha de cobro editable → días medios de cobro correctos ──
  const aut = await account('cifras-autonomo@nokfi.local', 'autonomo');
  let cobroId = null, cobro2 = null;
  await checkAsync('S15b F5: alta de dos facturas emitidas sin cobrar',
    post('/api/ledger', { entries: [
      { type: 'income', party_name: 'Cliente Alfa SL', invoice_number: 'A-1', invoice_date: '2026-01-15', base: 1000, vat_amount: 210, total: 1210 },
      { type: 'income', party_name: 'Cliente Alfa SL', invoice_number: 'A-2', invoice_date: '2026-02-10', base: 1000, vat_amount: 210, total: 1210 }
    ] }, aut.tok),
    r => { if (r.status === 201) [cobroId, cobro2] = r.data.ids; return r.status === 201; });
  await checkAsync('S15b F5: marcar cobrada con fecha pasada (19-02) guarda esa fecha, no la de hoy',
    patch(`/api/ledger/${cobroId}`, { paid: true, paid_at: '2026-02-19' }, aut.tok),
    r => r.status === 200 && r.data.entry.paid === true && r.data.entry.paid_at === '2026-02-19');
  await checkAsync('S15b F5: fecha de cobro anterior a la factura → 400 paid_at',
    patch(`/api/ledger/${cobro2}`, { paid: true, paid_at: '2026-01-01' }, aut.tok),
    r => r.status === 400 && r.data.field === 'paid_at');
  await checkAsync('S15b F5: fecha de cobro futura → 400 paid_at',
    patch(`/api/ledger/${cobro2}`, { paid: true, paid_at: '2099-01-01' }, aut.tok),
    r => r.status === 400 && r.data.field === 'paid_at');
  await patch(`/api/ledger/${cobro2}`, { paid: true, paid_at: '2026-03-08' }, aut.tok);
  await checkAsync('S15b F5: días medios de cobro = (35 + 26) / 2 ≈ 31 (no los días hasta hoy)',
    get('/api/finance/receivables', aut.tok),
    r => r.status === 200 && r.data.avg_collection_days === 31);

  // ── L1: retención siempre positiva ──
  let retId = null;
  await checkAsync('S15b L1: apunte manual con retención −15 se guarda como 15 y queda para revisar (no cuadra con 136)',
    post('/api/ledger', { entries: [{ type: 'income', party_name: 'Cliente Ret', invoice_number: 'R-1', invoice_date: '2026-10-05', base: 100, vat_amount: 21, irpf_rate: -15, irpf_amount: -15, total: 136 }] }, aut.tok)
      .then(r => { retId = r.data.ids?.[0]; return get('/api/ledger?from=2026-10-01&to=2026-10-31', aut.tok); }),
    r => { const e = r.data.entries?.find(x => x.id === retId); return !!e && e.irpf_amount === 15 && e.irpf_rate === 15 && e.needs_review === true; });
  await checkAsync('S15b L1: editar a −15 también se guarda como 15',
    patch(`/api/ledger/${retId}`, { irpf_amount: -15, total: 106 }, aut.tok),
    r => r.status === 200 && r.data.entry.irpf_amount === 15 && r.data.entry.needs_review === false);
  await checkAsync('S15b L1: el 130 cuenta la retención en positivo (resta, no suma)',
    get('/api/finance/taxes?year=2026&quarter=4', aut.tok),
    r => r.status === 200 && r.data.summary.irpf130.withholdings === 15);
  check('S15b L1: en un apunte en negativo (abono) la retención va con el signo de la base', () => {
    const { normalizeEntry } = require('../db/finance');
    const { entry } = normalizeEntry({ type: 'income', invoice_date: '2026-10-05', base: -100, vat_amount: -21, irpf_amount: 15, total: -106 });
    return entry.irpf_amount === -15 && entry.needs_review === 0;
  });

  // ── F8: fechas imposibles ──
  await checkAsync('S15b F8: invoice_date 2026-02-30 → 400 (no se guarda)',
    post('/api/ledger', { entries: [{ type: 'income', party_name: 'Fecha', invoice_number: 'D-1', invoice_date: '2026-02-30', base: 1, total: 1 }] }, aut.tok),
    r => r.status === 400 && r.data.field === 'invoice_date');
  await checkAsync('S15b F8: vencimiento 2026-04-31 → 400',
    post('/api/ledger', { entries: [{ type: 'income', party_name: 'Fecha', invoice_number: 'D-2', invoice_date: '2026-04-01', due_date: '2026-04-31', base: 1, total: 1 }] }, aut.tok),
    r => r.status === 400 && r.data.field === 'due_date');
  await checkAsync('S15b F8: 29-02 de un año bisiesto (2028) sí vale',
    post('/api/ledger', { entries: [{ type: 'expense', party_name: 'Bisiesto', invoice_number: 'D-3', invoice_date: '2028-02-29', base: 1, total: 1 }] }, aut.tok),
    r => r.status === 201);
  await checkAsync('S15b F8: PATCH a 2026-02-30 → 400',
    patch(`/api/ledger/${retId}`, { invoice_date: '2026-02-30' }, aut.tok),
    r => r.status === 400 && r.data.field === 'invoice_date');

  // ── L4: los apuntes de facturas electrónicas no se marcan como leídos por IA ──
  await checkAsync('S15b L4: source "einvoice" se guarda tal cual (no "ai" ni "manual")',
    post('/api/ledger', { entries: [{ type: 'expense', party_name: 'XML SL', invoice_number: 'X-1', invoice_date: '2026-09-10', base: 50, vat_amount: 10.5, total: 60.5, source: 'einvoice' }] }, aut.tok),
    r => r.status === 201 && getDB().prepare('SELECT source FROM ledger_entries WHERE id = ?').get(r.data.ids[0])?.source === 'einvoice');

  check('S15b L4: migración de una BD vieja (CHECK manual/ai) conserva filas, columnas e índices y admite einvoice; 2.ª pasada no-op', () => {
    const Database = require('better-sqlite3');
    const { allowEinvoiceSource } = require('../db/schema4');
    const db = new Database(':memory:');
    db.exec(`CREATE TABLE licenses (id INTEGER PRIMARY KEY);
      CREATE TABLE IF NOT EXISTS ledger_entries (id INTEGER PRIMARY KEY AUTOINCREMENT, license_id INTEGER NOT NULL REFERENCES licenses(id) ON DELETE CASCADE,
        invoice_date TEXT NOT NULL, source TEXT NOT NULL DEFAULT 'manual' CHECK(source IN ('manual','ai')), total REAL NOT NULL DEFAULT 0);
      CREATE INDEX IF NOT EXISTS idx_ledger_license_date ON ledger_entries(license_id, invoice_date);
      ALTER TABLE ledger_entries ADD COLUMN party_email TEXT NOT NULL DEFAULT '';
      ALTER TABLE ledger_entries ADD COLUMN invoice_id INTEGER DEFAULT NULL;
      INSERT INTO licenses (id) VALUES (1);
      INSERT INTO ledger_entries (license_id, invoice_date, source, total, party_email, invoice_id) VALUES (1, '2026-01-02', 'ai', 12.5, 'a@b.es', 7);`);
    db.pragma('foreign_keys = ON');
    let before = false;
    try { db.prepare("INSERT INTO ledger_entries (license_id, invoice_date, source) VALUES (1, '2026-01-03', 'einvoice')").run(); } catch { before = true; }
    allowEinvoiceSource(db);
    const sql1 = db.prepare("SELECT sql FROM sqlite_master WHERE name = 'ledger_entries'").get().sql;
    allowEinvoiceSource(db);
    const sql2 = db.prepare("SELECT sql FROM sqlite_master WHERE name = 'ledger_entries'").get().sql;
    db.prepare("INSERT INTO ledger_entries (license_id, invoice_date, source) VALUES (1, '2026-01-03', 'einvoice')").run();
    const old = db.prepare('SELECT * FROM ledger_entries WHERE id = 1').get();
    const idx = db.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'idx_ledger_license_date'").get();
    let badSource = false;
    try { db.prepare("INSERT INTO ledger_entries (license_id, invoice_date, source) VALUES (1, '2026-01-04', 'otra')").run(); } catch { badSource = true; }
    const fkOn = db.pragma('foreign_keys', { simple: true }) === 1;
    db.close();
    return before && sql1 === sql2 && old.source === 'ai' && old.total === 12.5 && old.party_email === 'a@b.es' && old.invoice_id === 7 && !!idx && badSource && fkOn;
  });

  // ── F7: importes con formato local (email de reclamación) ──
  check('S15b F7: formatEur → 8.470,00 € (es) y €8,470.00 (en), sin «8470.00»', () =>
    U.formatEur(8470, 'es') === '8.470,00 €' && U.formatEur(8470, 'en') === '€8,470.00' && U.formatEur(2286.9, 'de') === '2.286,90 €');
  {
    const saved = { fetch: global.fetch, GK: process.env.GEMINI_API_KEY };
    process.env.GEMINI_API_KEY = 'fake-key-for-test';
    let sent = '';
    global.fetch = async (_url, opts) => {
      try { sent = JSON.stringify(JSON.parse(opts.body).contents); } catch { sent = ''; }
      return { ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: 'ASUNTO: Factura G-1\n\nHola.' }] } }] }), text: async () => '' };
    };
    let gid = null;
    await post('/api/ledger', { entries: [{ type: 'income', party_name: 'Gamma SL', invoice_number: 'G-1', invoice_date: '2026-08-01', base: 7000, vat_amount: 1470, total: 8470 }] }, aut.tok)
      .then(r => { gid = r.data.ids?.[0]; });
    await checkAsync('S15b F7: el importe que se pasa a la IA va como «8.470,00 €» (es)',
      post('/api/finance/collection-email', { entry_id: gid, tone: 'friendly', lang: 'es' }, aut.tok),
      r => r.status === 200 && sent.includes('8.470,00 €') && !sent.includes('8470.00'));
    await checkAsync('S15b F7: en inglés va como «€8,470.00»',
      post('/api/finance/collection-email', { entry_id: gid, tone: 'friendly', lang: 'en' }, aut.tok),
      r => r.status === 200 && sent.includes('€8,470.00'));
    global.fetch = saved.fetch;
    if (saved.GK === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = saved.GK;
  }

  // ── F10: avisos por email desactivados por defecto en cuentas nuevas ──
  {
    const nueva = await account('cifras-nueva@nokfi.local');
    await checkAsync('S15b F10: «Omitir» el onboarding deja el resumen mensual y los avisos desactivados',
      put('/api/profile', { onboardingCompleted: true }, nueva.tok),
      r => r.status === 200 && r.data.profile.monthlySummary === false && r.data.profile.fiscalReminders === false);
    check('S15b F10: en la BD queda monthly_summary = 0', () =>
      getDB().prepare('SELECT monthly_summary FROM company_profiles WHERE license_id = ?').get(nueva.lid)?.monthly_summary === 0);
  }
};
