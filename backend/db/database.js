/**
 * db/database.js
 *
 * Capa de acceso a datos — SQLite vía better-sqlite3.
 *
 * Modelo de licencia vigente (tras Fase 2 — migración fingerprint → contraseña):
 *   - Una licencia = un email + una clave XXXX-XXXX-XXXX-XXXX + UNA contraseña
 *     elegida por el usuario (scrypt). No hay device-fingerprint.
 *   - El anti-sharing que aportaba el fingerprint se delega en la cuota diaria
 *     de IA por licencia, ahora **tiered por plan** (mini 30 / pro 80 / max 200
 *     análisis/día — ver aiQuotaForPlan) en backend/routes/proxy.js.
 *   - El reseteo de CONTRASEÑA por email está limitado a 1 vez/año
 *     (campo last_password_reset) como anti-abuso del flujo por email.
 *   - Modelo de billing (Fase 3): suscripción mensual mini/pro/max vía Stripe,
 *     con Stripe Customer Portal para cancelar/mejorar plan. Las licencias
 *     lifetime previas se migran a plan='max', billing_model='legacy' (active,
 *     sin cobro ni expiración). status añade 'expired' para suscripciones fin.
 *
 * Tablas:
 *   licenses        → clave, email, estado (active|suspended|revoked|expired),
 *                     plan (mini|pro|max), billing_model (subscription|legacy),
 *                     password_hash (scrypt), campos stripe (customer_id /
 *                     subscription_id / current_period_ends_at / cancel_at_period_end)
 *   sessions        → tokens de sesión activos (ya sin fingerprint)
 *   payment_events  → eventos de pago recibidos por webhook (idempotencia + histórico)
 *   audit_log       → registro de eventos de seguridad (fingerprint conservado para
 *                     la historia, pero escribe NULL en adelante)
 *   reset_tokens    → tokens temporales de un solo uso (reveal de clave / reset password)
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
          id                        INTEGER PRIMARY KEY AUTOINCREMENT,
          key                       TEXT    NOT NULL UNIQUE,
          email                     TEXT    NOT NULL,
          status                    TEXT    NOT NULL DEFAULT 'active'
                                              CHECK(status IN ('active','suspended','revoked','expired')),
          plan                      TEXT    NOT NULL DEFAULT 'mini'
                                              CHECK(plan IN ('mini','pro','max')),
          billing_model             TEXT    NOT NULL DEFAULT 'subscription'
                                              CHECK(billing_model IN ('subscription','legacy')),
          password_hash            TEXT    DEFAULT NULL,
          device_name               TEXT    DEFAULT NULL,
          last_password_reset       TEXT    DEFAULT NULL,
          stripe_customer_id        TEXT    DEFAULT NULL,
          stripe_subscription_id    TEXT    DEFAULT NULL,
          current_period_ends_at    TEXT    DEFAULT NULL,
          cancel_at_period_end      INTEGER NOT NULL DEFAULT 0,
          payment_provider          TEXT    DEFAULT NULL
                                              CHECK(payment_provider IN ('stripe','paypal','coinbase','revolut',NULL)),
          payment_ref               TEXT    DEFAULT NULL,
          amount_eur                REAL    DEFAULT NULL,
          notes                     TEXT    DEFAULT '',
          created_at                TEXT    NOT NULL DEFAULT (datetime('now')),
          created_by                TEXT    DEFAULT 'system'
        );

        CREATE TABLE IF NOT EXISTS sessions (
          id           INTEGER PRIMARY KEY AUTOINCREMENT,
          token        TEXT    NOT NULL UNIQUE,
          license_id   INTEGER NOT NULL REFERENCES licenses(id) ON DELETE CASCADE,
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
          purpose     TEXT    NOT NULL CHECK(purpose IN ('reveal_key','password_reset')),
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

        CREATE INDEX IF NOT EXISTS idx_licenses_key          ON licenses(key);
        CREATE INDEX IF NOT EXISTS idx_licenses_email        ON licenses(email);
        CREATE INDEX IF NOT EXISTS idx_sessions_token        ON sessions(token);
        CREATE INDEX IF NOT EXISTS idx_sessions_exp          ON sessions(expires_at);
        CREATE INDEX IF NOT EXISTS idx_payment_provider_evt  ON payment_events(provider, event_id);
        CREATE INDEX IF NOT EXISTS idx_reset_tokens_token     ON reset_tokens(token);
        CREATE INDEX IF NOT EXISTS idx_audit_license          ON audit_log(license_id);
        CREATE INDEX IF NOT EXISTS idx_audit_ts               ON audit_log(ts);

        CREATE INDEX IF NOT EXISTS idx_sessions_license  ON sessions(license_id);
      `);

      /* ──────────────────────────────────────────────────────────
         MIGRACIÓN Fase 2 (fingerprint → password) — idempotente
         Solo actúa si detecta columnas/tablas del esquema viejo.
         En installs nuevos es un completo no-op (las columnas ya
         no existen). Requiere SQLite ≥ 3.35 (ALTER TABLE DROP COLUMN),
         garantizado por better-sqlite3 ^11.3.0 (SQLite 3.43+).
      ────────────────────────────────────────────────────────── */
      runFingerprintMigration(db);
      runSubscriptionMigration(db);

      console.log('✅  Base de datos inicializada en', DB_PATH);
      resolve(db);
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Migración del esquema viejo (fingerprint) al nuevo (password_hash).
 * Idempotente y guardada por detección: cada paso comprueba si la columna/
 * constraint vieja sigue presente antes de tocar nada, así puede ejecutarse
 * contra una BD nueva (no-op) o contra una migrada (no-op) o contra la vieja
 * (aplica los cambios) sin errores.
 */
function runFingerprintMigration(database) {
  const columnsOf = (table) => database.prepare(`PRAGMA table_info(${table})`).all().map(c => c.name);

  const migrate = database.transaction(() => {
    /* --- licenses: añadir password_hash + last_password_reset, quitar las
           tres columnas de fingerprint. Índice idx_licenses_fingerprint se
           elimina ANTES de DROP COLUMN (SQLite rechaza DROP de columnas
           indexadas). --- */
    const licenseCols = new Set(columnsOf('licenses'));
    if (licenseCols.has('device_fingerprint')) {
      // Solo en esquema viejo: garantizar las columnas nuevas antes de quitar nada
      if (!licenseCols.has('password_hash')) {
        database.exec(`ALTER TABLE licenses ADD COLUMN password_hash TEXT DEFAULT NULL`);
      }
      if (!licenseCols.has('last_password_reset')) {
        database.exec(`ALTER TABLE licenses ADD COLUMN last_password_reset TEXT DEFAULT NULL`);
      }
      // Orden: soltar índice primero, luego columnas
      database.exec(`DROP INDEX IF EXISTS idx_licenses_fingerprint`);
      database.exec(`ALTER TABLE licenses DROP COLUMN device_fingerprint`);
      if (licenseCols.has('device_registered_at')) {
        database.exec(`ALTER TABLE licenses DROP COLUMN device_registered_at`);
      }
      if (licenseCols.has('last_device_reset')) {
        database.exec(`ALTER TABLE licenses DROP COLUMN last_device_reset`);
      }
      console.log('✅  Migración licenses: fingerprint → password_hash');
    }

    /* --- sessions: quitar fingerprint (era NOT NULL en el esquema viejo) --- */
    if (!columnsOf('sessions').includes('fingerprint')) {
      // ya migrado o fresh
    } else {
      database.exec(`ALTER TABLE sessions DROP COLUMN fingerprint`);
      console.log('✅  Migración sessions: columna fingerprint eliminada');
    }

    /* --- reset_tokens: cambiar CHECK purpose de 'device_reset' a 'password_reset'.
           SQLite no permite ALTER de un CHECK; se reconstruye la tabla (rename
           vieja, crear nueva con el CHECK nuevo, copiar filas válidas — solo
           'reveal_key' sobrevive; los 'device_reset' residuales ya estarían
           expirados de cualquier forma). --- */
    const resetTokensSql = database
      .prepare(`SELECT sql FROM sqlite_master WHERE type='table' AND name='reset_tokens'`)
      .get();
    if (resetTokensSql && resetTokensSql.sql && resetTokensSql.sql.includes('device_reset')) {
      database.exec(`ALTER TABLE reset_tokens RENAME TO reset_tokens_old`);
      database.exec(`
        CREATE TABLE reset_tokens (
          id          INTEGER PRIMARY KEY AUTOINCREMENT,
          token       TEXT    NOT NULL UNIQUE,
          purpose     TEXT    NOT NULL CHECK(purpose IN ('reveal_key','password_reset')),
          license_id  INTEGER NOT NULL REFERENCES licenses(id) ON DELETE CASCADE,
          used        INTEGER NOT NULL DEFAULT 0,
          created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
          expires_at  TEXT    NOT NULL
        )
      `);
      // Solo copiamos tokens de 'reveal_key' (los 'device_reset' no tienen
      // equivalente en el nuevo modelo y, además, viven 15-30 min — ya caducados)
      database.exec(`
        INSERT INTO reset_tokens (id, token, purpose, license_id, used, created_at, expires_at)
        SELECT id, token, purpose, license_id, used, created_at, expires_at
        FROM reset_tokens_old WHERE purpose = 'reveal_key'
      `);
      database.exec(`DROP TABLE reset_tokens_old`);
      // Recrear el índice sobre la tabla recién construida
      database.exec(`CREATE INDEX IF NOT EXISTS idx_reset_tokens_token ON reset_tokens(token)`);
      console.log('✅  Migración reset_tokens: CHECK device_reset → password_reset');
    }
  });

  migrate();
}

/**
 * Migración Fase 3 (pago único lifetime → suscripción mensual mini/pro/max).
 * Idempotente y guardada por detección: inspecciona el DDL almacenado de
 * `licenses` y solo actúa si el esquema sigue siendo el viejo (CHECK de plan
 * con 'basic', CHECK de status sin 'expired') o si faltan columnas de stripe.
 * En un install fresco (el `CREATE TABLE IF NOT EXISTS` ya crea el esquema
 * nuevo) es un completo no-op.
 *
 * El cambio de CHECK no se puede hacer con ALTER TABLE (SQLite no permite
 * modificar una constraint): se reconstruye la tabla — renombrar la vieja,
 * crear la nueva con los CHECK ampliados, copiar las filas mapeando `plan` y
 * `billing_model`, borrar la vieja y recrear sus índices. `foreign_keys` se
 * desactiva durante el rebuild — la pragma es no-op dentro de una transacción,
 * por eso se togglea fuera de ella — y se valida con `PRAGMA foreign_key_check`
 * antes de commit (lanza si algo quedó huérfano).
 *
 * Migración de datos: las licencias lifetime existentes (plan 'basic' o 'pro')
 * se "grandfather" al tier más alto — plan='max', billing_model='legacy',
 * status se mantiene, SIN stripe_customer_id → no se cobran ni expiran. Si más
 * adelante se enlazan a una suscripción real de Stripe, el webhook actualiza
 * los campos stripe y billing_model='subscription'.
 */
function runSubscriptionMigration(database) {
  const columnsOf = (table) => database.prepare(`PRAGMA table_info(${table})`).all().map(c => c.name);

  const row = database
    .prepare(`SELECT sql FROM sqlite_master WHERE type='table' AND name='licenses'`)
    .get();
  if (!row || !row.sql) return; // la tabla no existe (no debería pasar)

  const schema = row.sql;
  const hasNewPlanCheck   = /plan\s+IN\s*\(\s*'mini'\s*,\s*'pro'\s*,\s*'max'\s*\)/i.test(schema);
  const hasNewStatusCheck = /status\s+IN\s*\(\s*'active'\s*,\s*'suspended'\s*,\s*'revoked'\s*,\s*'expired'\s*\)/i.test(schema);
  const cols = columnsOf('licenses');
  const missingColumns = ['billing_model', 'stripe_customer_id', 'stripe_subscription_id', 'current_period_ends_at', 'cancel_at_period_end']
    .filter(c => !cols.includes(c));

  // Esquema ya al día y con todas las columnas → no-op (fresco o ya migrado)
  if (hasNewPlanCheck && hasNewStatusCheck && missingColumns.length === 0) return;

  database.pragma('foreign_keys = OFF');
  try {
    const migrate = database.transaction(() => {
      if (!hasNewPlanCheck || !hasNewStatusCheck) {
        // ── Rebuild completo: CHECKs viejos → nuevos, con columnas stripe ──
        // Patrón canónico de SQLite para cambiar un CHECK (ALTER no lo permite):
        // crear la tabla nueva bajo un nombre TEMPORAL, copiar, DROP la original
        // y RENAME temp→original. Lo importante de este orden (frente al naive
        // RENAME old→temp primero) es que las FK hijas (sessions, reset_tokens,
        // payment_events) referencian a `licenses` por NOMBRE — nunca renombramos
        // su target, así que con foreign_keys=OFF aguantan el momento en que el
        // nombre `licenses` no existe y, tras el RENAME, resuelven a la nueva.
        // (Si renombráramos licenses→temp primero, SQLite con legacy_alter_table=OFF
        // —el default— auto-reescribiría las FK hijas para apuntar a `temp`, y al
        // borrar `temp` quedarían colgadas → foreign_key_check falla.)
        database.exec(`
          CREATE TABLE licenses_new_sub (
            id                        INTEGER PRIMARY KEY AUTOINCREMENT,
            key                       TEXT    NOT NULL UNIQUE,
            email                     TEXT    NOT NULL,
            status                    TEXT    NOT NULL DEFAULT 'active'
                                                    CHECK(status IN ('active','suspended','revoked','expired')),
            plan                      TEXT    NOT NULL DEFAULT 'mini'
                                                    CHECK(plan IN ('mini','pro','max')),
            billing_model             TEXT    NOT NULL DEFAULT 'subscription'
                                                    CHECK(billing_model IN ('subscription','legacy')),
            password_hash             TEXT    DEFAULT NULL,
            device_name               TEXT    DEFAULT NULL,
            last_password_reset       TEXT    DEFAULT NULL,
            stripe_customer_id        TEXT    DEFAULT NULL,
            stripe_subscription_id    TEXT    DEFAULT NULL,
            current_period_ends_at    TEXT    DEFAULT NULL,
            cancel_at_period_end      INTEGER NOT NULL DEFAULT 0,
            payment_provider          TEXT    DEFAULT NULL
                                                    CHECK(payment_provider IN ('stripe','paypal','coinbase','revolut',NULL)),
            payment_ref               TEXT    DEFAULT NULL,
            amount_eur                REAL    DEFAULT NULL,
            notes                     TEXT    DEFAULT '',
            created_at                TEXT    NOT NULL DEFAULT (datetime('now')),
            created_by                TEXT    DEFAULT 'system'
          )
        `);
        // Copiar todas las filas. Las lifetime viejas (plan basic/pro) → max/legacy.
        // Los nuevos campos stripe se inicializan a NULL/0 (sin suscripción real).
        // El `id` se copia explícito para preservar las FK de sessions/audit/etc.
        database.exec(`
          INSERT INTO licenses_new_sub (
            id, key, email, status, plan, billing_model, password_hash, device_name,
            last_password_reset, stripe_customer_id, stripe_subscription_id,
            current_period_ends_at, cancel_at_period_end, payment_provider,
            payment_ref, amount_eur, notes, created_at, created_by
          )
          SELECT
            id, key, email, status,
            CASE WHEN plan IN ('basic','pro') THEN 'max' ELSE plan END,
            CASE WHEN plan IN ('basic','pro') THEN 'legacy' ELSE 'subscription' END,
            password_hash, device_name, last_password_reset,
            NULL, NULL, NULL, 0,
            payment_provider, payment_ref, amount_eur, notes, created_at, created_by
          FROM licenses
        `);
        database.exec(`DROP TABLE licenses`);
        database.exec(`ALTER TABLE licenses_new_sub RENAME TO licenses`);
        // Recrear índices — DROP TABLE los elimina y CREATE TABLE no los recrea
        database.exec(`CREATE INDEX IF NOT EXISTS idx_licenses_key ON licenses(key)`);
        database.exec(`CREATE INDEX IF NOT EXISTS idx_licenses_email ON licenses(email)`);
        // Validar integridad referencial tras el rebuild
        const fkProblems = database.prepare('PRAGMA foreign_key_check').all();
        if (fkProblems.length) {
          throw new Error('foreign_key_check falló tras rebuild de licenses: ' + JSON.stringify(fkProblems));
        }
        console.log('✅  Migración licenses (Fase 3): plan→mini/pro/max, status+expired, columnas stripe; lifetime→max/legacy');
      } else {
        // ── CHECKs ya nuevos pero faltan columnas (estado parcial) → ALTER ──
        for (const col of missingColumns) {
          if (col === 'billing_model') {
            database.exec(`ALTER TABLE licenses ADD COLUMN billing_model TEXT NOT NULL DEFAULT 'subscription' CHECK(billing_model IN ('subscription','legacy'))`);
          } else if (col === 'cancel_at_period_end') {
            database.exec(`ALTER TABLE licenses ADD COLUMN cancel_at_period_end INTEGER NOT NULL DEFAULT 0`);
          } else {
            database.exec(`ALTER TABLE licenses ADD COLUMN ${col} TEXT DEFAULT NULL`);
          }
        }
        console.log('✅  Migración licenses (Fase 3): añadidas columnas de suscripción');
      }
    });
    migrate();
  } finally {
    database.pragma('foreign_keys = ON');
  }
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
 * Crea una licencia nueva. Setea password_hash opcional si llega `password`
 * (para créditos manuales del admin con contraseña ya asignada). Se invoca
 * tras la confirmación de un pago (webhook de suscripción) o manualmente desde
 * el admin. Los campos stripe_* / billing_model / current_period_ends_at se
 * rellenan cuando la licencia nace de una suscripción real de Stripe (webhook);
 * las creadas a mano por el admin se marcan billing_model='legacy' (cortesías,
 * sin cobro recurrente ni expiración).
 */
function createLicense({
  email, plan = 'mini', payment_provider = null, payment_ref = null,
  amount_eur = null, notes = '', created_by = 'system', password = null,
  billing_model = 'subscription', stripe_customer_id = null,
  stripe_subscription_id = null, current_period_ends_at = null
}) {
  if (!email || typeof email !== 'string') {
    throw new Error('email es obligatorio para crear una licencia');
  }
  const db = getDB();
  let key;
  do { key = generateLicenseKey(); }
  while (db.prepare('SELECT id FROM licenses WHERE key = ?').get(key));

  const password_hash = password
    ? require('../utils/password').hashPassword(password)
    : null;

  const result = db.prepare(`
    INSERT INTO licenses (key, email, plan, billing_model, password_hash,
                          stripe_customer_id, stripe_subscription_id, current_period_ends_at,
                          payment_provider, payment_ref, amount_eur, notes, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(key.toUpperCase(), email.trim().toLowerCase(), plan, billing_model, password_hash,
         stripe_customer_id, stripe_subscription_id, current_period_ends_at,
         payment_provider, payment_ref, amount_eur, notes, created_by);

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

/* ── Contraseñas (sustituyen al device-fingerprint) ── */

/** Setea el hash de contraseña de una licencia (usado en activate, change-password, confirm-reset). */
function setPasswordHash(license_id, password_hash, device_name = null) {
  getDB().prepare(`
    UPDATE licenses SET password_hash = ?, device_name = COALESCE(?, device_name) WHERE id = ?
  `).run(password_hash, device_name, license_id);
  return getLicenseById(license_id);
}

/** Limpia la contraseña y cierra todas las sesiones — usado por admin reset-password */
function clearPasswordAndSessions(license_id) {
  getDB().prepare(`
    UPDATE licenses SET password_hash = NULL, last_password_reset = datetime('now') WHERE id = ?
  `).run(license_id);
  getDB().prepare(`DELETE FROM sessions WHERE license_id = ?`).run(license_id);
  return getLicenseById(license_id);
}

/** Comprueba si la licencia puede solicitar reset de contraseña por email (máx. 1 vez/año) */
function canResetPassword(license) {
  if (!license.last_password_reset) return true;
  const last = new Date(license.last_password_reset);
  const oneYearLater = new Date(last);
  oneYearLater.setFullYear(oneYearLater.getFullYear() + 1);
  return new Date() >= oneYearLater;
}

/** Marca la licencia como reseteada (llamado en confirm-password-reset) */
function markPasswordReset(license_id) {
  getDB().prepare(`UPDATE licenses SET last_password_reset = datetime('now') WHERE id = ?`).run(license_id);
  return getLicenseById(license_id);
}

/* ════════════════════════════════════════════════════════════
   SESIONES
════════════════════════════════════════════════════════════ */

const SESSION_TTL_DAYS = 30;

function createSession(license_id, ip = '') {
  const token = crypto.randomBytes(32).toString('hex');
  const expires = new Date();
  expires.setDate(expires.getDate() + SESSION_TTL_DAYS);

  getDB().prepare(`
    INSERT INTO sessions (token, license_id, expires_at, ip)
    VALUES (?, ?, ?, ?)
  `).run(token, license_id, expires.toISOString(), ip);

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

/**
 * Audit log. `fingerprint` es opcional: se conserva la columna para la historia,
 * pero el nuevo modelo no lo genera — se escribe NULL en adelante (D4).
 */
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
  const expired = db.prepare("SELECT COUNT(*) c FROM licenses WHERE status = 'expired'").get().c;

  const activationsToday = db.prepare(
    "SELECT COUNT(*) c FROM licenses WHERE date(created_at) = date('now')"
  ).get().c;
  const activationsWeek = db.prepare(
    "SELECT COUNT(*) c FROM licenses WHERE created_at >= datetime('now', '-7 days')"
  ).get().c;
  const activationsMonth = db.prepare(
    "SELECT COUNT(*) c FROM licenses WHERE created_at >= datetime('now', '-30 days')"
  ).get().c;

  // ── Desglose por plan + billing_model (Fase 3) ──
  const planCounts = db.prepare(`
    SELECT plan,
           SUM(CASE WHEN status='active' THEN 1 ELSE 0 END) AS active,
           COUNT(*) AS total
    FROM licenses GROUP BY plan
  `).all().reduce((acc, r) => { acc[r.plan] = { active: r.active, total: r.total }; return acc; }, {});
  const legacyCount = db.prepare("SELECT COUNT(*) c FROM licenses WHERE billing_model='legacy'").get().c;
  const subscriptionCount = db.prepare("SELECT COUNT(*) c FROM licenses WHERE billing_model='subscription'").get().c;

  // ── MRR: revenue recurrente mensual esperado = Σ(plan_price_mensual) sobre
  //    suscripciones ACTIVAS (billing_model='subscription' AND status='active').
  //    Las legacy no aportan MRR (ya pagadas, no recurrentes). Precios en EUR.
  const PLAN_PRICES = { mini: 10, pro: 25, max: 40 };
  const mrrRows = db.prepare(`
    SELECT plan, COUNT(*) c FROM licenses
    WHERE billing_model='subscription' AND status='active'
    GROUP BY plan
  `).all();
  let mrr_eur = 0;
  for (const r of mrrRows) mrr_eur += (PLAN_PRICES[r.plan] || 0) * r.c;
  const payingSubscribers = mrrRows.reduce((s, r) => s + r.c, 0);

  //历史的: suscripciones creadas en el periodo (nuevas altas recurrentes)
  const newSubscriptionsPeriod = db.prepare(
    `SELECT COUNT(*) c FROM licenses WHERE billing_model='subscription' AND created_at >= ${since}`
  ).get().c;

  // Revenue one-shot histórico (amount_eur) — conserva licencias legacy/pago
  // único viejo + el primer cobro registerado por webhook. Se mantiene para
  // retro-compatibilidad del panel; la métrica de negocio viva ahora es MRR.
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
    licenses: { total: total_licenses, active, suspended, revoked, expired },
    plans: planCounts,
    billing: { legacy: legacyCount, subscription: subscriptionCount, paying_subscribers: payingSubscribers },
    activations: { today: activationsToday, week: activationsWeek, month: activationsMonth, new_subscriptions_period: newSubscriptionsPeriod },
    revenue: { total_eur: revenueTotal, period_eur: revenuePeriod, mrr_eur: mrr_eur },
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

/**
 * Cuota diaria de análisis IA por plan — el anti-sharing delegado del viejo
 * fingerprint. Tiered para dar valor a los planes altos: mini 30 / pro 80 /
 * max 200 análisis/día. Un plan desconocido (legacy mal migrado, datos sucios)
 * cae al mínimo de mini, que es lo conservador (denegar antes que sobre-usar).
 */
const AI_QUOTAS = { mini: 30, pro: 80, max: 200 };
function aiQuotaForPlan(plan) {
  const q = AI_QUOTAS[plan];
  return typeof q === 'number' && q > 0 ? q : AI_QUOTAS.mini;
}

/* ── Suscripciones (Fase 3) ── */

/** Busca la licencia asociada a una suscripción de Stripe (usado en webhooks recurrentes). */
function getLicenseByStripeSubscriptionId(subscription_id) {
  if (!subscription_id) return null;
  return getDB().prepare('SELECT * FROM licenses WHERE stripe_subscription_id = ?').get(subscription_id);
}

/**
 * Actualiza los campos de suscripción de una licencia. Sólo setea los campos que
 * lleguen definidos — el resto se preserva. Usado por los webhooks recurrentes
 * (invoice.paid renueva current_period_ends_at, customer.subscription.updated
 * cambia plan/cancel_at_period_end, etc.).
 */
function updateSubscription(id, {
  plan, status, billing_model, stripe_customer_id, stripe_subscription_id,
  current_period_ends_at, cancel_at_period_end, amount_eur
}) {
  const db = getDB();
  const setClauses = [];
  const vals = [];
  const setIf = (col, val) => {
    if (val !== undefined) { setClauses.push(`${col} = ?`); vals.push(val); }
  };
  setIf('plan', plan);
  setIf('status', status);
  setIf('billing_model', billing_model);
  setIf('stripe_customer_id', stripe_customer_id);
  setIf('stripe_subscription_id', stripe_subscription_id);
  setIf('current_period_ends_at', current_period_ends_at);
  setIf('cancel_at_period_end', cancel_at_period_end);
  setIf('amount_eur', amount_eur);
  if (!setClauses.length) return getLicenseById(id);
  vals.push(id);
  db.prepare(`UPDATE licenses SET ${setClauses.join(', ')} WHERE id = ?`).run(...vals);
  return getLicenseById(id);
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
  setPasswordHash,
  clearPasswordAndSessions,
  canResetPassword,
  markPasswordReset,
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
  aiQuotaForPlan,
  getLicenseByStripeSubscriptionId,
  updateSubscription,
  audit,
  getStats
};
