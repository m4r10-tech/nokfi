/**
 * db/shares.js — enlaces de solo lectura para la gestoría (sesión 4).
 *
 * El enlace (…/compartido/<token>) se muestra UNA vez al crearlo; se guarda
 * solo el hash SHA-256 del token (como las sesiones y las claves de API).
 * Caducan (7–365 días) y se pueden revocar en cualquier momento.
 */

'use strict';

const crypto = require('crypto');
const { getDB } = require('./database');

const MAX_ACTIVE = 5;
const DAYS = [7, 30, 90, 365];
const hash = (t) => crypto.createHash('sha256').update(t).digest('hex');

function createShareLink(license_id, { label, days }) {
  const db = getDB();
  const active = db.prepare("SELECT COUNT(*) c FROM share_links WHERE license_id = ? AND revoked_at IS NULL AND expires_at > datetime('now')").get(license_id).c;
  if (active >= MAX_ACTIVE) return { error: 'too_many_links' };
  const d = DAYS.includes(Number(days)) ? Number(days) : 30;
  const token = crypto.randomBytes(24).toString('base64url');
  const info = db.prepare(`INSERT INTO share_links (license_id, label, token_hash, prefix, expires_at)
    VALUES (?, ?, ?, ?, datetime('now', ?))`).run(license_id, String(label || '').slice(0, 60), hash(token), token.slice(0, 6), `+${d} days`);
  return { id: Number(info.lastInsertRowid), token, ...getShareLink(license_id, Number(info.lastInsertRowid)) };
}

function getShareLink(license_id, id) {
  return getDB().prepare('SELECT id, label, prefix, expires_at, created_at, last_used_at, revoked_at FROM share_links WHERE id = ? AND license_id = ?').get(id, license_id) || null;
}

function listShareLinks(license_id) {
  return getDB().prepare(`
    SELECT id, label, prefix, expires_at, created_at, last_used_at, revoked_at,
           (revoked_at IS NULL AND expires_at > datetime('now')) AS active
    FROM share_links WHERE license_id = ? ORDER BY active DESC, created_at DESC LIMIT 30
  `).all(license_id).map(r => ({ ...r, active: !!r.active }));
}

function revokeShareLink(license_id, id) {
  return getDB().prepare("UPDATE share_links SET revoked_at = datetime('now') WHERE id = ? AND license_id = ? AND revoked_at IS NULL")
    .run(id, license_id).changes > 0;
}

/** Token en claro → enlace vigente (y marca el último uso), o null. */
function resolveShareToken(token) {
  if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{20,64}$/.test(token)) return null;
  const db = getDB();
  const row = db.prepare(`SELECT s.*, l.status FROM share_links s JOIN licenses l ON l.id = s.license_id
    WHERE s.token_hash = ? AND s.revoked_at IS NULL AND s.expires_at > datetime('now')`).get(hash(token));
  if (!row || row.status !== 'active') return null;
  db.prepare("UPDATE share_links SET last_used_at = datetime('now') WHERE id = ?").run(row.id);
  return row;
}

module.exports = { createShareLink, listShareLinks, revokeShareLink, resolveShareToken, DAYS };
