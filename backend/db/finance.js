/**
 * db/finance.js — V1: libro de ingresos y gastos + V2: lo apartado para Hacienda.
 *
 * ⚠️ Cambio de modelo de datos (aprobado): los DATOS extraídos de las facturas
 * se guardan en el servidor (por licencia); el ARCHIVO de la factura no.
 * Política de privacidad actualizada en consecuencia.
 */

'use strict';

const { getDB } = require('./database');
const { sanitizeFreeText } = require('../utils/sanitize');
// Sesión 10: los nombres en MAYÚSCULAS se devuelven en formato título al leer.
const { nameCase } = require('../utils/names');

const FIELDS = ['type', 'party_name', 'party_nif', 'party_email', 'invoice_number', 'invoice_date', 'due_date', 'concept', 'category',
  'base', 'vat_rate', 'vat_amount', 'irpf_rate', 'irpf_amount', 'total', 'paid', 'paid_at', 'source', 'file_name'];

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const EMAIL = /^[^\s@<>"',;]+@[^\s@<>"',;]+\.[a-z]{2,}$/;
const num = (v) => { const n = Number(v); return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0; };
const txt = (v, max) => sanitizeFreeText(v ?? '').slice(0, max);

/** Valida y normaliza una entrada. Devuelve { entry } o { error }. */
function normalizeEntry(raw, { partial = false } = {}) {
  const e = {};
  const has = (k) => raw[k] !== undefined;
  if (!partial || has('type')) {
    if (!['income', 'expense'].includes(raw.type)) return { error: 'type' };
    e.type = raw.type;
  }
  if (!partial || has('invoice_date')) {
    if (!ISO.test(String(raw.invoice_date || ''))) return { error: 'invoice_date' };
    e.invoice_date = raw.invoice_date;
  }
  if (has('due_date')) e.due_date = ISO.test(String(raw.due_date || '')) ? raw.due_date : null;
  if (has('party_name') || !partial) e.party_name = txt(raw.party_name, 160);
  if (has('party_nif') || !partial) e.party_nif = txt(raw.party_nif, 20).toUpperCase().replace(/[\s-]/g, '');
  if (has('party_email') || !partial) {
    const mail = String(raw.party_email ?? '').trim().toLowerCase().slice(0, 160);
    e.party_email = EMAIL.test(mail) ? mail : '';
  }
  if (has('invoice_number') || !partial) e.invoice_number = txt(raw.invoice_number, 60);
  if (has('concept') || !partial) e.concept = txt(raw.concept, 200);
  if (has('category') || !partial) e.category = txt(raw.category, 60);
  for (const k of ['base', 'vat_rate', 'vat_amount', 'irpf_rate', 'irpf_amount', 'total']) {
    if (has(k) || !partial) e[k] = num(raw[k]);
  }
  if (has('paid') || !partial) {
    // Por defecto: los gastos se dan por pagados; los ingresos quedan pendientes de cobro (V4).
    e.paid = has('paid') ? (raw.paid ? 1 : 0) : (e.type === 'expense' ? 1 : 0);
  }
  if (has('paid_at')) e.paid_at = ISO.test(String(raw.paid_at || '').slice(0, 10)) ? String(raw.paid_at).slice(0, 10) : null;
  if (!partial) {
    e.source = raw.source === 'ai' ? 'ai' : 'manual';
    e.file_name = txt(raw.file_name, 160);
  }
  if (e.total !== undefined || e.base !== undefined) {
    const base = e.base ?? num(raw.base), vat = e.vat_amount ?? num(raw.vat_amount), irpf = e.irpf_amount ?? num(raw.irpf_amount), total = e.total ?? num(raw.total);
    e.needs_review = Math.abs(base + vat - irpf - total) > 0.05 ? 1 : 0;
  }
  return { entry: e };
}

function findDuplicate(license_id, e) {
  if (!e.invoice_number) return null;
  const db = getDB();
  if (e.party_nif) {
    return db.prepare('SELECT id FROM ledger_entries WHERE license_id = ? AND type = ? AND party_nif = ? AND invoice_number = ?')
      .get(license_id, e.type, e.party_nif, e.invoice_number) || null;
  }
  return db.prepare('SELECT id FROM ledger_entries WHERE license_id = ? AND type = ? AND lower(party_name) = lower(?) AND invoice_number = ?')
    .get(license_id, e.type, e.party_name || '', e.invoice_number) || null;
}

function insertEntries(license_id, entries) {
  const db = getDB();
  const cols = [...FIELDS, 'needs_review'];
  const stmt = db.prepare(`INSERT INTO ledger_entries (license_id, ${cols.join(', ')}) VALUES (?, ${cols.map(() => '?').join(', ')})`);
  const ids = [];
  db.transaction(() => {
    for (const e of entries) {
      if (e.paid && !e.paid_at) e.paid_at = e.type === 'expense' ? e.invoice_date : new Date().toISOString().slice(0, 10);
      const info = stmt.run(license_id, ...cols.map(c => (e[c] === undefined ? null : e[c])));
      ids.push(Number(info.lastInsertRowid));
    }
  })();
  return ids;
}

function listLedger(license_id, { from, to, type } = {}) {
  const where = ['license_id = ?'];
  const args = [license_id];
  if (from && ISO.test(from)) { where.push('invoice_date >= ?'); args.push(from); }
  if (to && ISO.test(to)) { where.push('invoice_date <= ?'); args.push(to); }
  if (type === 'income' || type === 'expense') { where.push('type = ?'); args.push(type); }
  return getDB().prepare(`SELECT * FROM ledger_entries WHERE ${where.join(' AND ')} ORDER BY invoice_date DESC, id DESC LIMIT 5000`)
    .all(...args).map(r => ({ ...r, party_name: nameCase(r.party_name), paid: !!r.paid, needs_review: !!r.needs_review }));
}

function allEntries(license_id) {
  // Sesión 11: de una factura emitida en Nokfi se cobra lo que queda tras sus
  // rectificativas (rectified_total, en negativo si restan); las rectificativas
  // no son un cobro aparte (is_rectification).
  return getDB().prepare(`SELECT l.*, (i.customer_status = 'rejected') AS invoice_rejected, (i.rectifies_id IS NOT NULL) AS is_rectification,
      COALESCE((SELECT SUM(r.total) FROM invoices r WHERE r.rectifies_id = l.invoice_id AND r.status = 'issued'), 0) AS rectified_total
    FROM ledger_entries l LEFT JOIN invoices i ON i.id = l.invoice_id WHERE l.license_id = ? ORDER BY l.invoice_date ASC, l.id ASC`)
    .all(license_id).map(r => ({ ...r, party_name: nameCase(r.party_name), paid: !!r.paid, invoice_rejected: !!r.invoice_rejected, is_rectification: !!r.is_rectification }));
}

function getEntry(license_id, id) {
  const r = getDB().prepare('SELECT * FROM ledger_entries WHERE id = ? AND license_id = ?').get(id, license_id);
  return r ? { ...r, party_name: nameCase(r.party_name), paid: !!r.paid, needs_review: !!r.needs_review } : null;
}

// Sesión 11: el apunte de una factura emitida en Nokfi solo admite marcar el
// cobro y la categoría; lo demás se cambia rectificando la factura.
const INVOICE_EDITABLE = ['paid', 'paid_at', 'category', 'party_email'];

function updateEntry(license_id, id, partial) {
  const current = getEntry(license_id, id);
  if (!current) return null;
  if (current.invoice_id && Object.keys(partial).some(k => !INVOICE_EDITABLE.includes(k) && partial[k] !== current[k])) return { error: 'invoice_locked' };
  const { entry, error } = normalizeEntry({ ...partial }, { partial: true });
  if (error) return { error };
  if (entry.paid === 1 && !current.paid && partial.paid_at === undefined) entry.paid_at = new Date().toISOString().slice(0, 10);
  if (entry.paid === 0) entry.paid_at = null;
  // Recalcular needs_review con los valores finales.
  const merged = { ...current, ...entry };
  entry.needs_review = Math.abs(merged.base + merged.vat_amount - merged.irpf_amount - merged.total) > 0.05 ? 1 : 0;
  const keys = Object.keys(entry);
  if (!keys.length) return current;
  getDB().prepare(`UPDATE ledger_entries SET ${keys.map(k => `${k} = ?`).join(', ')}, updated_at = datetime('now') WHERE id = ? AND license_id = ?`)
    .run(...keys.map(k => entry[k]), id, license_id);
  return getEntry(license_id, id);
}

function deleteEntry(license_id, id) {
  const e = getDB().prepare('SELECT invoice_id FROM ledger_entries WHERE id = ? AND license_id = ?').get(id, license_id);
  if (!e) return false;
  if (e.invoice_id) return { error: 'invoice_locked' };
  return getDB().prepare('DELETE FROM ledger_entries WHERE id = ? AND license_id = ?').run(id, license_id).changes > 0;
}

function getReserve(license_id, year, quarter) {
  const r = getDB().prepare('SELECT amount FROM tax_reserves WHERE license_id = ? AND year = ? AND quarter = ?').get(license_id, year, quarter);
  return r ? r.amount : 0;
}

function setReserve(license_id, year, quarter, amount) {
  getDB().prepare(`
    INSERT INTO tax_reserves (license_id, year, quarter, amount, updated_at) VALUES (?, ?, ?, ?, datetime('now'))
    ON CONFLICT(license_id, year, quarter) DO UPDATE SET amount = excluded.amount, updated_at = datetime('now')
  `).run(license_id, year, quarter, num(amount));
  return getReserve(license_id, year, quarter);
}

/* ── Fugas: proveedores descartados ("No es una fuga") ── */
function listDismissals(license_id) {
  return getDB().prepare('SELECT party_key, party_name, created_at FROM leak_dismissals WHERE license_id = ? ORDER BY created_at DESC').all(license_id);
}

function addDismissal(license_id, party_key, party_name = '') {
  getDB().prepare(`INSERT INTO leak_dismissals (license_id, party_key, party_name) VALUES (?, ?, ?)
    ON CONFLICT(license_id, party_key) DO UPDATE SET party_name = excluded.party_name`)
    .run(license_id, txt(party_key, 180), txt(party_name, 160));
}

function removeDismissal(license_id, party_key) {
  return getDB().prepare('DELETE FROM leak_dismissals WHERE license_id = ? AND party_key = ?').run(license_id, String(party_key || '')).changes > 0;
}

const dismissedSet = (license_id) => new Set(listDismissals(license_id).map(d => d.party_key));

module.exports = { listDismissals, addDismissal, removeDismissal, dismissedSet, normalizeEntry, findDuplicate, insertEntries, listLedger, allEntries, getEntry, updateEntry, deleteEntry, getReserve, setReserve };
