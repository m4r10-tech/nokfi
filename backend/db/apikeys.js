/**
 * db/apikeys.js — F4: claves de API por licencia.
 *
 * La clave (nk_live_…) se muestra UNA vez al crearla y se guarda solo su
 * hash SHA-256 (igual que los tokens de sesión). Revocables; "último uso".
 *
 * Sesión 9: claves de prueba (nk_test_…, `mode = 'test'`): respuestas de
 * ejemplo, sin gastar cuota y en todos los planes. `client` agrupa las claves
 * por cliente final (Desarrolladores → Clientes).
 */

'use strict';

const crypto = require('crypto');
const { getDB } = require('./database');

const PREFIX = 'nk_live_';
const TEST_PREFIX = 'nk_test_';
const PREFIXES = { live: PREFIX, test: TEST_PREFIX };
const MAX_KEYS = 10;
const hash = (k) => crypto.createHash('sha256').update(k).digest('hex');

function createApiKey(license_id, name, { mode = 'live', client = '' } = {}) {
  const pre = PREFIXES[mode];
  if (!pre) return { error: 'invalid_mode' };
  const active = getDB().prepare('SELECT COUNT(*) c FROM api_keys WHERE license_id = ? AND revoked_at IS NULL').get(license_id).c;
  if (active >= MAX_KEYS) return { error: 'too_many_keys' };
  const plain = pre + crypto.randomBytes(24).toString('base64url');
  const info = getDB().prepare('INSERT INTO api_keys (license_id, name, key_hash, prefix, mode, client) VALUES (?, ?, ?, ?, ?, ?)')
    .run(license_id, String(name || '').slice(0, 60), hash(plain), plain.slice(0, pre.length + 4), mode, String(client || '').slice(0, 60));
  return { id: Number(info.lastInsertRowid), key: plain, mode };
}

/** Cambia el cliente al que pertenece una clave ('' = sin cliente). */
function setApiKeyClient(license_id, id, client) {
  return getDB().prepare('UPDATE api_keys SET client = ? WHERE id = ? AND license_id = ?')
    .run(String(client || '').slice(0, 60), id, license_id).changes > 0;
}

function listApiKeys(license_id) {
  return getDB().prepare(`
    SELECT id, name, prefix, mode, client, created_at, last_used_at, revoked_at FROM api_keys
    WHERE license_id = ? ORDER BY revoked_at IS NOT NULL, created_at DESC
  `).all(license_id);
}

function revokeApiKey(license_id, id) {
  return getDB().prepare("UPDATE api_keys SET revoked_at = datetime('now') WHERE id = ? AND license_id = ? AND revoked_at IS NULL")
    .run(id, license_id).changes > 0;
}

function findApiKey(plain) {
  if (typeof plain !== 'string' || !(plain.startsWith(PREFIX) || plain.startsWith(TEST_PREFIX))) return null;
  return getDB().prepare('SELECT * FROM api_keys WHERE key_hash = ?').get(hash(plain)) || null;
}

function touchApiKey(id) {
  getDB().prepare("UPDATE api_keys SET last_used_at = datetime('now') WHERE id = ? AND (last_used_at IS NULL OR last_used_at < datetime('now', '-60 seconds'))").run(id);
}

/* ── Sesión 7: registro de llamadas (sin contenido: ruta, estado, error, ms) ── */
function logApiCall({ license_id, key_id, method, path, status, error_code = '', ms = 0, livemode = true }) {
  const db = getDB();
  db.prepare('INSERT INTO api_calls (license_id, key_id, method, path, status, error_code, ms, livemode) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run(license_id, key_id ?? null, String(method).slice(0, 8), String(path).split('?')[0].slice(0, 120), status, String(error_code || '').slice(0, 60), Math.round(ms), livemode ? 1 : 0);
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

/**
 * Sesión 9 — Registro de llamadas (Desarrolladores → Registro). key_id NULL =
 * Playground. Filtros: clave, cliente, resultado (ok | error), modo; paginado por id.
 */
function listApiCalls(license_id, { key_id, client, result, mode, before, limit = 50 } = {}) {
  const n = Math.min(Math.max(Number(limit) || 50, 1), 200);
  const where = ['c.license_id = ?'];
  const args = [license_id];
  if (key_id === 'playground') where.push('c.key_id IS NULL');
  else if (key_id) { where.push('c.key_id = ?'); args.push(Number(key_id)); }
  if (client !== undefined && client !== null && client !== '') {
    if (client === '__none__') where.push("COALESCE(k.client, '') = ''");
    else { where.push('k.client = ?'); args.push(String(client)); }
  }
  if (result === 'ok') where.push('c.status < 400');
  if (result === 'error') where.push('c.status >= 400');
  if (mode === 'live') where.push('c.livemode = 1');
  if (mode === 'test') where.push('c.livemode = 0');
  if (before) { where.push('c.id < ?'); args.push(Number(before)); }
  const rows = getDB().prepare(`SELECT c.id, c.method, c.path, c.status, c.error_code, c.ms, c.livemode, c.created_at, c.key_id,
      k.name key_name, k.prefix key_prefix, k.client
    FROM api_calls c LEFT JOIN api_keys k ON k.id = c.key_id
    WHERE ${where.join(' AND ')} ORDER BY c.id DESC LIMIT ?`).all(...args, n + 1);
  const more = rows.length > n;
  return { calls: rows.slice(0, n).map(r => ({ ...r, livemode: !!r.livemode, client: r.client || '' })), next_before: more ? rows[n - 1].id : null };
}

/** Sesión 9 — Clientes (opción B): claves agrupadas por cliente, con su uso. */
function clientsSummary(license_id) {
  const db = getDB();
  const keys = listApiKeys(license_id);
  const stats = db.prepare(`SELECT key_id, COUNT(*) calls_30d, SUM(status >= 400) errors_30d,
      SUM(created_at >= date('now')) calls_today, SUM(created_at >= date('now') AND status >= 400) errors_today, MAX(created_at) last_call_at
    FROM api_calls WHERE license_id = ? AND key_id IS NOT NULL AND created_at >= datetime('now', '-30 days') GROUP BY key_id`).all(license_id);
  const by = Object.fromEntries(stats.map(s => [s.key_id, s]));
  const groups = new Map();
  for (const k of keys) {
    const g = groups.get(k.client) || { client: k.client, keys: [], calls_today: 0, errors_today: 0, calls_30d: 0, errors_30d: 0, last_call_at: null };
    const s = by[k.id] || {};
    g.keys.push({ id: k.id, name: k.name, prefix: k.prefix, mode: k.mode, revoked_at: k.revoked_at, last_used_at: k.last_used_at });
    g.calls_today += s.calls_today || 0; g.errors_today += s.errors_today || 0;
    g.calls_30d += s.calls_30d || 0; g.errors_30d += s.errors_30d || 0;
    if (s.last_call_at && (!g.last_call_at || s.last_call_at > g.last_call_at)) g.last_call_at = s.last_call_at;
    groups.set(k.client, g);
  }
  // Primero los clientes con nombre (por uso), al final las claves sin cliente.
  return [...groups.values()].sort((a, b) => (a.client === '') - (b.client === '') || b.calls_30d - a.calls_30d || a.client.localeCompare(b.client));
}

module.exports = {
  listApiCalls, clientsSummary,
  logApiCall, callsTodayByKey, apiSummary, createApiKey, setApiKeyClient, listApiKeys, revokeApiKey, findApiKey, touchApiKey,
  API_KEY_PREFIX: PREFIX, API_TEST_PREFIX: TEST_PREFIX
};
