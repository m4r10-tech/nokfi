/**
 * db/webhooks.js — sesión 9 (API, Bloque 2): endpoints de webhook y registro
 * de envíos.
 *
 * El secreto de firma (whsec_…) se guarda en claro porque hace falta para
 * firmar cada envío con HMAC (como hace Stripe); solo lo ve el dueño de la
 * cuenta. El cuerpo de cada envío se borra a las 24 h (purgeWebhookData).
 */

'use strict';

const crypto = require('crypto');
const { getDB } = require('./database');

const EVENT_TYPES = ['analysis.completed', 'job.completed', 'job.failed', 'quota.threshold', 'fiscal.deadline',
  // Sesión 11: facturas emitidas y VERI*FACTU.
  'invoice.issued', 'invoice.cancelled', 'invoice.rejected', 'invoice.accepted', 'invoice.paid', 'invoice.unpaid',
  'verifactu.accepted', 'verifactu.rejected'];
const MAX_ENDPOINTS = 10;

const newSecret = () => 'whsec_' + crypto.randomBytes(24).toString('base64url');

/** '*' o lista separada por comas → array limpio (o null si hay tipos desconocidos). */
function normalizeEvents(raw) {
  if (raw === undefined || raw === null || raw === '*' || (Array.isArray(raw) && raw.includes('*'))) return ['*'];
  const list = (Array.isArray(raw) ? raw : String(raw).split(',')).map(s => String(s).trim()).filter(Boolean);
  if (!list.length || list.some(t => !EVENT_TYPES.includes(t))) return null;
  return [...new Set(list)];
}

function publicEndpoint(row, { withSecret = false } = {}) {
  if (!row) return null;
  return {
    id: row.id,
    url: row.url,
    events: row.events === '*' ? ['*'] : row.events.split(','),
    description: row.description,
    enabled: !!row.enabled,
    disabled_reason: row.disabled_reason || null,
    created_at: row.created_at,
    ...(withSecret ? { secret: row.secret } : {})
  };
}

function createEndpoint(license_id, { url, events, description = '' }) {
  const n = getDB().prepare('SELECT COUNT(*) c FROM webhook_endpoints WHERE license_id = ?').get(license_id).c;
  if (n >= MAX_ENDPOINTS) return { error: 'too_many_endpoints' };
  const info = getDB().prepare('INSERT INTO webhook_endpoints (license_id, url, events, description, secret) VALUES (?, ?, ?, ?, ?)')
    .run(license_id, url, events.join(','), String(description || '').slice(0, 120), newSecret());
  return { endpoint: getEndpoint(license_id, Number(info.lastInsertRowid), { withSecret: true }) };
}

function getEndpointRow(license_id, id) {
  return getDB().prepare('SELECT * FROM webhook_endpoints WHERE id = ? AND license_id = ?').get(id, license_id) || null;
}

function getEndpoint(license_id, id, opts) {
  return publicEndpoint(getEndpointRow(license_id, id), opts);
}

function listEndpoints(license_id) {
  const db = getDB();
  const stats = db.prepare(`
    SELECT endpoint_id, COUNT(*) total, SUM(status = 'failed') failed, SUM(status = 'pending') pending, MAX(created_at) last_at
    FROM webhook_deliveries WHERE license_id = ? AND created_at >= datetime('now', '-7 days') GROUP BY endpoint_id
  `).all(license_id);
  const by = Object.fromEntries(stats.map(s => [s.endpoint_id, s]));
  return db.prepare('SELECT * FROM webhook_endpoints WHERE license_id = ? ORDER BY id DESC').all(license_id).map(r => ({
    ...publicEndpoint(r),
    last_7_days: { deliveries: by[r.id]?.total || 0, failed: by[r.id]?.failed || 0, pending: by[r.id]?.pending || 0, last_at: by[r.id]?.last_at || null }
  }));
}

/** Cambia url/eventos/descripción/activado. Reactivar pone a cero la racha de fallos. */
function updateEndpoint(license_id, id, patch) {
  const row = getEndpointRow(license_id, id);
  if (!row) return null;
  const next = {
    url: patch.url ?? row.url,
    events: patch.events ? patch.events.join(',') : row.events,
    description: patch.description !== undefined ? String(patch.description).slice(0, 120) : row.description,
    enabled: patch.enabled !== undefined ? (patch.enabled ? 1 : 0) : row.enabled
  };
  const reenabled = next.enabled && !row.enabled;
  getDB().prepare(`UPDATE webhook_endpoints SET url = ?, events = ?, description = ?, enabled = ?,
    disabled_reason = CASE WHEN ? THEN '' ELSE disabled_reason END, failure_streak = CASE WHEN ? THEN 0 ELSE failure_streak END
    WHERE id = ? AND license_id = ?`)
    .run(next.url, next.events, next.description, next.enabled, reenabled ? 1 : 0, reenabled ? 1 : 0, id, license_id);
  return getEndpoint(license_id, id);
}

function rotateSecret(license_id, id) {
  const ok = getDB().prepare('UPDATE webhook_endpoints SET secret = ? WHERE id = ? AND license_id = ?').run(newSecret(), id, license_id).changes > 0;
  return ok ? getEndpoint(license_id, id, { withSecret: true }) : null;
}

function deleteEndpoint(license_id, id) {
  return getDB().prepare('DELETE FROM webhook_endpoints WHERE id = ? AND license_id = ?').run(id, license_id).changes > 0;
}

/** Endpoints activos suscritos a un tipo de evento. */
function endpointsFor(license_id, type) {
  return getDB().prepare('SELECT * FROM webhook_endpoints WHERE license_id = ? AND enabled = 1').all(license_id)
    .filter(r => r.events === '*' || r.events.split(',').includes(type));
}

/** Licencias con algún endpoint activo suscrito a `type` (para eventos programados). */
function licensesSubscribedTo(type) {
  const rows = getDB().prepare('SELECT DISTINCT license_id, events FROM webhook_endpoints WHERE enabled = 1').all();
  return [...new Set(rows.filter(r => r.events === '*' || r.events.split(',').includes(type)).map(r => r.license_id))];
}

function insertDelivery({ endpoint_id, license_id, event }) {
  const info = getDB().prepare(`INSERT INTO webhook_deliveries (endpoint_id, license_id, event_id, event_type, livemode, payload_json)
    VALUES (?, ?, ?, ?, ?, ?)`).run(endpoint_id, license_id, event.id, event.type, event.livemode ? 1 : 0, JSON.stringify(event));
  return Number(info.lastInsertRowid);
}

function listDeliveries(license_id, { endpoint_id, limit = 50, before } = {}) {
  const n = Math.min(Math.max(Number(limit) || 50, 1), 100);
  const where = ['license_id = ?'];
  const args = [license_id];
  if (endpoint_id) { where.push('endpoint_id = ?'); args.push(endpoint_id); }
  if (before) { where.push('id < ?'); args.push(Number(before)); }
  return getDB().prepare(`SELECT id, endpoint_id, event_id, event_type, livemode, status, attempts, next_attempt_at, last_status,
      last_error, last_ms, delivered_at, created_at, payload_json IS NOT NULL AS resendable
    FROM webhook_deliveries WHERE ${where.join(' AND ')} ORDER BY id DESC LIMIT ?`).all(...args, n)
    .map(d => ({ ...d, livemode: !!d.livemode, resendable: !!d.resendable, next_attempt_at: d.status === 'pending' ? d.next_attempt_at : null }));
}

function getDeliveryRow(license_id, id) {
  return getDB().prepare('SELECT * FROM webhook_deliveries WHERE id = ? AND license_id = ?').get(id, license_id) || null;
}

/** Datos con caducidad: cuerpos de envío y resultados de trabajos (24 h), idempotencia (24 h). */
function purgeWebhookData() {
  const db = getDB();
  db.prepare("UPDATE webhook_deliveries SET payload_json = NULL WHERE payload_json IS NOT NULL AND status != 'pending' AND created_at < datetime('now', '-24 hours')").run();
  db.prepare("DELETE FROM webhook_deliveries WHERE created_at < datetime('now', '-30 days')").run();
  db.prepare("UPDATE api_jobs SET result_json = NULL WHERE result_json IS NOT NULL AND created_at < datetime('now', '-24 hours')").run();
  db.prepare("DELETE FROM api_jobs WHERE created_at < datetime('now', '-30 days')").run();
  db.prepare("DELETE FROM idempotency_keys WHERE created_at < datetime('now', '-24 hours')").run();
  db.prepare("DELETE FROM event_marks WHERE created_at < datetime('now', '-400 days')").run();
}

/** Marca de "evento ya emitido". true si es nueva (hay que emitir). */
function markOnce(license_id, mark) {
  return getDB().prepare('INSERT OR IGNORE INTO event_marks (license_id, mark) VALUES (?, ?)').run(license_id, mark).changes > 0;
}

module.exports = {
  EVENT_TYPES, MAX_ENDPOINTS, normalizeEvents, createEndpoint, getEndpoint, getEndpointRow, listEndpoints, updateEndpoint,
  rotateSecret, deleteEndpoint, endpointsFor, licensesSubscribedTo, insertDelivery, listDeliveries, getDeliveryRow,
  purgeWebhookData, markOnce
};
