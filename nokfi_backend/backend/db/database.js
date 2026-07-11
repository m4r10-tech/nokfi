/**
 * db/database.js
 *
 * Capa de acceso a datos — SQLite vía better-sqlite3.
 *
 * Modelo de licencia vigente (ver nokfi_proyecto.md secciones 5, 15):
 *   - Una licencia = un email + una clave XXXX-XXXX-XXXX-XXXX + UN device fingerprint fijo
 *   - Sin límite configurable de dispositivos: siempre es 1
 *   - El reseteo de dispositivo está limitado a 1 vez/año, controlado por last_device_reset
 *
 * Tablas:
 *   licenses        → clave, email, estado, plan, fingerprint vinculado
 *   sessions        → tokens de sesión activos
 *   payment_events  → eventos de pago recibidos por webhook (idempotencia + histórico)
 *   audit_log       → registro de eventos de seguridad
 *   reset_tokens    → tokens temporales de un solo uso (reveal de clave / reseteo de dispositivo)
 */

'use strict';

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'nokfi.db');

/** @type {import('better-sqlite3').Database} */
let db = null;

/* ════════════════════════════════════════════════════════════
   INICIALIZACIÓN
════════════════════════════════════════════════════════════ */

function initDB() {
  return new Promise((resolve, reject) => {
    try {
      const dir = path.dirname(DB_PATH);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

      db = new Database(DB_PATH);
      db.pragma('journal_mode = WAL');
      db.pragma('foreign_keys = ON');
      db.pragma('busy_timeout = 5000');

      db.exec(`
        CREATE TABLE IF NOT EXISTS licenses (
          id                  INTEGER PRIMARY KEY AUTOINCREMENT,
          key                 TEXT    NOT NULL UNIQUE,
          email               TEXT    NOT NULL,
          status              TEXT    NOT NULL DEFAULT 'active'
                                       CHECK(status IN ('active','suspended','revoked')),
          plan                TEXT    NOT NULL DEFAULT 'basic'
                                       CHECK(plan IN ('basic','pro')),
          device_fingerprint  TEXT    DEFAULT NULL,
          device_name         TEXT    DEFAULT NULL,
          device_registered_at TEXT   DEFAULT NULL,
          last_device_reset   TEXT    DEFAULT NULL,
          payment_provider    TEXT    DEFAULT NULL
                                       CHECK(payment_provider IN ('stripe','paypal','coinbase','revolut',NULL)),
          payment_ref         TEXT    DEFAULT NULL,
          amount_eur          REAL    DEFAULT NULL,
          notes               TEXT    DEFAULT '',
          created_at          TEXT    NOT NULL DEFAULT (datetime('now')),
          created_by          TEXT    DEFAULT 'system'
        );

        CREATE TABLE IF NOT EXISTS sessions (
          id           INTEGER PRIMARY KEY AUTOINCREMENT,
          token        TEXT    NOT NULL UNIQUE,
          license_id   INTEGER NOT NULL REFERENCES licenses(id) ON DELETE CASCADE,
          fingerprint  TEXT    NOT NULL,
          created_at   TEXT    NOT NULL DEFAULT (datetime('now')),
          expires_at   TEXT    NOT NULL,
          last_used    TEXT    NOT NULL DEFAULT (datetime('now')),
          ip           TEXT    DEFAULT ''
        );

        CREATE TABLE IF NOT EXISTS payment_events (
          id            INTEGER PRIMARY KEY AUTOINCREMENT,
          provider      TEXT    NOT NULL CHECK(provider IN ('stripe','paypal','coinbase','revolut')),
          event_id      TEXT    NOT NULL,
          event_type    TEXT    NOT NULL,
          license_id    INTEGER REFERENCES licenses(id) ON DELETE SET NULL,
          amount_eur    REAL    DEFAULT NULL,
          raw_payload   TEXT    DEFAULT NULL,
          processed     INTEGER NOT NULL DEFAULT 0,
          received_at   TEXT    NOT NULL DEFAULT (datetime('now')),
          UNIQUE(provider, event_id)
        );

        CREATE TABLE IF NOT EXISTS reset_tokens (
          id          INTEGER PRIMARY KEY AUTOINCREMENT,
          token       TEXT    NOT NULL UNIQUE,
          purpose     TEXT    NOT NULL CHECK(purpose IN ('reveal_key','device_reset')),
          license_id  INTEGER NOT NULL REFERENCES licenses(id) ON DELETE CASCADE,
          used        INTEGER NOT NULL DEFAULT 0,
          created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
          expires_at  TEXT    NOT NULL
        );

        CREATE TABLE IF NOT EXISTS audit_log (
          id          INTEGER PRIMARY KEY AUTOINCREMENT,
          event       TEXT    NOT NULL,
          license_id  INTEGER DEFAULT NULL,
          fingerprint TEXT    DEFAULT NULL,
          ip          TEXT    DEFAULT NULL,
          detail      TEXT    DEFAULT NULL,
          ts          TEXT    NOT NULL DEFAULT (datetime('now'))
        );

        CREATE INDEX IF NOT EXISTS idx_licenses_key        ON licenses(key);
        CREATE INDEX IF NOT EXISTS idx_licenses_email       ON licenses(email);
        CREATE INDEX IF NOT EXISTS idx_licenses_fingerprint ON licenses(device_fingerprint);
        CREATE INDEX IF NOT EXISTS idx_sessions_token       ON sessions(token);
        CREATE INDEX IF NOT EXISTS idx_sessions_exp         ON sessions(expires_at);
        CREATE INDEX IF NOT EXISTS idx_payment_provider_evt ON payment_events(provider, event_id);
        CREATE INDEX IF NOT EXISTS idx_reset_tokens_token    ON reset_tokens(token);
        CREATE INDEX IF NOT EXISTS idx_audit_license         ON audit_log(license_id);
        CREATE INDEX IF NOT EXISTS idx_audit_ts              ON audit_log(ts);
      `);

      console.log('✅  Base de datos inicializada en', DB_PATH);
      resolve(db);
    } catch (err) {
      reject(err);
    }
  });
}

function getDB() {
  if (!db) throw new Error('Base de datos no inicializada — llama a initDB() primero');
  return db;
}

/* ════════════════════════════════════════════════════════════
   LICENCIAS
════════════════════════════════════════════════════════════ */

/** Genera una clave criptográficamente aleatoria con formato XXXX-XXXX-XXXX-XXXX (hex mayúsculas) */
function generateLicenseKey() {
  const seg = () => crypto.randomBytes(2).toString('hex').toUpperCase();
  return `${seg()}-${seg()}-${seg()}-${seg()}`;
}

/**
 * Crea una licencia nueva. NO vincula dispositivo todavía — eso ocurre en la activación.
 * Se invoca tras la confirmación de un pago (webhook) o manualmente desde el admin.
 */
function createLicense({ email, plan = 'basic', payment_provider = null, payment_ref = null, amount_eur = null, notes = '', created_by = 'system' }) {
  if (!email || typeof email !== 'string') {
    throw new Error('email es obligatorio para crear una licencia');
  }
  const db = getDB();
  let key;
  do { key = generateLicenseKey(); }
  while (db.prepare('SELECT id FROM licenses WHERE key = ?').get(key));

  const result = db.prepare(`
    INSERT INTO licenses (key, email, plan, payment_provider, payment_ref, amount_eur, notes, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(key.toUpperCase(), email.trim().toLowerCase(), plan, payment_provider, payment_ref, amount_eur, notes, created_by);

  return getLicenseById(result.lastInsertRowid);
}

function getLicenseByKey(key) {
  return getDB().prepare('SELECT * FROM licenses WHERE key = ?').get(String(key).trim().toUpperCase());
}

function getLicenseById(id) {
  return getDB().prepare('SELECT * FROM licenses WHERE id = ?').get(id);
}

function getLicenseByEmailAndKey(email, key) {
  return getDB().prepare('SELECT * FROM licenses WHERE email = ? AND key = ?')
    .get(String(email).trim().toLowerCase(), String(key).trim().toUpperCase());
}

/** Busca una licencia por su referencia de pago (usado en gestión de chargebacks) */
function getLicenseByPaymentRef(payment_provider, payment_ref) {
  return getDB().prepare('SELECT * FROM licenses WHERE payment_provider = ? AND payment_ref = ?')
    .get(payment_provider, payment_ref);
}

function getAllLicenses() {
  return getDB().prepare('SELECT * FROM licenses ORDER BY created_at DESC').all();
}

function updateLicense(id, fields) {
  const allowed = ['status', 'plan', 'notes', 'email'];
  const setClauses = [];
  const vals = [];
  for (const key of allowed) {
    if (fields[key] !== undefined) {
      setClauses.push(`${key} = ?`);
      vals.push(fields[key]);
    }
  }
  if (!setClauses.length) return getLicenseById(id);
  vals.push(id);
  getDB().prepare(`UPDATE licenses SET ${setClauses.join(', ')} WHERE id = ?`).run(...vals);
  return getLicenseById(id);
}

function deleteLicense(id) {
  return getDB().prepare('DELETE FROM licenses WHERE id = ?').run(id);
}

/* ── Vinculación de dispositivo (fingerprint único, fijo) ── */

/** Vincula el fingerprint a la licencia. Solo debe llamarse si la licencia no tiene dispositivo aún. */
function bindDevice(license_id, fingerprint, device_name = '') {
  getDB().prepare(`
    UPDATE licenses
    SET device_fingerprint = ?, device_name = ?, device_registered_at = datetime('now')
    WHERE id = ?
  `).run(fingerprint, device_name || '', license_id);
  return getLicenseById(license_id);
}

/** Libera el dispositivo vinculado (usado en el flujo de reseteo) y marca la fecha de reseteo */
function resetDevice(license_id) {
  getDB().prepare(`
    UPDATE licenses
    SET device_fingerprint = NULL, device_name = NULL, device_registered_at = NULL,
        last_device_reset = datetime('now')
    WHERE id = ?
  `).run(license_id);
  // Cualquier sesión asociada a este dispositivo deja de ser válida
  getDB().prepare(`DELETE FROM sessions WHERE license_id = ?`).run(license_id);
  return getLicenseById(license_id);
}

/** Comprueba si la licencia puede resetear dispositivo (máx. 1 vez/año) */
function canResetDevice(license) {
  if (!license.last_device_reset) return true;
  const last = new Date(license.last_device_reset);
  const oneYearLater = new Date(last);
  oneYearLater.setFullYear(oneYearLater.getFullYear() + 1);
  return new Date() >= oneYearLater;
}

/* ════════════════════════════════════════════════════════════
   SESIONES
════════════════════════════════════════════════════════════ */

const SESSION_TTL_DAYS = 30;

function createSession(license_id, fingerprint, ip = '') {
  const token = crypto.randomBytes(32).toString('hex');
  const expires = new Date();
  expires.setDate(expires.getDate() + SESSION_TTL_DAYS);

  getDB().prepare(`
    INSERT INTO sessions (token, license_id, fingerprint, expires_at, ip)
    VALUES (?, ?, ?, ?, ?)
  `).run(token, license_id, fingerprint, expires.toISOString(), ip);

  return { token, expires_at: expires.toISOString() };
}

/**
 * ⚠️ AUDITORÍA DE SEGURIDAD — análisis de timing attack en la búsqueda de tokens.
 * A diferencia de ADMIN_SECRET (un único secreto fijo, comparado con
 * crypto.timingSafeEqual en admin.js), aquí la búsqueda es un lookup por
 * índice de base de datos contra MUCHOS tokens válidos simultáneos, cada
 * uno con 256 bits de entropía (32 bytes aleatorios). No hay "un único
 * valor correcto" contra el que medir tiempos de forma útil, y forzar una
 * comparación en tiempo constante exigiría escanear toda la tabla de
 * sesiones en cada petición — coste real (degradación de rendimiento,
 * posible vector de DoS al crecer las sesiones) sin beneficio de
 * seguridad práctico dado el tamaño del espacio de claves. Se mantiene
 * el lookup indexado tal cual.
 */
function getSession(token) {
  const db = getDB();
  const session = db.prepare(
    "SELECT * FROM sessions WHERE token = ? AND expires_at > datetime('now')"
  ).get(token);
  if (!session) return null;
  db.prepare("UPDATE sessions SET last_used = datetime('now') WHERE token = ?").run(token);
  return session;
}

function deleteSession(token) {
  return getDB().prepare('DELETE FROM sessions WHERE token = ?').run(token);
}

function deleteSessionsForLicense(license_id) {
  return getDB().prepare('DELETE FROM sessions WHERE license_id = ?').run(license_id);
}

function cleanExpiredSessions() {
  return getDB().prepare("DELETE FROM sessions WHERE expires_at < datetime('now')").run().changes;
}

/* ════════════════════════════════════════════════════════════
   RESET TOKENS (revelación de clave / reseteo de dispositivo)
════════════════════════════════════════════════════════════ */

function createResetToken(license_id, purpose, ttlMinutes = 15) {
  const token = crypto.randomBytes(32).toString('hex');
  const expires = new Date();
  expires.setMinutes(expires.getMinutes() + ttlMinutes);

  getDB().prepare(`
    INSERT INTO reset_tokens (token, purpose, license_id, expires_at)
    VALUES (?, ?, ?, ?)
  `).run(token, purpose, license_id, expires.toISOString());

  return { token, expires_at: expires.toISOString() };
}

function consumeResetToken(token, purpose) {
  const db = getDB();
  const row = db.prepare(`
    SELECT * FROM reset_tokens
    WHERE token = ? AND purpose = ? AND used = 0 AND expires_at > datetime('now')
  `).get(token, purpose);
  if (!row) return null;
  db.prepare('UPDATE reset_tokens SET used = 1 WHERE id = ?').run(row.id);
  return row;
}

/* ════════════════════════════════════════════════════════════
   PAGOS (idempotencia de webhooks)
════════════════════════════════════════════════════════════ */

/** Devuelve true si este evento de pago ya fue procesado (evita doble generación de licencia) */
function isPaymentEventProcessed(provider, event_id) {
  const row = getDB().prepare(
    'SELECT processed FROM payment_events WHERE provider = ? AND event_id = ?'
  ).get(provider, event_id);
  return !!row && row.processed === 1;
}

function recordPaymentEvent({ provider, event_id, event_type, license_id = null, amount_eur = null, raw_payload = null, processed = false }) {
  const db = getDB();
  const existing = db.prepare(
    'SELECT id FROM payment_events WHERE provider = ? AND event_id = ?'
  ).get(provider, event_id);

  if (existing) {
    db.prepare(`
      UPDATE payment_events SET processed = ?, license_id = COALESCE(?, license_id)
      WHERE id = ?
    `).run(processed ? 1 : 0, license_id, existing.id);
    return existing.id;
  }

  const result = db.prepare(`
    INSERT INTO payment_events (provider, event_id, event_type, license_id, amount_eur, raw_payload, processed)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(provider, event_id, event_type, license_id, amount_eur, raw_payload, processed ? 1 : 0);

  return result.lastInsertRowid;
}

/* ════════════════════════════════════════════════════════════
   AUDIT LOG
════════════════════════════════════════════════════════════ */

function audit(event, { license_id = null, fingerprint = null, ip = null, detail = null } = {}) {
  try {
    getDB().prepare(`
      INSERT INTO audit_log (event, license_id, fingerprint, ip, detail)
      VALUES (?, ?, ?, ?, ?)
    `).run(event, license_id, fingerprint, ip, detail);
  } catch (e) {
    console.error('[AUDIT ERROR]', e.message);
  }
}

/* ════════════════════════════════════════════════════════════
   MÉTRICAS / STATS (panel admin — sección 16 del proyecto)
════════════════════════════════════════════════════════════ */

/**
 * ⚠️ AUDITORÍA DE SEGURIDAD — validación explícita de periodDays.
 * Antes se interpolaba directamente en el SQL confiando en que
 * `Number(periodDays) || 30` neutralizara cualquier valor no numérico
 * (cierto hoy, pero es una protección implícita y frágil: un futuro
 * cambio en esa línea podría reabrir una inyección SQL sin que nadie
 * se diera cuenta). Ahora se valida explícitamente como entero positivo
 * dentro de un rango razonable, con un comentario que deja clara la
 * intención — no se puede quitar esta validación por accidente sin
 * que sea obvio que se está retirando una guarda de seguridad.
 */
function getStats(periodDays = 30) {
  const db = getDB();

  const parsedDays = parseInt(periodDays, 10);
  const safeDays = (Number.isInteger(parsedDays) && parsedDays > 0 && parsedDays <= 3650)
    ? parsedDays
    : 30;
  const since = `datetime('now', '-${safeDays} days')`;

  const total_licenses = db.prepare('SELECT COUNT(*) c FROM licenses').get().c;
  const active = db.prepare("SELECT COUNT(*) c FROM licenses WHERE status = 'active'").get().c;
  const suspended = db.prepare("SELECT COUNT(*) c FROM licenses WHERE status = 'suspended'").get().c;
  const revoked = db.prepare("SELECT COUNT(*) c FROM licenses WHERE status = 'revoked'").get().c;

  const activationsToday = db.prepare(
    "SELECT COUNT(*) c FROM licenses WHERE date(created_at) = date('now')"
  ).get().c;
  const activationsWeek = db.prepare(
    "SELECT COUNT(*) c FROM licenses WHERE created_at >= datetime('now', '-7 days')"
  ).get().c;
  const activationsMonth = db.prepare(
    "SELECT COUNT(*) c FROM licenses WHERE created_at >= datetime('now', '-30 days')"
  ).get().c;

  const revenueTotal = db.prepare(
    'SELECT COALESCE(SUM(amount_eur), 0) s FROM licenses WHERE amount_eur IS NOT NULL'
  ).get().s;
  const revenuePeriod = db.prepare(
    `SELECT COALESCE(SUM(amount_eur), 0) s FROM licenses WHERE amount_eur IS NOT NULL AND created_at >= ${since}`
  ).get().s;

  const dailySeries = db.prepare(`
    SELECT date(created_at) AS day, COUNT(*) AS activations, COALESCE(SUM(amount_eur), 0) AS revenue
    FROM licenses
    WHERE created_at >= ${since}
    GROUP BY date(created_at)
    ORDER BY day ASC
  `).all();

  return {
    licenses: { total: total_licenses, active, suspended, revoked },
    activations: { today: activationsToday, week: activationsWeek, month: activationsMonth },
    revenue: { total_eur: revenueTotal, period_eur: revenuePeriod },
    daily_series: dailySeries,
    recent_events: db.prepare('SELECT * FROM audit_log ORDER BY ts DESC LIMIT 25').all()
  };
}

/**
 * ⚠️ AUDITORÍA DE SEGURIDAD — protege la cuota compartida de Gemini.
 * El free tier de Gemini es ~1.500 peticiones/día para TODO el proyecto,
 * compartida entre todos los clientes de Nokfi. Sin un límite por
 * licencia, un solo cliente con uso intensivo (malicioso o no) podría
 * agotar la cuota del día para el resto. Se usa el propio audit_log,
 * que ya registra cada análisis generado (evento AI_ANALYSIS_GENERATED),
 * así que no hace falta una tabla nueva.
 */
function countAiAnalysesToday(license_id) {
  const row = getDB().prepare(`
    SELECT COUNT(*) c FROM audit_log
    WHERE event = 'AI_ANALYSIS_GENERATED'
      AND license_id = ?
      AND date(ts) = date('now')
  `).get(license_id);
  return row.c;
}

module.exports = {
  initDB,
  getDB,
  generateLicenseKey,
  createLicense,
  getLicenseByKey,
  getLicenseById,
  getLicenseByEmailAndKey,
  getLicenseByPaymentRef,
  getAllLicenses,
  updateLicense,
  deleteLicense,
  bindDevice,
  resetDevice,
  canResetDevice,
  createSession,
  getSession,
  deleteSession,
  deleteSessionsForLicense,
  cleanExpiredSessions,
  createResetToken,
  consumeResetToken,
  isPaymentEventProcessed,
  recordPaymentEvent,
  countAiAnalysesToday,
  audit,
  getStats
};
