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

module.exports = { createApiKey, listApiKeys, revokeApiKey, findApiKey, touchApiKey, API_KEY_PREFIX: PREFIX };
