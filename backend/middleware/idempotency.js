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
 * Solo se guardan las respuestas correctas (2xx/3xx). S15: los errores (4xx y
 * 5xx) no hacen nada en el servidor y muchos dependen de su estado
 * (issuer_incomplete, status_conflict, cuota…): se libera la clave y el
 * reintento se ejecuta de verdad. Las claves de prueba (nk_test_) y las
 * reales no comparten espacio de claves.
 *
 * Ventana: 24 h; la emisión de facturas (POST /invoices, /rectify y la
 * herramienta issue_invoice del MCP) guarda la clave 30 días (S15, Q6), para
 * que un flujo que reprocese un pedido días después no emita otra factura.
 *
 * Va DESPUÉS de requireApiKey (necesita req.license y req.apiKey). S15b T4 (A6):
 * también en la emisión desde la web (POST /api/invoicing/invoices, tras
 * requireLicense, sin req.apiKey), con su propio espacio de claves y 30 días.
 */

'use strict';

const crypto = require('crypto');
const { getDB } = require('../db/database');

const STALE_MINUTES = 15; // una petición "en curso" más vieja que esto se da por perdida
const DEFAULT_TTL_HOURS = 24;
const INVOICE_TTL_HOURS = 30 * 24;

/** ¿Se guarda esta respuesta? Solo las correctas (S15). */
const cacheable = (status) => status < 400;

function isAsync(req) {
  return req.query?.async === 'true' || req.query?.async === '1' || /respond-async/i.test(req.get('Prefer') || '');
}

/** Middleware con una ventana propia (horas). `idempotency` es el de 24 h. */
function idempotencyFor({ hours = DEFAULT_TTL_HOURS } = {}) {
  return (req, res, next) => idempotent(req, res, next, hours);
}

function idempotency(req, res, next) { return idempotent(req, res, next, DEFAULT_TTL_HOURS); }

function idempotent(req, res, next, ttlHours) {
  const raw = req.get('Idempotency-Key');
  if (raw === undefined) return next();
  const k = String(raw).trim();
  if (!k || k.length > 255) {
    return res.status(400).json({ error: 'invalid_idempotency_key', message: 'Idempotency-Key debe tener entre 1 y 255 caracteres.' });
  }
  const license_id = req.license.id;
  // Con clave de API: espacio 'live' o 'test'. Desde la web (sesión, sin clave; S15b T4 A6): 'web'.
  const key = `${req.apiKey ? (req.apiKey.mode || 'live') : 'web'}:${k}`;
  const hash = crypto.createHash('sha256')
    .update(JSON.stringify([req.method, req.baseUrl + req.path, isAsync(req), req.body ?? null])).digest('hex');
  const db = getDB();

  const claim = () => db.prepare('INSERT OR IGNORE INTO idempotency_keys (license_id, idem_key, request_hash, ttl_hours) VALUES (?, ?, ?, ?)')
    .run(license_id, key, hash, ttlHours).changes > 0;

  if (!claim()) {
    const row = db.prepare('SELECT *, created_at < datetime(\'now\', ?) AS stale, created_at < datetime(\'now\', \'-\' || ttl_hours || \' hours\') AS expired FROM idempotency_keys WHERE license_id = ? AND idem_key = ?')
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
        if (!cacheable(s)) release();
        else db.prepare('UPDATE idempotency_keys SET status = ?, response_json = ? WHERE license_id = ? AND idem_key = ?')
          .run(s, JSON.stringify(body ?? null), license_id, key);
      } catch (e) { console.error('[IDEMPOTENCY]', e.message); }
    }
    return json(body);
  };
  res.on('close', () => { if (!stored) { try { release(); } catch (_) { /* nada */ } } });
  next();
}

/**
 * La misma idempotencia fuera de Express (herramientas del MCP): run() se
 * ejecuta una vez por clave y cuerpo; los reintentos devuelven lo guardado.
 * → { status, body, replayed? }
 */
async function runIdempotent({ license_id, mode = 'live', key, scope, payload, run, ttlHours = DEFAULT_TTL_HOURS }) {
  const k = String(key || '').trim();
  if (!k || k.length > 255) return { status: 400, body: { error: 'invalid_idempotency_key', message: 'idempotency_key debe tener entre 1 y 255 caracteres.' } };
  const idemKey = `${mode}:${k}`;
  const hash = crypto.createHash('sha256').update(JSON.stringify(['MCP', scope, payload ?? null])).digest('hex');
  const db = getDB();
  const claim = () => db.prepare('INSERT OR IGNORE INTO idempotency_keys (license_id, idem_key, request_hash, ttl_hours) VALUES (?, ?, ?, ?)').run(license_id, idemKey, hash, ttlHours).changes > 0;
  if (!claim()) {
    const row = db.prepare("SELECT *, created_at < datetime('now', '-' || ttl_hours || ' hours') AS expired FROM idempotency_keys WHERE license_id = ? AND idem_key = ?").get(license_id, idemKey);
    if (row?.expired) {
      db.prepare('DELETE FROM idempotency_keys WHERE license_id = ? AND idem_key = ?').run(license_id, idemKey);
      if (!claim()) return { status: 409, body: { error: 'idempotency_in_progress', message: 'Ya hay una petición en curso con esta clave.' } };
    } else if (row) {
      if (row.request_hash !== hash) return { status: 422, body: { error: 'idempotency_key_reused', message: 'Esta clave de idempotencia ya se usó con otra petición distinta.' } };
      if (row.status === null) return { status: 409, body: { error: 'idempotency_in_progress', message: 'Ya hay una petición en curso con esta clave.' } };
      return { status: row.status, body: JSON.parse(row.response_json), replayed: true };
    }
  }
  let out;
  try { out = await run(); } catch (e) { db.prepare('DELETE FROM idempotency_keys WHERE license_id = ? AND idem_key = ? AND status IS NULL').run(license_id, idemKey); throw e; }
  if (!cacheable(out.status)) db.prepare('DELETE FROM idempotency_keys WHERE license_id = ? AND idem_key = ? AND status IS NULL').run(license_id, idemKey);
  else db.prepare('UPDATE idempotency_keys SET status = ?, response_json = ? WHERE license_id = ? AND idem_key = ?').run(out.status, JSON.stringify(out.body ?? null), license_id, idemKey);
  return out;
}

module.exports = { idempotency, idempotencyFor, isAsync, runIdempotent, DEFAULT_TTL_HOURS, INVOICE_TTL_HOURS };
