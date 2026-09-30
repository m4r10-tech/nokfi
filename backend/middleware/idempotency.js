/**
 * middleware/idempotency.js — sesión 9 (API, Bloque 2): cabecera Idempotency-Key.
 *
 * Si una petición POST lleva `Idempotency-Key`, la primera respuesta se guarda
 * 24 h. Un reintento con la misma clave y el mismo cuerpo devuelve esa
 * respuesta (con `Idempotent-Replayed: true`) sin ejecutar ni gastar cuota otra
 * vez. En modo asíncrono devuelve el mismo job_id.
 *
 *   misma clave, otro cuerpo        → 422 idempotency_key_reused
 *   misma clave, aún en curso       → 409 idempotency_in_progress
 *
 * No se guardan los errores que merece la pena reintentar (5xx, 409 y 429):
 * con ellos la clave se libera y el reintento se ejecuta de verdad. Las claves
 * de prueba (nk_test_) y las reales no comparten espacio de claves.
 *
 * Va DESPUÉS de requireApiKey (necesita req.license y req.apiKey).
 */

'use strict';

const crypto = require('crypto');
const { getDB } = require('../db/database');

const STALE_MINUTES = 15; // una petición "en curso" más vieja que esto se da por perdida

function isAsync(req) {
  return req.query?.async === 'true' || req.query?.async === '1' || /respond-async/i.test(req.get('Prefer') || '');
}

function idempotency(req, res, next) {
  const raw = req.get('Idempotency-Key');
  if (raw === undefined) return next();
  const k = String(raw).trim();
  if (!k || k.length > 255) {
    return res.status(400).json({ error: 'invalid_idempotency_key', message: 'Idempotency-Key debe tener entre 1 y 255 caracteres.' });
  }
  const license_id = req.license.id;
  const key = `${req.apiKey.mode || 'live'}:${k}`;
  const hash = crypto.createHash('sha256')
    .update(JSON.stringify([req.method, req.baseUrl + req.path, isAsync(req), req.body ?? null])).digest('hex');
  const db = getDB();

  const claim = () => db.prepare('INSERT OR IGNORE INTO idempotency_keys (license_id, idem_key, request_hash) VALUES (?, ?, ?)')
    .run(license_id, key, hash).changes > 0;

  if (!claim()) {
    const row = db.prepare('SELECT *, created_at < datetime(\'now\', ?) AS stale, created_at < datetime(\'now\', \'-24 hours\') AS expired FROM idempotency_keys WHERE license_id = ? AND idem_key = ?')
      .get(`-${STALE_MINUTES} minutes`, license_id, key);
    const takeOver = row && (row.expired || (row.status === null && row.stale));
    if (takeOver) {
      db.prepare('DELETE FROM idempotency_keys WHERE license_id = ? AND idem_key = ?').run(license_id, key);
      if (!claim()) return res.status(409).json({ error: 'idempotency_in_progress', message: 'Ya hay una petición en curso con esta Idempotency-Key.' });
    } else if (row) {
      if (row.request_hash !== hash) {
        return res.status(422).json({ error: 'idempotency_key_reused', message: 'Esta Idempotency-Key ya se usó con otra petición distinta.' });
      }
      if (row.status === null) {
        return res.status(409).json({ error: 'idempotency_in_progress', message: 'Ya hay una petición en curso con esta Idempotency-Key. Espera a que termine.' });
      }
      res.set('Idempotent-Replayed', 'true');
      return res.status(row.status).json(JSON.parse(row.response_json));
    }
  }

  let stored = false;
  const release = () => db.prepare('DELETE FROM idempotency_keys WHERE license_id = ? AND idem_key = ? AND status IS NULL').run(license_id, key);
  const json = res.json.bind(res);
  res.json = (body) => {
    if (!stored) {
      stored = true;
      const s = res.statusCode;
      try {
        if (s >= 500 || s === 409 || s === 429) release();
        else db.prepare('UPDATE idempotency_keys SET status = ?, response_json = ? WHERE license_id = ? AND idem_key = ?')
          .run(s, JSON.stringify(body ?? null), license_id, key);
      } catch (e) { console.error('[IDEMPOTENCY]', e.message); }
    }
    return json(body);
  };
  res.on('close', () => { if (!stored) { try { release(); } catch (_) { /* nada */ } } });
  next();
}

module.exports = { idempotency, isAsync };
