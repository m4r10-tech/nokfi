/**
 * db/apikeys.js — F4: claves de API por licencia.
 *
 * La clave (nk_live_…) se muestra UNA vez al crearla y se guarda solo su
 * hash SHA-256 (igual que los tokens de sesión). Revocables; "último uso".
 */

'use strict';

const crypto = require('crypto');
const { getDB } = require('./database');

const PREFIX = 'nk_live_';
const MAX_KEYS = 10;
const hash = (k) => crypto.createHash('sha256').update(k).digest('hex');

function createApiKey(license_id, name) {
  const active = getDB().prepare('SELECT COUNT(*) c FROM api_keys WHERE license_id = ? AND revoked_at IS NULL').get(license_id).c;
  if (active >= MAX_KEYS) return { error: 'too_many_keys' };
  const plain = PREFIX + crypto.randomBytes(24).toString('base64url');
  const info = getDB().prepare('INSERT INTO api_keys (license_id, name, key_hash, prefix) VALUES (?, ?, ?, ?)')
    .run(license_id, String(name || '').slice(0, 60), hash(plain), plain.slice(0, PREFIX.length + 4));
  return { id: Number(info.lastInsertRowid), key: plain };
}

function listApiKeys(license_id) {
  return getDB().prepare(`
    SELECT id, name, prefix, created_at, last_used_at, revoked_at FROM api_keys
    WHERE license_id = ? ORDER BY revoked_at IS NOT NULL, created_at DESC
  `).all(license_id);
}

function revokeApiKey(license_id, id) {
  return getDB().prepare("UPDATE api_keys SET revoked_at = datetime('now') WHERE id = ? AND license_id = ? AND revoked_at IS NULL")
    .run(id, license_id).changes > 0;
}

function findApiKey(plain) {
  if (typeof plain !== 'string' || !plain.startsWith(PREFIX)) return null;
  return getDB().prepare('SELECT * FROM api_keys WHERE key_hash = ?').get(hash(plain)) || null;
}

function touchApiKey(id) {
  getDB().prepare("UPDATE api_keys SET last_used_at = datetime('now') WHERE id = ? AND (last_used_at IS NULL OR last_used_at < datetime('now', '-60 seconds'))").run(id);
}

/* ── Sesión 7: registro de llamadas (sin contenido: ruta, estado, error, ms) ── */
function logApiCall({ license_id, key_id, method, path, status, error_code = '', ms = 0 }) {
  const db = getDB();
  db.prepare('INSERT INTO api_calls (license_id, key_id, method, path, status, error_code, ms) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(license_id, key_id ?? null, String(method).slice(0, 8), String(path).split('?')[0].slice(0, 120), status, String(error_code || '').slice(0, 60), Math.round(ms));
  if (Math.random() < 0.01) db.prepare("DELETE FROM api_calls WHERE created_at < datetime('now', '-90 days')").run();
}

/** Llamadas de hoy (UTC) por clave: { [key_id]: n }. */
function callsTodayByKey(license_id) {
  const out = {};
  for (const r of getDB().prepare(`SELECT key_id, COUNT(*) c FROM api_calls WHERE license_id = ? AND created_at >= date('now') GROUP BY key_id`).all(license_id)) {
    if (r.key_id != null) out[r.key_id] = r.c;
  }
  return out;
}

function apiSummary(license_id) {
  const db = getDB();
  const today = db.prepare(`SELECT COUNT(*) c, SUM(status >= 400) e FROM api_calls WHERE license_id = ? AND created_at >= date('now')`).get(license_id);
  const lastError = db.prepare(`SELECT c.method, c.path, c.status, c.error_code, c.created_at, k.name key_name FROM api_calls c
    LEFT JOIN api_keys k ON k.id = c.key_id WHERE c.license_id = ? AND c.status >= 400 ORDER BY c.id DESC LIMIT 1`).get(license_id) || null;
  const lastCall = db.prepare('SELECT created_at FROM api_calls WHERE license_id = ? ORDER BY id DESC LIMIT 1').get(license_id);
  return { calls_today: today.c || 0, errors_today: today.e || 0, last_error: lastError, last_call_at: lastCall?.created_at || null };
}

module.exports = { logApiCall, callsTodayByKey, apiSummary, createApiKey, listApiKeys, revokeApiKey, findApiKey, touchApiKey, API_KEY_PREFIX: PREFIX };
