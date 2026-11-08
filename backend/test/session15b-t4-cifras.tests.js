/**
 * Tests e2e de la T4 de la sesión 15b, lote 11 (cifras, libro y facturas). Se
 * ejecutan desde test/e2e.test.js con sus mismos helpers (misma BD temporal y server).
 *   T5  migración de retenciones negativas antiguas (BD vieja simulada)
 *   PATCH /api/ledger/:id con paid:true y paid_at:null no borra la fecha de cobro
 *   GET /api/ledger devuelve has_any (periodo vacío ≠ libro vacío)
 *   /tax/vat sin el 5 %
 *   reclamación automática: el primer aviso siempre es el amable
 */

'use strict';

const fs = require('fs');
const path = require('path');

module.exports = async function session15bT4CifrasTests({ post, put, get, call, check, checkAsync, getDB }) {
  const patch = (p, body, auth) => call('PATCH', p, { body, auth });

  async function account(email) {
    const lic = await post('/api/admin/licenses', { email, plan: 'pro', password: 'CifrasT4!2026' }, 'admin');
    const login = await post('/api/auth/login', { email, license_key: lic.data.key, password: 'CifrasT4!2026' });
    return { tok: login.data.token, lid: lic.data.id };
  }

  // ── T5: retenciones negativas antiguas → positivas, solo las que cumplen la condición ──
  check('S15b T4 T5: la migración pasa a positivo la retención negativa de un apunte a mano y lo deja «para revisar»; abonos y facturas emitidas no se tocan; 2.ª pasada no-op', () => {
    const Database = require('better-sqlite3');
    const { fixNegativeWithholdings } = require('../db/schema4');
    const db = new Database(':memory:');
    db.exec(`CREATE TABLE ledger_entries (id INTEGER PRIMARY KEY AUTOINCREMENT, license_id INTEGER NOT NULL, invoice_date TEXT NOT NULL,
        base REAL NOT NULL DEFAULT 0, vat_amount REAL NOT NULL DEFAULT 0, irpf_rate REAL NOT NULL DEFAULT 0, irpf_amount REAL NOT NULL DEFAULT 0,
        total REAL NOT NULL DEFAULT 0, needs_review INTEGER NOT NULL DEFAULT 0, invoice_id INTEGER DEFAULT NULL);
      INSERT INTO ledger_entries (license_id, invoice_date, base, vat_amount, irpf_rate, irpf_amount, total) VALUES (1, '2026-10-05', 100, 21, -15, -15, 136);
      INSERT INTO ledger_entries (license_id, invoice_date, base, vat_amount, irpf_rate, irpf_amount, total) VALUES (1, '2026-10-06', 200, 42, 15, -30, 212);
      INSERT INTO ledger_entries (license_id, invoice_date, base, vat_amount, irpf_rate, irpf_amount, total) VALUES (1, '2026-10-07', -100, -21, 15, -15, -106);
      INSERT INTO ledger_entries (license_id, invoice_date, base, vat_amount, irpf_rate, irpf_amount, total, invoice_id) VALUES (1, '2026-10-08', 100, 21, -15, -15, 106, 9);
      INSERT INTO ledger_entries (license_id, invoice_date, base, vat_amount, irpf_rate, irpf_amount, total) VALUES (1, '2026-10-09', 100, 21, 15, 15, 106);`);
    const n1 = fixNegativeWithholdings(db);
    const n2 = fixNegativeWithholdings(db);
    const r = (id) => db.prepare('SELECT irpf_rate, irpf_amount, needs_review FROM ledger_entries WHERE id = ?').get(id);
    const ok = n1 === 2 && n2 === 0
      && r(1).irpf_amount === 15 && r(1).irpf_rate === 15 && r(1).needs_review === 1   // 100 + 21 − 15 ≠ 136
      && r(2).irpf_amount === 30 && r(2).irpf_rate === 15 && r(2).needs_review === 0   // 200 + 42 − 30 = 212
      && r(3).irpf_amount === -15                                                       // abono: se queda
      && r(4).irpf_amount === -15                                                       // factura emitida en Nokfi: se queda
      && r(5).irpf_amount === 15 && r(5).needs_review === 0;
    db.close();
    return ok;
  });
  check('S15b T4 T5: la migración corre al arrancar (después del esquema de facturación)', () => {
    const src = fs.readFileSync(path.join(__dirname, '../db/database.js'), 'utf8');
    const iInv = src.indexOf("require('./invoicing').runInvoicingSchema(db)");
    const iFix = src.indexOf("require('./schema4').fixNegativeWithholdings(db)");
    return iInv > 0 && iFix > iInv;
  });
  check('S15b T4 T5: una BD sin ledger_entries.invoice_id no falla (no-op)', () => {
    const Database = require('better-sqlite3');
    const db = new Database(':memory:');
    db.exec('CREATE TABLE ledger_entries (id INTEGER PRIMARY KEY, irpf_amount REAL)');
    const n = require('../db/schema4').fixNegativeWithholdings(db);
    db.close();
    return n === 0;
  });

  const a = await account('t4-cifras@nokfi.local');

  // ── PATCH con paid_at vacío sobre un apunte cobrado ──
  const created = await post('/api/ledger', { entries: [{ type: 'income', party_name: 'Cliente T4 SL', invoice_number: 'T4-1', invoice_date: '2026-03-02',
    base: 100, vat_rate: 21, vat_amount: 21, total: 121, paid: true, paid_at: '2026-03-20' }] }, a.tok);
  const id = created.data.ids?.[0];
  await checkAsync('S15b T4: PATCH paid:true + paid_at:null sobre un apunte cobrado conserva la fecha de cobro',
    patch(`/api/ledger/${id}`, { paid: true, paid_at: null }, a.tok),
    r => r.status === 200 && r.data.entry.paid === true && r.data.entry.paid_at === '2026-03-20');
  await checkAsync('S15b T4: PATCH solo con paid_at:null tampoco la borra',
    patch(`/api/ledger/${id}`, { paid_at: null }, a.tok),
    r => r.status === 200 && r.data.entry.paid_at === '2026-03-20');
  await checkAsync('S15b T4: PATCH paid:false sigue quitando la fecha',
    patch(`/api/ledger/${id}`, { paid: false }, a.tok),
    r => r.status === 200 && r.data.entry.paid === false && r.data.entry.paid_at === null);
  await checkAsync('S15b T4: volver a marcarlo cobrado con fecha la guarda',
    patch(`/api/ledger/${id}`, { paid: true, paid_at: '2026-03-25' }, a.tok),
    r => r.status === 200 && r.data.entry.paid_at === '2026-03-25');

  // ── has_any: periodo vacío ≠ libro vacío ──
  await checkAsync('S15b T4: GET /api/ledger de un periodo sin apuntes → entries [] y has_any true',
    get('/api/ledger?from=2025-01-01&to=2025-03-31', a.tok),
    r => r.status === 200 && r.data.entries.length === 0 && r.data.has_any === true);
  await checkAsync('S15b T4: GET /api/ledger del periodo con apuntes → has_any true',
    get('/api/ledger?from=2026-01-01&to=2026-03-31', a.tok),
    r => r.status === 200 && r.data.entries.length === 1 && r.data.has_any === true);
  const empty = await account('t4-cifras-vacio@nokfi.local');
  await checkAsync('S15b T4: libro vacío de verdad → has_any false',
    get('/api/ledger?from=2026-01-01&to=2026-03-31', empty.tok),
    r => r.status === 200 && r.data.entries.length === 0 && r.data.has_any === false);

  // ── IVA del 5 % fuera de la API ──
  const T = require('../services/taxTools');
  check('S15b T4: /tax/vat rechaza el 5 % (ya no se aplica) y acepta 0/4/10/21', () =>
    T.vat({ amount: 100, rate: 5 }).status === 400 && [0, 4, 10, 21].every(rate => T.vat({ amount: 100, rate }).status === 200)
    && !T.VAT_RATES.includes(5) && T.SURCHARGE[5] === undefined);
  check('S15b T4: /tax/withholding tampoco acepta vat_rate 5', () => T.withholding({ base: 100, vat_rate: 5 }).status === 400);
  check('S15b T4: el OpenAPI de /tax/vat no anuncia el 5 % ni su recargo', () => {
    const spec = JSON.stringify(require('../config/openapi'));
    return !spec.includes('"enum":[0,4,5,10,21]') && spec.includes('"enum":[0,4,10,21]') && !spec.includes('0,62');
  });

  // ── Reclamación automática: el primer aviso siempre es el amable ──
  const C = require('../services/collections');
  const e40 = { invoice_date: '2026-01-01', due_date: '2026-01-31' };
  check('S15b T4: sin avisos previos, una factura vencida hace 40 días recibe el amable (1), no el firme', () =>
    C.stageFor(e40, '2026-03-12') === 2 && C.nextStage(e40, '2026-03-12', 0, null) === 1);
  check('S15b T4: después se sube de uno en uno y con 14 días entre avisos', () =>
    C.nextStage(e40, '2026-03-20', 1, '2026-03-12') === 0 && C.nextStage(e40, '2026-03-26', 1, '2026-03-12') === 2
    && C.nextStage(e40, '2026-04-09', 2, '2026-03-26') === 3 && C.nextStage(e40, '2026-04-09', 3, '2026-03-26') === 0);
  check('S15b T4: lo normal (7 → 30 → 60 días) no cambia', () => {
    const e = { invoice_date: '2026-01-01', due_date: '2026-01-31' };
    return C.nextStage(e, '2026-02-05', 0) === 0 && C.nextStage(e, '2026-02-08', 0) === 1 && C.nextStage(e, '2026-03-03', 1, '2026-02-08') === 2
      && C.nextStage(e, '2026-04-02', 2, '2026-03-03') === 3;
  });
  {
    const savedResend = process.env.RESEND_API_KEY;
    delete process.env.RESEND_API_KEY;
    const c = await account('t4-cobros@nokfi.local');
    await put('/api/profile', { autoCollections: true }, c.tok);
    const r = await post('/api/ledger', { entries: [{ type: 'income', party_name: 'Cliente Lento SL', party_email: 'pagos@lento.test', invoice_number: 'L-1',
      invoice_date: '2026-01-01', due_date: '2026-01-31', base: 1000, vat_rate: 21, vat_amount: 210, total: 1210 }] }, c.tok);
    const eid = r.data.ids?.[0];
    const stages = () => getDB().prepare("SELECT lead_days FROM reminders_sent WHERE license_id = ? AND deadline_key = ? ORDER BY lead_days").all(c.lid, `collect-${eid}`).map(x => x.lead_days).join(',');
    await C.runAutoCollections(new Date('2026-03-12T09:00:00Z')); // 40 días vencida
    const s1 = stages();
    await C.runAutoCollections(new Date('2026-03-13T09:00:00Z'));
    const s1b = stages();
    await C.runAutoCollections(new Date('2026-03-26T09:00:00Z')); // +14 días
    const s2 = stages();
    check('S15b T4: al activar la reclamación con una factura muy vencida, el primer email es el amable y el firme llega 14 días después', () =>
      s1 === '1' && s1b === '1' && s2 === '1,2');
    await put('/api/profile', { autoCollections: false }, c.tok);
    if (savedResend !== undefined) process.env.RESEND_API_KEY = savedResend;
  }
};
