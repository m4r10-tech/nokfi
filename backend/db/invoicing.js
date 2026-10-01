/**
 * db/invoicing.js — sesión 11 (tanda 2): emisión de facturas.
 *
 * Tablas (idempotentes, se crean en initDB):
 *   billing_profiles  datos del emisor para facturar (dirección, IBAN, pie…)
 *   customers         libreta de clientes
 *   invoice_series    último número por serie y año (numeración sin huecos)
 *   invoices          facturas emitidas, con la foto del emisor y del cliente
 *                     tal como estaban al emitir (una factura no cambia nunca)
 *   invoice_lines     líneas
 *   invoice_events    registro de eventos (emitida, anulada, rectificada, enviada…)
 *   verifactu_records (db/verifactu.js) registro VERI*FACTU de alta/anulación,
 *                     creado en la misma transacción que emite o anula
 *   ledger_entries.invoice_id  el apunte del libro que generó la factura
 *
 * Una factura emitida NO se edita ni se borra: se rectifica o se anula.
 */

'use strict';

const { getDB, audit } = require('./database');
const { ensureColumn } = require('./schema4');
const M = require('../services/invoicing/model');
const V = require('./verifactu');

function runInvoicingSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS billing_profiles (
      license_id         INTEGER PRIMARY KEY REFERENCES licenses(id) ON DELETE CASCADE,
      legal_name         TEXT    NOT NULL DEFAULT '',
      tax_id             TEXT    NOT NULL DEFAULT '',
      address            TEXT    NOT NULL DEFAULT '',
      postal_code        TEXT    NOT NULL DEFAULT '',
      city               TEXT    NOT NULL DEFAULT '',
      province           TEXT    NOT NULL DEFAULT '',
      country            TEXT    NOT NULL DEFAULT 'ES',
      email              TEXT    NOT NULL DEFAULT '',
      phone              TEXT    NOT NULL DEFAULT '',
      iban               TEXT    NOT NULL DEFAULT '',
      payment_terms_days INTEGER NOT NULL DEFAULT 30,
      default_vat_rate   REAL    NOT NULL DEFAULT 21,
      default_irpf_rate  REAL    NOT NULL DEFAULT 0,
      footer             TEXT    NOT NULL DEFAULT '',
      invoice_lang       TEXT    NOT NULL DEFAULT 'es',
      updated_at         TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS customers (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      license_id   INTEGER NOT NULL REFERENCES licenses(id) ON DELETE CASCADE,
      name         TEXT    NOT NULL,
      tax_id       TEXT    NOT NULL DEFAULT '',
      email        TEXT    NOT NULL DEFAULT '',
      address      TEXT    NOT NULL DEFAULT '',
      postal_code  TEXT    NOT NULL DEFAULT '',
      city         TEXT    NOT NULL DEFAULT '',
      province     TEXT    NOT NULL DEFAULT '',
      country      TEXT    NOT NULL DEFAULT 'ES',
      equivalence_surcharge INTEGER NOT NULL DEFAULT 0,
      created_at   TEXT    NOT NULL DEFAULT (datetime('now')),
      updated_at   TEXT    NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_customers_license ON customers(license_id, name);

    CREATE TABLE IF NOT EXISTS invoice_series (
      license_id   INTEGER NOT NULL REFERENCES licenses(id) ON DELETE CASCADE,
      code         TEXT    NOT NULL,
      year         INTEGER NOT NULL,
      last_number  INTEGER NOT NULL DEFAULT 0,
      last_date    TEXT    DEFAULT NULL,
      PRIMARY KEY (license_id, code, year)
    );

    CREATE TABLE IF NOT EXISTS invoices (
      id                   INTEGER PRIMARY KEY AUTOINCREMENT,
      license_id           INTEGER NOT NULL REFERENCES licenses(id) ON DELETE CASCADE,
      series               TEXT    NOT NULL,
      year                 INTEGER NOT NULL,
      seq                  INTEGER NOT NULL,
      number               TEXT    NOT NULL,
      kind                 TEXT    NOT NULL CHECK(kind IN ('F1','F2','R1','R2','R3','R4','R5')),
      status               TEXT    NOT NULL DEFAULT 'issued' CHECK(status IN ('issued','cancelled')),
      issue_date           TEXT    NOT NULL,
      operation_date       TEXT    DEFAULT NULL,
      due_date             TEXT    DEFAULT NULL,
      currency             TEXT    NOT NULL DEFAULT 'EUR',
      lang                 TEXT    NOT NULL DEFAULT 'es',
      issuer_json          TEXT    NOT NULL,
      customer_id          INTEGER REFERENCES customers(id) ON DELETE SET NULL,
      customer_json        TEXT    DEFAULT NULL,
      base                 REAL    NOT NULL,
      vat_amount           REAL    NOT NULL,
      re_amount            REAL    NOT NULL DEFAULT 0,
      irpf_rate            REAL    NOT NULL DEFAULT 0,
      irpf_amount          REAL    NOT NULL DEFAULT 0,
      total                REAL    NOT NULL,
      taxes_json           TEXT    NOT NULL DEFAULT '[]',
      equivalence_surcharge INTEGER NOT NULL DEFAULT 0,
      exemption            TEXT    DEFAULT NULL,
      payment_method       TEXT    NOT NULL DEFAULT 'transfer',
      iban                 TEXT    NOT NULL DEFAULT '',
      notes                TEXT    NOT NULL DEFAULT '',
      rectifies_id         INTEGER REFERENCES invoices(id),
      rectification_reason TEXT    NOT NULL DEFAULT '',
      ledger_entry_id      INTEGER DEFAULT NULL,
      livemode             INTEGER NOT NULL DEFAULT 1,
      source               TEXT    NOT NULL DEFAULT 'web',
      cancelled_at         TEXT    DEFAULT NULL,
      cancel_reason        TEXT    NOT NULL DEFAULT '',
      created_at           TEXT    NOT NULL DEFAULT (datetime('now')),
      UNIQUE (license_id, number)
    );
    CREATE INDEX IF NOT EXISTS idx_invoices_license_date ON invoices(license_id, issue_date);
    CREATE INDEX IF NOT EXISTS idx_invoices_rectifies ON invoices(rectifies_id);

    CREATE TABLE IF NOT EXISTS invoice_lines (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      invoice_id   INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
      position     INTEGER NOT NULL,
      description  TEXT    NOT NULL,
      quantity     REAL    NOT NULL,
      unit         TEXT    NOT NULL DEFAULT '',
      unit_price   REAL    NOT NULL,
      discount_pct REAL    NOT NULL DEFAULT 0,
      vat_rate     REAL    NOT NULL,
      re_rate      REAL    NOT NULL DEFAULT 0,
      amount       REAL    NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_invoice_lines_invoice ON invoice_lines(invoice_id, position);

    CREATE TABLE IF NOT EXISTS invoice_events (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      license_id  INTEGER NOT NULL REFERENCES licenses(id) ON DELETE CASCADE,
      invoice_id  INTEGER REFERENCES invoices(id) ON DELETE CASCADE,
      type        TEXT    NOT NULL,
      detail      TEXT    NOT NULL DEFAULT '',
      created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_invoice_events_invoice ON invoice_events(invoice_id, id);
  `);
  ensureColumn(db, 'ledger_entries', 'invoice_id', 'INTEGER DEFAULT NULL');
  // Tanda 3: estado de la factura para el cliente (RD 238/2026: aceptada por
  // defecto; se comunican el rechazo y el pago).
  ensureColumn(db, 'invoices', 'customer_status', "TEXT NOT NULL DEFAULT 'accepted'");
  ensureColumn(db, 'invoices', 'customer_status_reason', "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, 'invoices', 'customer_status_at', 'TEXT DEFAULT NULL');
}

/* ── Datos del emisor ── */
const BILLING_FIELDS = ['legal_name', 'tax_id', 'address', 'postal_code', 'city', 'province', 'country', 'email', 'phone', 'iban',
  'payment_terms_days', 'default_vat_rate', 'default_irpf_rate', 'footer', 'invoice_lang'];

/** Perfil de facturación; si no existe, se rellena con el perfil de empresa. */
function getBillingProfile(license_id) {
  const row = getDB().prepare('SELECT * FROM billing_profiles WHERE license_id = ?').get(license_id);
  if (row) return row;
  const company = getDB().prepare('SELECT company_name, tax_id, lang FROM company_profiles WHERE license_id = ?').get(license_id) || {};
  return {
    license_id, legal_name: company.company_name || '', tax_id: company.tax_id || '', address: '', postal_code: '', city: '', province: '',
    country: 'ES', email: '', phone: '', iban: '', payment_terms_days: 30, default_vat_rate: 21, default_irpf_rate: 0, footer: '',
    invoice_lang: company.lang || 'es', updated_at: null
  };
}

/** Valida y guarda (merge parcial). Devuelve { profile } o { error, field }. */
function saveBillingProfile(license_id, raw) {
  const cur = getBillingProfile(license_id);
  const next = { ...cur };
  const has = (k) => raw[k] !== undefined;
  const party = M.normalizeParty({ ...cur, ...raw, name: has('legal_name') ? raw.legal_name : cur.legal_name });
  for (const k of ['address', 'postal_code', 'city', 'province', 'country']) if (has(k)) next[k] = party[k];
  if (has('legal_name')) next.legal_name = party.name;
  if (has('tax_id')) next.tax_id = party.tax_id;
  if (has('email')) next.email = party.email;
  if (has('phone')) next.phone = String(raw.phone || '').replace(/[^\d+ ()-]/g, '').slice(0, 30);
  if (has('iban')) {
    const iban = String(raw.iban || '').toUpperCase().replace(/\s+/g, '');
    if (iban && !M.validIban(iban)) return { error: 'invalid_input', field: 'iban' };
    next.iban = iban;
  }
  if (has('payment_terms_days')) {
    const d = Number(raw.payment_terms_days);
    if (!Number.isInteger(d) || d < 0 || d > 120) return { error: 'invalid_input', field: 'payment_terms_days' };
    next.payment_terms_days = d;
  }
  if (has('default_vat_rate')) {
    if (!M.VAT_RATES.includes(Number(raw.default_vat_rate))) return { error: 'invalid_input', field: 'default_vat_rate' };
    next.default_vat_rate = Number(raw.default_vat_rate);
  }
  if (has('default_irpf_rate')) {
    if (!M.IRPF_RATES.includes(Number(raw.default_irpf_rate))) return { error: 'invalid_input', field: 'default_irpf_rate' };
    next.default_irpf_rate = Number(raw.default_irpf_rate);
  }
  if (has('footer')) next.footer = String(raw.footer || '').replace(/[\u0000-\u0009\u000B-\u001F]/g, '').slice(0, 500).trim();
  if (has('invoice_lang') && ['es', 'en', 'fr', 'it', 'de', 'pl'].includes(raw.invoice_lang)) next.invoice_lang = raw.invoice_lang;
  const cols = BILLING_FIELDS;
  getDB().prepare(`INSERT INTO billing_profiles (license_id, ${cols.join(', ')}, updated_at) VALUES (?, ${cols.map(() => '?').join(', ')}, datetime('now'))
    ON CONFLICT(license_id) DO UPDATE SET ${cols.map(c => `${c} = excluded.${c}`).join(', ')}, updated_at = datetime('now')`)
    .run(license_id, ...cols.map(c => next[c]));
  return { profile: getBillingProfile(license_id) };
}

/** El emisor tal como sale en la factura. */
function issuerFromProfile(p) {
  return { ...M.normalizeParty({ ...p, name: p.legal_name }), phone: p.phone || '' };
}

/* ── Clientes ── */
const CUSTOMER_COLS = ['name', 'tax_id', 'email', 'address', 'postal_code', 'city', 'province', 'country', 'equivalence_surcharge'];

function listCustomers(license_id, q = '') {
  const like = `%${String(q).toLowerCase().slice(0, 60)}%`;
  return getDB().prepare(`SELECT * FROM customers WHERE license_id = ? AND (lower(name) LIKE ? OR lower(tax_id) LIKE ?) ORDER BY name COLLATE NOCASE LIMIT 500`)
    .all(license_id, like, like).map(c => ({ ...c, equivalence_surcharge: !!c.equivalence_surcharge }));
}

function getCustomer(license_id, id) {
  const c = getDB().prepare('SELECT * FROM customers WHERE id = ? AND license_id = ?').get(id, license_id);
  return c ? { ...c, equivalence_surcharge: !!c.equivalence_surcharge } : null;
}

function customerData(raw) {
  const p = M.normalizeParty(raw);
  if (!p.name) return { error: 'customer_name' };
  if (p.tax_id && p.country === 'ES' && !require('../services/invoiceChecks').validSpanishTaxId(p.tax_id)) return { error: 'customer_tax_id' };
  if (p.postal_code && p.country === 'ES' && !/^\d{5}$/.test(p.postal_code)) return { error: 'customer_postal_code' };
  return { data: { ...p, equivalence_surcharge: raw.equivalence_surcharge ? 1 : 0 } };
}

function createCustomer(license_id, raw) {
  const { data, error } = customerData(raw || {});
  if (error) return { error };
  const info = getDB().prepare(`INSERT INTO customers (license_id, ${CUSTOMER_COLS.join(', ')}) VALUES (?, ${CUSTOMER_COLS.map(() => '?').join(', ')})`)
    .run(license_id, ...CUSTOMER_COLS.map(c => data[c]));
  return { customer: getCustomer(license_id, Number(info.lastInsertRowid)) };
}

function updateCustomer(license_id, id, raw) {
  const cur = getCustomer(license_id, id);
  if (!cur) return null;
  const { data, error } = customerData({ ...cur, ...raw });
  if (error) return { error };
  getDB().prepare(`UPDATE customers SET ${CUSTOMER_COLS.map(c => `${c} = ?`).join(', ')}, updated_at = datetime('now') WHERE id = ? AND license_id = ?`)
    .run(...CUSTOMER_COLS.map(c => data[c]), id, license_id);
  return { customer: getCustomer(license_id, id) };
}

function deleteCustomer(license_id, id) {
  // Las facturas guardan su propia copia del cliente: borrarlo no las toca.
  return getDB().prepare('DELETE FROM customers WHERE id = ? AND license_id = ?').run(id, license_id).changes > 0;
}

/* ── Facturas ── */
const parse = (s, dflt) => { try { return s ? JSON.parse(s) : dflt; } catch { return dflt; } };

function rowToInvoice(r, { lines = true } = {}) {
  if (!r) return null;
  const db = getDB();
  const out = {
    id: r.id, number: r.number, series: r.series, kind: r.kind, status: r.status,
    issue_date: r.issue_date, operation_date: r.operation_date, due_date: r.due_date, currency: r.currency, lang: r.lang,
    issuer: parse(r.issuer_json, {}), customer_id: r.customer_id, customer: parse(r.customer_json, null),
    base: r.base, vat_amount: r.vat_amount, re_amount: r.re_amount, irpf_rate: r.irpf_rate, irpf_amount: r.irpf_amount, total: r.total,
    taxes: parse(r.taxes_json, []), equivalence_surcharge: !!r.equivalence_surcharge, exemption: r.exemption,
    payment_method: r.payment_method, iban: r.iban, notes: r.notes,
    rectifies_id: r.rectifies_id, rectification_reason: r.rectification_reason,
    ledger_entry_id: r.ledger_entry_id, livemode: !!r.livemode, source: r.source,
    cancelled_at: r.cancelled_at, cancel_reason: r.cancel_reason, created_at: r.created_at,
    customer_status: r.customer_status || 'accepted', customer_status_reason: r.customer_status_reason || '', customer_status_at: r.customer_status_at || null
  };
  const entry = r.ledger_entry_id ? db.prepare('SELECT paid, paid_at FROM ledger_entries WHERE id = ?').get(r.ledger_entry_id) : null;
  out.paid = !!entry?.paid;
  out.paid_at = entry?.paid_at || null;
  if (r.rectifies_id) {
    const o = db.prepare('SELECT number, issue_date FROM invoices WHERE id = ?').get(r.rectifies_id);
    out.rectifies_number = o?.number || null;
    out.rectifies_date = o?.issue_date || null;
  }
  out.rectified_by = db.prepare("SELECT id, number FROM invoices WHERE rectifies_id = ? AND status = 'issued' ORDER BY id").all(r.id);
  if (lines) out.lines = db.prepare('SELECT position, description, quantity, unit, unit_price, discount_pct, vat_rate, re_rate, amount FROM invoice_lines WHERE invoice_id = ? ORDER BY position').all(r.id);
  return out;
}

function getInvoice(license_id, id) {
  return rowToInvoice(getDB().prepare('SELECT * FROM invoices WHERE id = ? AND license_id = ?').get(id, license_id));
}

function listInvoices(license_id, { from, to, status, q, limit = 500 } = {}) {
  const where = ['license_id = ?'];
  const args = [license_id];
  const ISO = /^\d{4}-\d{2}-\d{2}$/;
  if (from && ISO.test(from)) { where.push('issue_date >= ?'); args.push(from); }
  if (to && ISO.test(to)) { where.push('issue_date <= ?'); args.push(to); }
  if (status === 'issued' || status === 'cancelled') { where.push('status = ?'); args.push(status); }
  if (q) { where.push("(lower(number) LIKE ? OR lower(coalesce(json_extract(customer_json, '$.name'), '')) LIKE ? OR lower(coalesce(json_extract(customer_json, '$.tax_id'), '')) LIKE ?)"); const l = `%${String(q).toLowerCase().slice(0, 60)}%`; args.push(l, l, l); }
  const n = Math.min(Math.max(Number(limit) || 500, 1), 1000);
  return getDB().prepare(`SELECT * FROM invoices WHERE ${where.join(' AND ')} ORDER BY issue_date DESC, id DESC LIMIT ${n}`)
    .all(...args).map(r => rowToInvoice(r, { lines: false }));
}

function listEvents(license_id, invoice_id) {
  return getDB().prepare('SELECT type, detail, created_at FROM invoice_events WHERE license_id = ? AND invoice_id = ? ORDER BY id').all(license_id, invoice_id);
}

function addEvent(license_id, invoice_id, type, detail = '') {
  getDB().prepare('INSERT INTO invoice_events (license_id, invoice_id, type, detail) VALUES (?, ?, ?, ?)').run(license_id, invoice_id, type, String(detail).slice(0, 500));
}

/** Categoría del libro y tipo de IVA "principal" (el de más base) para el apunte. */
function ledgerFields(inv) {
  const main = inv.taxes.slice().sort((a, b) => Math.abs(b.base) - Math.abs(a.base))[0] || { vat_rate: 0 };
  const rectification = inv.kind.startsWith('R');
  return {
    type: 'income',
    party_name: inv.customer?.name || '',
    party_nif: inv.customer?.tax_id || '',
    party_email: inv.customer?.email || '',
    invoice_number: inv.number,
    invoice_date: inv.issue_date,
    due_date: inv.due_date,
    concept: inv.lines.map(l => l.description).slice(0, 3).join('; ').slice(0, 200),
    category: 'Ventas',
    base: inv.base,
    vat_rate: main.vat_rate,
    // El recargo de equivalencia también es cuota repercutida (va al 303).
    vat_amount: M.r2(inv.vat_amount + inv.re_amount),
    irpf_rate: inv.irpf_rate,
    irpf_amount: inv.irpf_amount,
    total: inv.total,
    // Rectificativas: no son un cobro pendiente (se compensan con la original).
    paid: rectification ? 1 : 0,
    paid_at: rectification ? inv.issue_date : null,
    source: 'manual',
    file_name: '',
    needs_review: 0
  };
}

/**
 * Emite una factura ya validada (M.buildInvoice) en UNA transacción:
 * número correlativo sin huecos, líneas, apunte en el libro y evento.
 * Devuelve { invoice } o { error }.
 */
function issueInvoice(license_id, inv, { customer_id = null, source = 'web', livemode = true, ip = null } = {}) {
  const db = getDB();
  const year = Number(inv.issue_date.slice(0, 4));
  let id;
  try {
    db.transaction(() => {
      const s = db.prepare('SELECT last_number, last_date FROM invoice_series WHERE license_id = ? AND code = ? AND year = ?').get(license_id, inv.series, year);
      // Orden cronológico dentro de la serie: no se puede emitir con fecha anterior a la última.
      if (s?.last_date && inv.issue_date < s.last_date) { const e = new Error('date_before_last'); e.code = 'date_before_last'; e.last_date = s.last_date; throw e; }
      const seq = (s?.last_number || 0) + 1;
      db.prepare(`INSERT INTO invoice_series (license_id, code, year, last_number, last_date) VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(license_id, code, year) DO UPDATE SET last_number = excluded.last_number, last_date = excluded.last_date`)
        .run(license_id, inv.series, year, seq, inv.issue_date);
      inv.number = M.formatNumber(inv.series, year, seq);
      const info = db.prepare(`INSERT INTO invoices (license_id, series, year, seq, number, kind, issue_date, operation_date, due_date, currency, lang,
          issuer_json, customer_id, customer_json, base, vat_amount, re_amount, irpf_rate, irpf_amount, total, taxes_json, equivalence_surcharge,
          exemption, payment_method, iban, notes, rectifies_id, rectification_reason, livemode, source)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(license_id, inv.series, year, seq, inv.number, inv.kind, inv.issue_date, inv.operation_date, inv.due_date, inv.currency, inv.lang,
          JSON.stringify(inv.issuer), customer_id, inv.customer ? JSON.stringify(inv.customer) : null, inv.base, inv.vat_amount, inv.re_amount,
          inv.irpf_rate, inv.irpf_amount, inv.total, JSON.stringify(inv.taxes), inv.equivalence_surcharge ? 1 : 0,
          inv.exemption, inv.payment_method, inv.iban, inv.notes, inv.rectifies_id, inv.rectification_reason, livemode ? 1 : 0, source);
      id = Number(info.lastInsertRowid);
      const line = db.prepare('INSERT INTO invoice_lines (invoice_id, position, description, quantity, unit, unit_price, discount_pct, vat_rate, re_rate, amount) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
      for (const l of inv.lines) line.run(id, l.position, l.description, l.quantity, l.unit, l.unit_price, l.discount_pct, l.vat_rate, l.re_rate, l.amount);
      if (livemode) {
        const e = ledgerFields(inv);
        const cols = Object.keys(e);
        const le = db.prepare(`INSERT INTO ledger_entries (license_id, invoice_id, ${cols.join(', ')}) VALUES (?, ?, ${cols.map(() => '?').join(', ')})`)
          .run(license_id, id, ...cols.map(c => e[c]));
        db.prepare('UPDATE invoices SET ledger_entry_id = ? WHERE id = ?').run(Number(le.lastInsertRowid), id);
      }
      // VERI*FACTU: registro de alta encadenado (solo facturas reales).
      if (livemode) V.createAlta(license_id, id, inv, { original: inv.rectifies_id ? getInvoice(license_id, inv.rectifies_id) : null });
      addEvent(license_id, id, 'issued', `${inv.kind} ${inv.number} total=${inv.total}`);
      if (inv.rectifies_id) addEvent(license_id, inv.rectifies_id, 'rectified', `por ${inv.number}`);
    })();
  } catch (e) {
    if (e.code === 'date_before_last') return { error: 'invalid_input', field: 'issue_date_before_last', last_date: e.last_date };
    throw e;
  }
  audit('INVOICE_ISSUED', { license_id, ip, detail: `id=${id} ${inv.number}` });
  return { invoice: getInvoice(license_id, id) };
}

/** Anula una factura emitida (no se borra: queda anulada y sale del libro). */
function cancelInvoice(license_id, id, reason = '', ip = null) {
  const db = getDB();
  const inv = getInvoice(license_id, id);
  if (!inv) return null;
  if (inv.status !== 'issued') return { error: 'already_cancelled' };
  if (inv.rectified_by.length) return { error: 'has_rectifications' };
  const why = String(reason || '').replace(/[\u0000-\u001F]/g, ' ').slice(0, 300).trim();
  db.transaction(() => {
    db.prepare("UPDATE invoices SET status = 'cancelled', cancelled_at = datetime('now'), cancel_reason = ? WHERE id = ? AND license_id = ?").run(why, id, license_id);
    if (inv.ledger_entry_id) {
      db.prepare('DELETE FROM ledger_entries WHERE id = ? AND license_id = ?').run(inv.ledger_entry_id, license_id);
      db.prepare('UPDATE invoices SET ledger_entry_id = NULL WHERE id = ?').run(id);
    }
    if (inv.livemode) V.createAnulacion(license_id, id, inv);
    addEvent(license_id, id, 'cancelled', why);
  })();
  audit('INVOICE_CANCELLED', { license_id, ip, detail: `id=${id} ${inv.number}` });
  return { invoice: getInvoice(license_id, id) };
}

/**
 * Estado de la factura para el cliente: 'rejected' (con motivo) o 'accepted'
 * (deshace el rechazo); 'paid' (con fecha) o 'unpaid' (deshace el pago).
 * Como en la SPFE, para cambiar un estado primero se revierte el anterior.
 */
function setCustomerStatus(license_id, id, { status, reason = '', date = null }, ip = null) {
  const db = getDB();
  const inv = getInvoice(license_id, id);
  if (!inv) return null;
  if (inv.status !== 'issued') return { error: 'invoice_cancelled' };
  const why = String(reason || '').replace(/[\u0000-\u001F]/g, ' ').slice(0, 300).trim();
  const ISO = /^\d{4}-\d{2}-\d{2}$/;
  const today = M.todayMadrid();
  if (status === 'rejected') {
    if (inv.customer_status === 'rejected') return { error: 'status_unchanged' };
    if (inv.paid) return { error: 'status_conflict' };
    if (!why) return { error: 'invalid_input', field: 'reason' };
    db.prepare("UPDATE invoices SET customer_status = 'rejected', customer_status_reason = ?, customer_status_at = datetime('now') WHERE id = ?").run(why, id);
    addEvent(license_id, id, 'rejected', why);
  } else if (status === 'accepted') {
    if (inv.customer_status !== 'rejected') return { error: 'status_unchanged' };
    db.prepare("UPDATE invoices SET customer_status = 'accepted', customer_status_reason = '', customer_status_at = datetime('now') WHERE id = ?").run(id);
    addEvent(license_id, id, 'accepted');
  } else if (status === 'paid' || status === 'unpaid') {
    if (!inv.ledger_entry_id) return { error: 'status_conflict' };
    if ((status === 'paid') === inv.paid) return { error: 'status_unchanged' };
    if (status === 'paid' && inv.customer_status === 'rejected') return { error: 'status_conflict' };
    const paidAt = status === 'paid' ? (date || today) : null;
    if (paidAt && (!ISO.test(paidAt) || paidAt > today || paidAt < inv.issue_date)) return { error: 'invalid_input', field: 'date' };
    db.prepare('UPDATE ledger_entries SET paid = ?, paid_at = ?, updated_at = datetime(\'now\') WHERE id = ? AND license_id = ?')
      .run(status === 'paid' ? 1 : 0, paidAt, inv.ledger_entry_id, license_id);
    addEvent(license_id, id, status, paidAt || '');
  } else {
    return { error: 'invalid_input', field: 'status' };
  }
  audit('INVOICE_STATUS', { license_id, ip, detail: `id=${id} ${status}` });
  return { invoice: getInvoice(license_id, id) };
}

/** Busca o guarda el cliente de una factura. Devuelve { customer, customer_id } o { error }. */
function resolveCustomer(license_id, body) {
  if (body.customer_id) {
    const c = getCustomer(license_id, Number(body.customer_id));
    if (!c) return { error: 'customer_not_found' };
    return { customer: M.normalizeParty(c), customer_id: c.id, surcharge: c.equivalence_surcharge };
  }
  if (!body.customer || typeof body.customer !== 'object') return { customer: null, customer_id: null };
  const p = M.normalizeParty(body.customer);
  if (!p.name && !p.tax_id) return { customer: null, customer_id: null };
  return { customer: p, customer_id: null, save: body.save_customer !== false };
}

/** Guarda en la libreta el cliente escrito a mano (o actualiza el que tenga ese NIF). */
function rememberCustomer(license_id, customer, surcharge) {
  if (!customer?.name) return null;
  const db = getDB();
  const existing = customer.tax_id
    ? db.prepare('SELECT id FROM customers WHERE license_id = ? AND tax_id = ?').get(license_id, customer.tax_id)
    : db.prepare('SELECT id FROM customers WHERE license_id = ? AND lower(name) = lower(?) AND tax_id = \'\'').get(license_id, customer.name);
  const out = existing
    ? updateCustomer(license_id, existing.id, { ...customer, equivalence_surcharge: surcharge })
    : createCustomer(license_id, { ...customer, equivalence_surcharge: surcharge });
  return out?.customer?.id || null;
}

module.exports = {
  runInvoicingSchema,
  getBillingProfile, saveBillingProfile, issuerFromProfile,
  listCustomers, getCustomer, createCustomer, updateCustomer, deleteCustomer, resolveCustomer, rememberCustomer,
  listInvoices, getInvoice, listEvents, addEvent, issueInvoice, cancelInvoice, setCustomerStatus
};
