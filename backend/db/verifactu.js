/**
 * db/verifactu.js — sesión 11 (tanda 4): registros de facturación VERI*FACTU.
 *
 *   verifactu_records  un registro de alta por factura real emitida y uno de
 *                      anulación si se anula; cada uno lleva la huella del
 *                      anterior del mismo emisor (NIF) en la misma cuenta.
 *                      Se crean DENTRO de la transacción que emite o anula la
 *                      factura, así la cadena no puede quedar a medias.
 *   verifactu_flow     cuándo puede volver a enviar cada cuenta (la AEAT fija
 *                      un tiempo de espera entre envíos: TiempoEsperaEnvio).
 *
 * Inmutabilidad (art. 8 RD 1007/2023): disparadores que impiden cambiar los
 * datos fiscales de una factura emitida, sus líneas y los registros, y
 * borrarlos mientras exista la cuenta (el borrado de la cuenta sí los borra
 * en cascada).
 *
 * Estados: pending (sin enviar) · accepted · accepted_errors (aceptado con
 * errores: hay que subsanar) · rejected. Un registro subsanado guarda en
 * fixed_by el registro que lo corrige.
 */

'use strict';

const { getDB } = require('./database');
const R = require('../services/verifactu/record');

function runVerifactuSchema(db) {
  // Los disparadores se recrean en cada arranque (así un cambio aquí llega a BD existentes).
  db.exec(`DROP TRIGGER IF EXISTS invoices_immutable; DROP TRIGGER IF EXISTS invoices_nodelete; DROP TRIGGER IF EXISTS invoice_lines_immutable;
    DROP TRIGGER IF EXISTS invoice_lines_nodelete; DROP TRIGGER IF EXISTS verifactu_records_immutable; DROP TRIGGER IF EXISTS verifactu_records_nodelete;`);
  db.exec(`
    CREATE TABLE IF NOT EXISTS verifactu_records (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      license_id     INTEGER NOT NULL REFERENCES licenses(id) ON DELETE CASCADE,
      invoice_id     INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
      type           TEXT    NOT NULL CHECK(type IN ('alta','anulacion')),
      issuer_nif     TEXT    NOT NULL,
      number         TEXT    NOT NULL,
      issue_date     TEXT    NOT NULL,
      data_json      TEXT    NOT NULL,
      prev_id        INTEGER DEFAULT NULL,
      hash           TEXT    NOT NULL,
      generated_at   TEXT    NOT NULL,
      status         TEXT    NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','accepted','accepted_errors','rejected')),
      attempts       INTEGER NOT NULL DEFAULT 0,
      next_attempt_at INTEGER NOT NULL DEFAULT 0,
      last_error     TEXT    NOT NULL DEFAULT '',
      error_code     TEXT    NOT NULL DEFAULT '',
      error_message  TEXT    NOT NULL DEFAULT '',
      csv            TEXT    NOT NULL DEFAULT '',
      env            TEXT    NOT NULL DEFAULT '',
      sent_at        TEXT    DEFAULT NULL,
      fixed_by       INTEGER DEFAULT NULL,
      created_at     TEXT    NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_vf_chain ON verifactu_records(license_id, issuer_nif, id);
    CREATE INDEX IF NOT EXISTS idx_vf_invoice ON verifactu_records(invoice_id, id);
    CREATE INDEX IF NOT EXISTS idx_vf_pending ON verifactu_records(status, next_attempt_at);

    CREATE TABLE IF NOT EXISTS verifactu_flow (
      license_id   INTEGER PRIMARY KEY REFERENCES licenses(id) ON DELETE CASCADE,
      next_send_at INTEGER NOT NULL DEFAULT 0
    );

    CREATE TRIGGER IF NOT EXISTS invoices_immutable
      BEFORE UPDATE OF license_id, series, year, seq, number, kind, issue_date, operation_date, issuer_json, customer_json,
        base, vat_amount, re_amount, irpf_rate, irpf_amount, total, taxes_json, equivalence_surcharge, exemption, rectifies_id, livemode
      ON invoices
      BEGIN SELECT RAISE(ABORT, 'invoice_immutable'); END;
    CREATE TRIGGER IF NOT EXISTS invoices_nodelete
      BEFORE DELETE ON invoices WHEN EXISTS (SELECT 1 FROM licenses WHERE id = OLD.license_id)
      BEGIN SELECT RAISE(ABORT, 'invoice_immutable'); END;
    CREATE TRIGGER IF NOT EXISTS invoice_lines_immutable
      BEFORE UPDATE ON invoice_lines
      BEGIN SELECT RAISE(ABORT, 'invoice_immutable'); END;
    CREATE TRIGGER IF NOT EXISTS invoice_lines_nodelete
      BEFORE DELETE ON invoice_lines WHEN EXISTS (SELECT 1 FROM invoices i JOIN licenses l ON l.id = i.license_id WHERE i.id = OLD.invoice_id)
      BEGIN SELECT RAISE(ABORT, 'invoice_immutable'); END;
    CREATE TRIGGER IF NOT EXISTS verifactu_records_immutable
      BEFORE UPDATE OF license_id, invoice_id, type, issuer_nif, number, issue_date, data_json, prev_id, hash, generated_at
      ON verifactu_records
      BEGIN SELECT RAISE(ABORT, 'record_immutable'); END;
    CREATE TRIGGER IF NOT EXISTS verifactu_records_nodelete
      BEFORE DELETE ON verifactu_records WHEN EXISTS (SELECT 1 FROM licenses WHERE id = OLD.license_id)
      BEGIN SELECT RAISE(ABORT, 'record_immutable'); END;
  `);
}

/** Último registro de la cadena de ese emisor en la cuenta. */
function lastRecord(db, license_id, issuer_nif) {
  return db.prepare('SELECT id, issuer_nif, number, issue_date, hash FROM verifactu_records WHERE license_id = ? AND issuer_nif = ? ORDER BY id DESC LIMIT 1')
    .get(license_id, issuer_nif) || null;
}

function insert(db, license_id, invoice_id, type, inv, data, prev) {
  const info = db.prepare(`INSERT INTO verifactu_records (license_id, invoice_id, type, issuer_nif, number, issue_date, data_json, prev_id, hash, generated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(license_id, invoice_id, type, inv.issuer.tax_id, inv.number, inv.issue_date, JSON.stringify(data), prev?.id || null, data.Huella, data.FechaHoraHusoGenRegistro);
  return Number(info.lastInsertRowid);
}

/**
 * Registro de alta de una factura recién emitida. Llamar DENTRO de la
 * transacción de emisión. opts: { original, subsanacion, rechazoPrevio, now }.
 */
function createAlta(license_id, invoice_id, inv, opts = {}) {
  const db = getDB();
  const prev = lastRecord(db, license_id, inv.issuer.tax_id);
  const data = R.buildAlta(inv, { ...opts, prev });
  return insert(db, license_id, invoice_id, 'alta', inv, data, prev);
}

/** Registro de anulación (DENTRO de la transacción que anula). */
function createAnulacion(license_id, invoice_id, inv, opts = {}) {
  const db = getDB();
  const prev = lastRecord(db, license_id, inv.issuer.tax_id);
  const data = R.buildAnulacion(inv, { ...opts, prev });
  return insert(db, license_id, invoice_id, 'anulacion', inv, data, prev);
}

const PUBLIC_COLS = 'id, invoice_id, type, issuer_nif, number, issue_date, hash, prev_id, generated_at, status, attempts, last_error, error_code, error_message, csv, env, sent_at, fixed_by, created_at';

function getRecord(license_id, id) {
  return getDB().prepare(`SELECT ${PUBLIC_COLS}, data_json FROM verifactu_records WHERE id = ? AND license_id = ?`).get(id, license_id) || null;
}

function recordsForInvoice(license_id, invoice_id) {
  return getDB().prepare(`SELECT ${PUBLIC_COLS} FROM verifactu_records WHERE license_id = ? AND invoice_id = ? ORDER BY id`).all(license_id, invoice_id);
}

/** Listado con filtro: all | pending | sent (aceptados) | errors (rechazados o con errores sin subsanar). */
function listRecords(license_id, { filter = 'all', limit = 200 } = {}) {
  const where = ['license_id = ?'];
  if (filter === 'pending') where.push("status = 'pending'");
  else if (filter === 'sent') where.push("status = 'accepted'");
  else if (filter === 'errors') where.push("status IN ('rejected','accepted_errors') AND fixed_by IS NULL");
  const n = Math.min(Math.max(Number(limit) || 200, 1), 1000);
  return getDB().prepare(`SELECT ${PUBLIC_COLS} FROM verifactu_records WHERE ${where.join(' AND ')} ORDER BY id DESC LIMIT ${n}`).all(license_id);
}

function summary(license_id) {
  const rows = getDB().prepare(`SELECT status, (fixed_by IS NOT NULL) AS fixed, COUNT(*) AS n FROM verifactu_records WHERE license_id = ? GROUP BY status, fixed`).all(license_id);
  const s = { total: 0, pending: 0, accepted: 0, errors: 0 };
  for (const r of rows) {
    s.total += r.n;
    if (r.status === 'pending') s.pending += r.n;
    else if (r.status === 'accepted') s.accepted += r.n;
    else if (r.fixed) s.accepted += r.status === 'accepted_errors' ? r.n : 0;
    else s.errors += r.n;
  }
  const last = getDB().prepare("SELECT MAX(sent_at) AS at FROM verifactu_records WHERE license_id = ? AND sent_at IS NOT NULL").get(license_id);
  s.last_sent_at = last?.at || null;
  return s;
}

/** Comprueba la cadena de una cuenta: cada huella se recalcula y enlaza con la anterior. */
function verifyChain(license_id) {
  const rows = getDB().prepare('SELECT id, type, issuer_nif, prev_id, hash, data_json FROM verifactu_records WHERE license_id = ? ORDER BY id').all(license_id);
  const lastByNif = new Map();
  for (const r of rows) {
    const d = JSON.parse(r.data_json);
    const expectedPrev = lastByNif.get(r.issuer_nif) || null;
    if ((r.prev_id || null) !== (expectedPrev?.id || null)) return { ok: false, id: r.id, reason: 'link' };
    if ((d.Anterior?.Huella || null) !== (expectedPrev?.hash || null)) return { ok: false, id: r.id, reason: 'prev_hash' };
    const h = r.type === 'alta' ? R.altaHash(d) : R.anulacionHash(d);
    if (h !== r.hash || h !== d.Huella) return { ok: false, id: r.id, reason: 'hash' };
    lastByNif.set(r.issuer_nif, r);
  }
  return { ok: true, count: rows.length };
}

/* ── Cola de envío ── */
function licensesWithDue(now) {
  return getDB().prepare(`SELECT DISTINCT r.license_id FROM verifactu_records r
    LEFT JOIN verifactu_flow f ON f.license_id = r.license_id
    WHERE r.status = 'pending' AND r.next_attempt_at <= ? AND coalesce(f.next_send_at, 0) <= ?`).all(now, now).map(r => r.license_id);
}

/** Pendientes de una cuenta, en orden de cadena y del mismo emisor (la cabecera lleva un único obligado). */
function pendingBatch(license_id, now, max = 1000) {
  const rows = getDB().prepare(`SELECT r.id, r.invoice_id, r.type, r.issuer_nif, r.number, r.attempts, r.data_json,
      json_extract(i.issuer_json, '$.name') AS issuer_name
    FROM verifactu_records r JOIN invoices i ON i.id = r.invoice_id
    WHERE r.license_id = ? AND r.status = 'pending' AND r.next_attempt_at <= ? ORDER BY r.id LIMIT ?`).all(license_id, now, max);
  return rows.filter(r => r.issuer_nif === rows[0]?.issuer_nif);
}

function setFlow(license_id, next_send_at) {
  getDB().prepare('INSERT INTO verifactu_flow (license_id, next_send_at) VALUES (?, ?) ON CONFLICT(license_id) DO UPDATE SET next_send_at = excluded.next_send_at')
    .run(license_id, next_send_at);
}

function markResult(id, { status, error_code = '', error_message = '', csv = '', env = '' }) {
  getDB().prepare(`UPDATE verifactu_records SET status = ?, error_code = ?, error_message = ?, csv = ?, env = ?, sent_at = datetime('now'),
    attempts = attempts + 1, last_error = '' WHERE id = ?`).run(status, String(error_code).slice(0, 20), String(error_message).slice(0, 1500), String(csv).slice(0, 100), env, id);
}

function markRetry(id, next_attempt_at, last_error) {
  getDB().prepare('UPDATE verifactu_records SET attempts = attempts + 1, next_attempt_at = ?, last_error = ? WHERE id = ?')
    .run(next_attempt_at, String(last_error).slice(0, 500), id);
}

/** Vuelve a poner en cola los registros pendientes con error de envío (botón "Reintentar"). */
function retryNow(license_id) {
  return getDB().prepare("UPDATE verifactu_records SET next_attempt_at = 0 WHERE license_id = ? AND status = 'pending'").run(license_id).changes;
}

function setFixedBy(id, fixed_by) {
  getDB().prepare('UPDATE verifactu_records SET fixed_by = ? WHERE id = ?').run(fixed_by, id);
}

module.exports = {
  runVerifactuSchema, createAlta, createAnulacion, getRecord, recordsForInvoice, listRecords, summary, verifyChain,
  licensesWithDue, pendingBatch, setFlow, markResult, markRetry, retryNow, setFixedBy
};
