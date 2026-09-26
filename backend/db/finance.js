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
    .all(...args).map(r => ({ ...r, paid: !!r.paid, needs_review: !!r.needs_review }));
}

function allEntries(license_id) {
  return getDB().prepare('SELECT * FROM ledger_entries WHERE license_id = ? ORDER BY invoice_date ASC, id ASC')
    .all(license_id).map(r => ({ ...r, paid: !!r.paid }));
}

function getEntry(license_id, id) {
  const r = getDB().prepare('SELECT * FROM ledger_entries WHERE id = ? AND license_id = ?').get(id, license_id);
  return r ? { ...r, paid: !!r.paid, needs_review: !!r.needs_review } : null;
}

function updateEntry(license_id, id, partial) {
  const current = getEntry(license_id, id);
  if (!current) return null;
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

module.exports = { normalizeEntry, findDuplicate, insertEntries, listLedger, allEntries, getEntry, updateEntry, deleteEntry, getReserve, setReserve };
