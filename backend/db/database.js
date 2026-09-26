/**
 * db/database.js
 *
 * Capa de acceso a datos — SQLite vía better-sqlite3.
 *
 * Modelo de licencia vigente (tras Fase 2 — migración fingerprint → contraseña):
 *   - Una licencia = un email + una clave XXXX-XXXX-XXXX-XXXX + UNA contraseña
 *     elegida por el usuario (scrypt). No hay device-fingerprint.
 *   - El anti-sharing que aportaba el fingerprint se delega en la cuota diaria
 *     de IA por licencia, ahora **tiered por plan** (mini 10 / pro 50 / max 130
 *     análisis/día — ver aiQuotaForPlan, y config/plans.js) en backend/routes/proxy.js.
 *     El plan mini lleva además una prueba gratis de 14 días con tarjeta
 *     (campo trial_ends_at; ver runTrialMigration y config/plans.js TRIAL_*).
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

const { PLANS, AI_QUOTAS } = require('../config/plans');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'nokfi.db');

/** @type {import('better-sqlite3').Database} */
let db = null;

/**
 * ⚠️ AUDITORÍA DE SEGURIDAD — hash de tokens en reposo.
 * Tanto las sesiones como los reset-tokens se guardan en la BD SOLO como su
 * SHA-256 (64 hex minúsculas), nunca en texto plano. El token crudo (64 hex
 * MAYÚSCULAS, generado con crypto.randomBytes(32)) viaja solo en la respuesta
 * de creación y en memoria del cliente. Así, una fuga de la base de datos no
 * expone sesiones activas ni enlaces de reset reutilizables.
 */
function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * #4 (sesión 2) — bug de fechas SQLite. Las columnas expires_at se escriben
 * desde JS con toISOString() → '2026-09-22T18:24:32.180Z' (con 'T'), pero se
 * comparaban con datetime('now') → '2026-09-22 18:24:32' (con ESPACIO). La
 * comparación lexicográfica entre formatos distintos falla el mismo día UTC
 * ('T' 0x54 > ' ' 0x20 → todo lo que expira el mismo día contaba como vigente
 * hasta medianoche: OTPs de 10 min duraban horas, sesiones/tokens expirados
 * seguían válidos).
 *
 * Convención única: los writers siguen guardando ISO-8601 con 'T' (formato
 * canónico y lo que ya hay en las filas vivas) y TODAS las comparaciones usan
 * NOW_ISO, que produce exactamente ese formato en SQL. No hace falta migrar
 * filas antiguas: ya están en ISO (las anteriores a la auditoría también).
 */
const NOW_ISO = `strftime('%Y-%m-%dT%H:%M:%fZ','now')`;

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
          trial_ends_at             TEXT    DEFAULT NULL,
          payment_provider          TEXT    DEFAULT NULL
                                              CHECK(payment_provider IN ('stripe','paypal','coinbase','revolut',NULL)),
          payment_ref               TEXT    DEFAULT NULL,
          payment_intent_ref        TEXT    DEFAULT NULL,
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
          purpose     TEXT    NOT NULL CHECK(purpose IN ('reveal_key','password_reset','recovery')),
          license_id  INTEGER NOT NULL REFERENCES licenses(id) ON DELETE CASCADE,
          used        INTEGER NOT NULL DEFAULT 0,
          created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
          expires_at  TEXT    NOT NULL
        );

        CREATE TABLE IF NOT EXISTS otp_codes (
          id          INTEGER PRIMARY KEY AUTOINCREMENT,
          email       TEXT    NOT NULL,
          code_hash   TEXT    NOT NULL,
          attempts    INTEGER NOT NULL DEFAULT 0,
          used        INTEGER NOT NULL DEFAULT 0,
          created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
          expires_at  TEXT    NOT NULL
        );

        -- #6/#7/#14 (sesión 2): contador de SOLICITUDES de recuperación/reset
        -- por email, registradas ANTES de comprobar si la cuenta existe. Es lo
        -- que permite que el 429 sea uniforme (mismo comportamiento para emails
        -- reales y ajenos → sin oráculo de enumeración) y poner un tope diario
        -- al spam de OTPs. created_at con datetime('now') (formato espacio) y
        -- siempre comparado con datetime('now', …) → misma convención, sin el
        -- bug #4 (esa columna nunca se escribe desde JS).
        CREATE TABLE IF NOT EXISTS auth_request_log (
          id          INTEGER PRIMARY KEY AUTOINCREMENT,
          email       TEXT    NOT NULL,
          kind        TEXT    NOT NULL CHECK(kind IN ('password_reset','recovery')),
          created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
        );

        -- #13 (sesión 2): audit_log.license_id NO lleva FK a licenses A PROPÓSITO.
        -- El audit trail debe sobrevivir a la licencia: si se revoca/borra una
        -- licencia (chargeback, abuso, GDPR), sus eventos de seguridad siguen
        -- siendo la evidencia de lo que pasó. Una FK con CASCADE destruiría el
        -- rastro justo cuando más hace falta; una FK sin CASCADE impediría
        -- borrar licencias. Decisión deliberada, no descuido — no "arreglar".
        -- #13 (sesión 2) — license_id SIN FK a licenses, a propósito: esta tabla
        -- es el histórico forense. Con REFERENCES + CASCADE los eventos se
        -- borrarían con la licencia (pierdes el rastro justo cuando más falta
        -- hace: chargebacks, abuso); y sin acción, la FK bloquearía borrar
        -- licencias con historial. Sin FK, la fila sobrevive con el id apagado.
        CREATE TABLE IF NOT EXISTS audit_log (
          id          INTEGER PRIMARY KEY AUTOINCREMENT,
          event       TEXT    NOT NULL,
          license_id  INTEGER DEFAULT NULL,
          fingerprint TEXT    DEFAULT NULL,
          ip          TEXT    DEFAULT NULL,
          detail      TEXT    DEFAULT NULL,
          ts          TEXT    NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS analyses (
          id           INTEGER PRIMARY KEY AUTOINCREMENT,
          license_id   INTEGER NOT NULL REFERENCES licenses(id) ON DELETE CASCADE,
          kind         TEXT    NOT NULL DEFAULT 'analysis',
          title        TEXT    NOT NULL DEFAULT 'Análisis',
          result_html  TEXT    NOT NULL,
          prompt_chars INTEGER NOT NULL DEFAULT 0,
          created_at   TEXT    NOT NULL DEFAULT (datetime('now'))
        );

        -- 1 fila por licencia: el perfil de empresa del onboarding (sección 14).
        -- license_id es PK + UNIQUE implícito (sirve de índice de búsqueda — no
        -- hace falta un índice separado). Campos snake_case, JSON nativo para
        -- main_expenses (array de etiquetas). FK ON DELETE CASCADE → se borra
        -- con la licencia (igual que sessions/analyses).
        CREATE TABLE IF NOT EXISTS company_profiles (
          license_id           INTEGER PRIMARY KEY REFERENCES licenses(id) ON DELETE CASCADE,
          company_name         TEXT    NOT NULL DEFAULT '',
          sector               TEXT    NOT NULL DEFAULT '',
          size                 TEXT    NOT NULL DEFAULT '',
          main_expenses        TEXT    NOT NULL DEFAULT '[]',
          onboarding_completed INTEGER NOT NULL DEFAULT 0,
          welcome_card_dismissed INTEGER NOT NULL DEFAULT 0,
          updated_at           TEXT    NOT NULL DEFAULT (datetime('now'))
        );

        -- Deuda H — cuota diaria de IA ATOMICA (anti-TOCTOU). Cada análisis
        -- "reserva" un slot (license_id, day, slot) vía INSERT; el PK evita que
        -- dos peticiones concurrentes consigan el mismo asiento aunque el fetch
        -- a Gemini de una siga en vuelo cuando otra reserva (mejor-sqlite3 es
        -- síncrono → la reserva es atómica). slot ∈ [0, quotaMax=130). Si Gemini
        -- falla, la fila se borra (rollback) y el análisis no cuenta. El conteo
        -- de "usados hoy" sale de aquí (countAiAnalysesToday → ai_usage), no del
        -- audit_log, que sigue siendo solo el histórico. Sin FK: si la licencia
        -- se borra, sus slots se limpian en un barrido de ADMIN/uso (filas con
        -- day viejo son inocuas y caducan solas).
        CREATE TABLE IF NOT EXISTS ai_usage (
          license_id  INTEGER NOT NULL,
          day         TEXT    NOT NULL,                 -- 'YYYY-MM-DD' (UTC, igual que date('now'))
          slot        INTEGER NOT NULL,                 -- 0..(cuota-1); el máximo plan es max=130
          created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
          PRIMARY KEY (license_id, day, slot)
        );

        CREATE INDEX IF NOT EXISTS idx_licenses_key          ON licenses(key);
        CREATE INDEX IF NOT EXISTS idx_licenses_email        ON licenses(email);
        CREATE INDEX IF NOT EXISTS idx_sessions_token        ON sessions(token);
        CREATE INDEX IF NOT EXISTS idx_sessions_exp          ON sessions(expires_at);
        CREATE INDEX IF NOT EXISTS idx_payment_provider_evt  ON payment_events(provider, event_id);
        CREATE INDEX IF NOT EXISTS idx_reset_tokens_token     ON reset_tokens(token);
        CREATE INDEX IF NOT EXISTS idx_otp_codes_email        ON otp_codes(email);
        CREATE INDEX IF NOT EXISTS idx_auth_request_log       ON auth_request_log(email, kind, created_at);
        CREATE INDEX IF NOT EXISTS idx_audit_license          ON audit_log(license_id);
        CREATE INDEX IF NOT EXISTS idx_audit_ts               ON audit_log(ts);

        CREATE INDEX IF NOT EXISTS idx_sessions_license  ON sessions(license_id);
        CREATE INDEX IF NOT EXISTS idx_analyses_recent   ON analyses(license_id, created_at);
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
      runTrialMigration(db);
      runPaymentIntentRefMigration(db);
      runRecoveryPurposeMigration(db);
      hashTokensAtRest(db); // ⚠️ auditoría: hashear tokens planos preexistentes
      require('./schema4').runSession4Schema(db); // sesión 4: IA estructurada, libro, API keys…

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
 * Migración: ampliar el CHECK de reset_tokens.purpose con 'recovery'
 * (flujo de recuperación de acceso con OTP — ver routes/auth.js).
 * SQLite no permite ALTER de un CHECK → se reconstruye la tabla copiando
 * TODAS las filas (a diferencia de la migración device_reset→password_reset,
 * aquí no se descarta ninguna: los purposes existentes son todos válidos).
 * Idempotente: si el DDL ya contiene 'recovery' es un no-op.
 */
function runRecoveryPurposeMigration(database) {
  const row = database
    .prepare(`SELECT sql FROM sqlite_master WHERE type='table' AND name='reset_tokens'`)
    .get();
  if (!row || !row.sql || row.sql.includes("'recovery'")) return; // ya migrado

  const migrate = database.transaction(() => {
    database.exec(`ALTER TABLE reset_tokens RENAME TO reset_tokens_old`);
    database.exec(`
      CREATE TABLE reset_tokens (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        token       TEXT    NOT NULL UNIQUE,
        purpose     TEXT    NOT NULL CHECK(purpose IN ('reveal_key','password_reset','recovery')),
        license_id  INTEGER NOT NULL REFERENCES licenses(id) ON DELETE CASCADE,
        used        INTEGER NOT NULL DEFAULT 0,
        created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
        expires_at  TEXT    NOT NULL
      )
    `);
    database.exec(`
      INSERT INTO reset_tokens (id, token, purpose, license_id, used, created_at, expires_at)
      SELECT id, token, purpose, license_id, used, created_at, expires_at
      FROM reset_tokens_old
    `);
    database.exec(`DROP TABLE reset_tokens_old`);
    database.exec(`CREATE INDEX IF NOT EXISTS idx_reset_tokens_token ON reset_tokens(token)`);
  });

  migrate();
  console.log("✅  Migración reset_tokens: CHECK ampliado con 'recovery'");
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
            trial_ends_at             TEXT    DEFAULT NULL,
            payment_provider          TEXT    DEFAULT NULL
                                                    CHECK(payment_provider IN ('stripe','paypal','coinbase','revolut',NULL)),
            payment_ref               TEXT    DEFAULT NULL,
            payment_intent_ref        TEXT    DEFAULT NULL,
            amount_eur                REAL    DEFAULT NULL,
            notes                     TEXT    DEFAULT '',
            created_at                TEXT    NOT NULL DEFAULT (datetime('now')),
            created_by                TEXT    DEFAULT 'system'
          )
        `);
        // Copiar todas las filas. Las lifetime viejas (plan basic/pro) → max/legacy.
        // Los nuevos campos stripe se inicializan a NULL/0 (sin suscripción real).
        // El `id` se copia explícito para preservar las FK de sessions/audit/etc.
        // #12 (sesión 2): trial_ends_at se conserva si la tabla vieja ya la tenía
        // (DB de una versión con trial pero CHECKs viejos); antes el INSERT no la
        // listaba y el rebuild dejaba todos los trials a NULL.
        const trialCol = cols.includes('trial_ends_at') ? 'trial_ends_at' : 'NULL';
        database.exec(`
          INSERT INTO licenses_new_sub (
            id, key, email, status, plan, billing_model, password_hash, device_name,
            last_password_reset, stripe_customer_id, stripe_subscription_id,
            current_period_ends_at, cancel_at_period_end, trial_ends_at,
            payment_provider, payment_ref, amount_eur, notes, created_at, created_by
          )
          SELECT
            id, key, email, status,
            CASE WHEN plan IN ('basic','pro') THEN 'max' ELSE plan END,
            CASE WHEN plan IN ('basic','pro') THEN 'legacy' ELSE 'subscription' END,
            password_hash, device_name, last_password_reset,
            NULL, NULL, NULL, 0,
            ${trialCol},
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

/**
 * Migración Trial — añade la columna `trial_ends_at` a `licenses` si no existe.
 * Idempotente y guardada por detección (PRAGMA table_info). En un install fresco
 * la columna ya la crea el `CREATE TABLE IF NOT EXISTS` (con TRIAL_DAYS de
 * config/plans.js) → este ALTER no se ejecuta. En la BD del VPS (esquema Fase 3
 * sin la col) añade una simple columna nullable: SQLite permite `ALTER TABLE
 * ADD COLUMN` sin reconstruir la tabla para una col sin constraint → no hay
 * riesgo para las FK hijas. Registra NULL en todas las filas existentes, lo que
 * es correcto: legacy y suscripciones ya cobradas no están en trial.
 *
 * El trial de 14 días (solo plan mini) se gestiona en los webhooks de Stripe:
 * checkout.session.completed crea la licencia con trial_ends_at = sub.trial_end
 * (14 días en el futuro); customer.subscription.updated / invoice.paid lo
 * limpian a NULL cuando el trial termina o se cobra el primer periodo (ver el
 * bug C en routes/webhooks.js: la coerción explícita a null es necesaria porque
 * isoFromUnix(null) devolvería undefined y setIf lo saltaría, dejando el estado
 * stale en trialing para siempre).
 */
function runTrialMigration(database) {
  const columnsOf = (table) => database.prepare(`PRAGMA table_info(${table})`).all().map(c => c.name);
  const cols = columnsOf('licenses');
  if (!cols.includes('trial_ends_at')) {
    database.exec(`ALTER TABLE licenses ADD COLUMN trial_ends_at TEXT DEFAULT NULL`);
    console.log('✅  Migración Trial: añadida columna licenses.trial_ends_at');
  }
}

/**
 * Migración payment_intent_ref — añade la columna `payment_intent_ref` a
 * `licenses` si no existe. Guarda el `pi_…` (PaymentIntent) del cobro de
 * Stripe junto al `cs_…` de payment_ref: los eventos `charge.dispute.created`
 * (chargebacks) llegan referenciados por payment_intent, no por la Checkout
 * Session, y sin esta columna la revocación por contracargo nunca encontraba
 * la licencia (sesión 2, hallazgo #1). Idempotente por detección (PRAGMA);
 * en install fresco la columna ya la crea el CREATE TABLE. Las filas
 * existentes quedan a NULL: sus cobros futuros la rellenan vía invoice.paid,
 * y para disputas de cobros antiguos el webhook resuelve vía Stripe API
 * (charge → invoice → subscription).
 */
function runPaymentIntentRefMigration(database) {
  const cols = database.prepare(`PRAGMA table_info(licenses)`).all().map(c => c.name);
  if (!cols.includes('payment_intent_ref')) {
    database.exec(`ALTER TABLE licenses ADD COLUMN payment_intent_ref TEXT DEFAULT NULL`);
    console.log('✅  Migración payment_intent_ref: añadida columna licenses.payment_intent_ref');
  }
}

/**
 * ⚠️ AUDITORÍA DE SEGURIDAD — migración "tokens hasheados en reposo" (v2).
 * Antes, sessions.token y reset_tokens.token se guardaban en PLAINTEXT. Desde
 * la auditoría (commit 0aca8d3) la app solo escribe el SHA-256 del token
 * (hashToken). Esta migración hashea in-place las filas preexistentes.
 *
 * #5 (sesión 2) — la v1 era un NO-OP silencioso: discriminaba por
 * `token GLOB '*[A-Z]*'` asumiendo que el token plano era hex en MAYÚSCULAS,
 * pero crypto.randomBytes(32).toString('hex') genera MINÚSCULAS — igual que
 * el digest SHA-256. Token plano y hash son AMBOS 64 hex minúsculas:
 * indistinguibles por formato. La v1 no tocó ninguna fila.
 *
 * v2 — como no existe discriminador de formato posible, se usa una marca de
 * migración a nivel de esquema (PRAGMA user_version, persiste en la cabecera
 * del archivo .db): con user_version < 1 se re-hashean TODAS las filas una
 * única vez y se marca user_version = 1.
 *
 * Efecto conocido y aceptado: las sesiones creadas tras la auditoría (ya
 * hasheadas) quedan doble-hasheadas → esas sesiones mueren y sus usuarios
 * hacen login una vez más (flujo normal de sesión expirada, mismo resultado
 * que si se hubieran borrado). Es el precio de una invariante demostrable por
 * construcción: tras esta migración, TODA fila de sessions/reset_tokens es un
 * hash SHA-256 — no queda nada en plano, ni viejo ni nuevo. Las filas en
 * plano anteriores a la auditoría además ya estaban muertas (el lookup siempre
 * hashea la entrada → jamás casaban).
 */
function hashTokensAtRest(database) {
  const version = database.pragma('user_version', { simple: true });
  if (version >= 1) return; // migración v2 ya aplicada — no-op

  const updS = database.prepare('UPDATE sessions SET token = ? WHERE id = ?');
  const sessions = database.prepare('SELECT id, token FROM sessions').all();
  const updR = database.prepare('UPDATE reset_tokens SET token = ? WHERE id = ?');
  const resetTokens = database.prepare('SELECT id, token FROM reset_tokens').all();

  database.transaction(() => {
    for (const r of sessions) updS.run(hashToken(r.token), r.id);
    for (const r of resetTokens) updR.run(hashToken(r.token), r.id);
    database.pragma('user_version = 1');
  })();

  console.log(`✅  Migración tokens v2: (re)hasheadas ${sessions.length} sesiones y ${resetTokens.length} reset-tokens (user_version=1)`);
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
  payment_intent_ref = null,
  amount_eur = null, notes = '', created_by = 'system', password = null,
  billing_model = 'subscription', stripe_customer_id = null,
  stripe_subscription_id = null, current_period_ends_at = null,
  trial_ends_at = null
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
                          trial_ends_at, payment_provider, payment_ref, payment_intent_ref,
                          amount_eur, notes, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(key.toUpperCase(), email.trim().toLowerCase(), plan, billing_model, password_hash,
         stripe_customer_id, stripe_subscription_id, current_period_ends_at,
         trial_ends_at, payment_provider, payment_ref, payment_intent_ref, amount_eur, notes, created_by);

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

/** Busca una licencia por su referencia de pago (cs_… de Checkout Session; usado en /reveal y como fallback en chargebacks) */
function getLicenseByPaymentRef(payment_provider, payment_ref) {
  if (!payment_ref) return null;
  return getDB().prepare('SELECT * FROM licenses WHERE payment_provider = ? AND payment_ref = ?')
    .get(payment_provider, payment_ref);
}

/**
 * Busca una licencia por el PaymentIntent de Stripe (pi_…). Es la referencia
 * que llega en los eventos charge.dispute.created (chargebacks): sin ella el
 * contracargo nunca casaba con el cs_… guardado en payment_ref y la licencia
 * quedaba activa pese al dinero devuelto (sesión 2, hallazgo #1).
 */
function getLicenseByPaymentIntent(payment_provider, payment_intent_ref) {
  if (!payment_intent_ref) return null;
  return getDB().prepare('SELECT * FROM licenses WHERE payment_provider = ? AND payment_intent_ref = ?')
    .get(payment_provider, payment_intent_ref);
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

  // ⚠️ Auditoría: se persiste HASHED(token), no el token crudo (ver hashToken).
  // El `token` crudo solo vuelve al cliente en la respuesta, una vez.
  getDB().prepare(`
    INSERT INTO sessions (token, license_id, expires_at, ip)
    VALUES (?, ?, ?, ?)
  `).run(hashToken(token), license_id, expires.toISOString(), ip);

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
  // Hashear el token entrante para casar con la columna en reposo (hashToken).
  const hashed = hashToken(token);
  const session = db.prepare(
    `SELECT * FROM sessions WHERE token = ? AND expires_at > ${NOW_ISO}`
  ).get(hashed);
  if (!session) return null;
  db.prepare("UPDATE sessions SET last_used = datetime('now') WHERE token = ?").run(hashed);
  return session;
}

function deleteSession(token) {
  return getDB().prepare('DELETE FROM sessions WHERE token = ?').run(hashToken(token));
}

function deleteSessionsForLicense(license_id) {
  return getDB().prepare('DELETE FROM sessions WHERE license_id = ?').run(license_id);
}

function cleanExpiredSessions() {
  return getDB().prepare(`DELETE FROM sessions WHERE expires_at < ${NOW_ISO}`).run().changes;
}

/* ════════════════════════════════════════════════════════════
   RESET TOKENS (revelación de clave / reseteo de dispositivo)
════════════════════════════════════════════════════════════ */

function createResetToken(license_id, purpose, ttlMinutes = 15) {
  const token = crypto.randomBytes(32).toString('hex');
  const expires = new Date();
  expires.setMinutes(expires.getMinutes() + ttlMinutes);

  // ⚠️ Auditoría: se persiste HASHED(token), no el crudo (ver hashToken).
  getDB().prepare(`
    INSERT INTO reset_tokens (token, purpose, license_id, expires_at)
    VALUES (?, ?, ?, ?)
  `).run(hashToken(token), purpose, license_id, expires.toISOString());

  return { token, expires_at: expires.toISOString() };
}

function consumeResetToken(token, purpose) {
  const db = getDB();
  const row = db.prepare(`
    SELECT * FROM reset_tokens
    WHERE token = ? AND purpose = ? AND used = 0 AND expires_at > ${NOW_ISO}
  `).get(hashToken(token), purpose);
  if (!row) return null;
  db.prepare('UPDATE reset_tokens SET used = 1 WHERE id = ?').run(row.id);
  return row;
}

/**
 * Valida un reset-token SIN consumirlo (para acciones repetibles mientras el
 * token vive — p.ej. reenviar las claves por email en el flujo de recuperación).
 * Devuelve la fila o null. El consumo real lo hace consumeResetToken.
 */
function peekResetToken(token, purpose) {
  return getDB().prepare(`
    SELECT * FROM reset_tokens
    WHERE token = ? AND purpose = ? AND used = 0 AND expires_at > ${NOW_ISO}
  `).get(hashToken(token), purpose);
}

/* ════════════════════════════════════════════════════════════
   OTP DE RECUPERACIÓN DE ACCESO (olvido de clave / contraseña)
   Códigos de 6 dígitos, 10 min de validez, máx. 5 intentos,
   máx. 3 solicitudes/hora por email. Se guardan SOLO hasheados
   (mismo hashToken SHA-256 que sesiones y reset-tokens) y solo
   puede haber un OTP vivo por email (el nuevo invalida al viejo).
════════════════════════════════════════════════════════════ */

const OTP_TTL_MINUTES = 10;
const OTP_MAX_ATTEMPTS = 5;
const OTP_MAX_PER_HOUR = 3;
// #14 (sesión 2): además del límite por hora, tope diario por email — antes
// podían pedirse 3 códigos/hora INDEFINIDAMENTE (24×3=72 emails/día a un
// buzón ajeno) y cada nuevo código quemaba el del usuario legítimo.
const OTP_MAX_PER_DAY = 10;
// #6 (sesión 2): tope de solicitudes de reset de contraseña por email/hora,
// aplicado ANTES de mirar si la cuenta existe (429 uniforme, sin oráculo).
const RESET_MAX_PER_HOUR = 5;

/**
 * Registra una solicitud de recuperación/reset por email (tabla
 * auth_request_log). Se llama SIEMPRE — exista o no la cuenta — para que el
 * conteo (y el 429) sea uniforme y no delate qué emails tienen licencia.
 * Incluye limpieza perezosa de filas de más de 2 días.
 */
function logAuthRequest(email, kind) {
  const db = getDB();
  const normalized = String(email).trim().toLowerCase();
  const tx = db.transaction(() => {
    db.prepare(`DELETE FROM auth_request_log WHERE created_at < datetime('now', '-2 days')`).run();
    db.prepare(`INSERT INTO auth_request_log (email, kind) VALUES (?, ?)`).run(normalized, kind);
  });
  tx();
}

/**
 * Cuántas solicitudes de un tipo ha hecho un email en una ventana deslizante
 * SQLite (p.ej. '-1 hour', '-24 hours'). Uniforme entre emails reales y
 * ajenos porque logAuthRequest se ejecuta siempre antes de consultar.
 */
function countAuthRequests(email, kind, windowSql = '-1 hour') {
  const row = getDB().prepare(`
    SELECT COUNT(*) AS n FROM auth_request_log
    WHERE email = ? AND kind = ? AND created_at > datetime('now', ?)
  `).get(String(email).trim().toLowerCase(), kind, windowSql);
  return row.n;
}

/** ¿Cuántos OTP se han generado para este email en la última hora? (límite anti-spam) */
function countRecentOtps(email) {
  const row = getDB().prepare(`
    SELECT COUNT(*) AS n FROM otp_codes
    WHERE email = ? AND created_at > datetime('now', '-1 hour')
  `).get(String(email).trim().toLowerCase());
  return row.n;
}

/**
 * Genera un OTP de 6 dígitos para el email. Invalida los OTP previos no
 * usados (solo uno vivo por email) y limpia los expirados (borrado perezoso).
 * Devuelve el código EN CLARO (solo para enviarlo por email) + expires_at;
 * en la tabla queda únicamente su SHA-256.
 */
function createOtp(email) {
  const db = getDB();
  const normalized = String(email).trim().toLowerCase();
  const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
  const expires = new Date();
  expires.setMinutes(expires.getMinutes() + OTP_TTL_MINUTES);

  const tx = db.transaction(() => {
    db.prepare(`DELETE FROM otp_codes WHERE expires_at <= ${NOW_ISO}`).run();
    db.prepare(`UPDATE otp_codes SET used = 1 WHERE email = ? AND used = 0`).run(normalized);
    db.prepare(`INSERT INTO otp_codes (email, code_hash, expires_at) VALUES (?, ?, ?)`)
      .run(normalized, hashToken(code), expires.toISOString());
  });
  tx();

  return { code, expires_at: expires.toISOString() };
}

/**
 * Verifica un OTP. Devuelve { ok: true } si era correcto (y lo consume), o
 * { ok: false, reason: 'no_code' | 'burned' | 'mismatch' }.
 * - 'no_code': no hay OTP vivo para ese email (nunca se pidió o ya se usó).
 * - 'burned': se llegó a OTP_MAX_ATTEMPTS intentos → el código queda inutilizado.
 * - 'mismatch': código incorrecto (attempts++).
 */
function verifyOtp(email, code) {
  const db = getDB();
  const normalized = String(email).trim().toLowerCase();
  const row = db.prepare(`
    SELECT * FROM otp_codes
    WHERE email = ? AND used = 0 AND expires_at > ${NOW_ISO}
    ORDER BY id DESC LIMIT 1
  `).get(normalized);

  if (!row) return { ok: false, reason: 'no_code' };

  if (row.attempts >= OTP_MAX_ATTEMPTS) {
    db.prepare('UPDATE otp_codes SET used = 1 WHERE id = ?').run(row.id);
    return { ok: false, reason: 'burned' };
  }

  if (row.code_hash !== hashToken(String(code).trim())) {
    const attempts = row.attempts + 1;
    db.prepare('UPDATE otp_codes SET attempts = ? WHERE id = ?').run(attempts, row.id);
    if (attempts >= OTP_MAX_ATTEMPTS) {
      db.prepare('UPDATE otp_codes SET used = 1 WHERE id = ?').run(row.id);
      return { ok: false, reason: 'burned' };
    }
    return { ok: false, reason: 'mismatch' };
  }

  db.prepare('UPDATE otp_codes SET used = 1 WHERE id = ?').run(row.id);
  return { ok: true };
}

/** Todas las licencias activas de un email (para mostrar sus claves tras el OTP). */
function getActiveLicensesByEmail(email) {
  return getDB().prepare(`
    SELECT id, key, plan, status FROM licenses
    WHERE email = ? AND status = 'active'
    ORDER BY created_at ASC
  `).all(String(email).trim().toLowerCase());
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
  //    suscripciones ACTIVAS y YA FUERA DEL TRIAL (billing_model='subscription'
  //    AND status='active' AND trial_ends_at IS NULL). Las licencias en trial
  //    de mini tienen status='active' pero generan 0€ hasta el primer cobro a
  //    los 14 días; contarlas inflaría el MRR. Las legacy no aportan MRR (ya
  //    pagadas, no recurrentes). Precios en EUR desde config/plans.js (fuente
  //    única; antes era un literal {mini:10,pro:25,max:40} duplicado aquí).
  const PLAN_PRICES_EUR = Object.fromEntries(Object.keys(PLANS).map(p => [p, PLANS[p].eur]));
  const mrrRows = db.prepare(`
    SELECT plan, COUNT(*) c FROM licenses
    WHERE billing_model='subscription' AND status='active' AND trial_ends_at IS NULL
    GROUP BY plan
  `).all();
  let mrr_eur = 0;
  for (const r of mrrRows) mrr_eur += (PLAN_PRICES_EUR[r.plan] || 0) * r.c;
  const payingSubscribers = mrrRows.reduce((s, r) => s + r.c, 0);
  // Suscripciones en periodo de prueba (status='active', trial_ends_at en el
  // futuro): métrica aparte para que el panel distinga "ensayan" de "pagan".
  const trialingCount = db.prepare(`
    SELECT COUNT(*) c FROM licenses
    WHERE billing_model='subscription' AND status='active' AND trial_ends_at IS NOT NULL
  `).get().c;

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
    billing: { legacy: legacyCount, subscription: subscriptionCount, paying_subscribers: payingSubscribers, trialing: trialingCount },
    activations: { today: activationsToday, week: activationsWeek, month: activationsMonth, new_subscriptions_period: newSubscriptionsPeriod },
    revenue: { total_eur: revenueTotal, period_eur: revenuePeriod, mrr_eur: mrr_eur },
    daily_series: dailySeries,
    recent_events: db.prepare('SELECT * FROM audit_log ORDER BY ts DESC LIMIT 25').all()
  };
}

/**
 * Deuda H — cuota diaria de IA ATOMICA (anti-TOCTOU).
 *
 * El problema anterior (ver git / deploy.md §7): el límite se aplicaba con
 * "comprobar (countAiAnalysesToday) → await fetch a Gemini → registrar (audit)".
 * Node suelta el hilo en el `await`, así que N peticiones concurrentes de una
 * licencia veían todas `used < limit` antes de que ninguna registrara → el
 * día terminaba con análisis por encima del tier y un cliente scripted podía
 * colarse delante del resto.
 *
 * La solución: la tabla `ai_usage` reserva un slot por análisis vía INSERT
 * con PRIMARY KEY (license_id, day, slot). La reserva es ATÓMICA (mejor-sqlite3
 * es síncrono; aunque dos peticiones se entrelazaran, el PK haría que el segundo
 * INSERT al mismo slot fallara y pasara al siguiente). Si no hay slot libre,
 * la cuota está agotada y NO se llama a Gemini. Si Gemini falla después de
 * reservar, `releaseAiSlot` borra la fila → el análisis fallido NO cuenta.
 *
 * El `audit_log` queda SOLO como histórico/auditoría; el conteo de "usados hoy"
 * sale del propio `ai_usage` para que sea coherente con la reserva.
 */

/** Día natural en UTC; coincide con `date('now')` de SQLite (corte a medianoche UTC). */
function aiUsageDay() {
  return new Date().toISOString().slice(0, 10);
}

/** Slots reservados hoy por la licencia (su "uso" del día). */
function countAiAnalysesToday(license_id) {
  return getDB().prepare(
    'SELECT COUNT(*) c FROM ai_usage WHERE license_id = ? AND day = ?'
  ).get(license_id, aiUsageDay()).c;
}

/**
 * Reserva un slot hoy para la licencia. Devuelve `{ day, slot }` si lo consigue
 * o `null` si la cuota del plan está agotada (todo `[0, dailyLimit)` ocupado).
 * Sólo relanza errores que NO sean de conflicto de PK (los de PK se ignoran y
 * se prueba el siguiente slot). `dailyLimit` se espera ya resuelto por
 * `aiQuotaForPlan(plan)`.
 */
function reserveAiSlot(license_id, dailyLimit) {
  const db = getDB();
  const day = aiUsageDay();
  const insert = db.prepare('INSERT INTO ai_usage (license_id, day, slot) VALUES (?, ?, ?)');
  for (let i = 0; i < dailyLimit; i++) {
    try {
      insert.run(license_id, day, i);
      return { day, slot: i };
    } catch (e) {
      if (e.code !== 'SQLITE_CONSTRAINT_PRIMARYKEY') throw e; // slot ocupado → siguiente
    }
  }
  return null;
}

/** Rollback de una reserva: libera el slot cuando la IA falla (no cuenta para la cuota). */
function releaseAiSlot(license_id, day, slot) {
  getDB().prepare(
    'DELETE FROM ai_usage WHERE license_id = ? AND day = ? AND slot = ?'
  ).run(license_id, day, slot);
}

/**
 * Cuota diaria de análisis IA por plan — el anti-sharing delegado del viejo
 * fingerprint. Tiered para dar valor a los planes altos: mini 10 / pro 50 /
 * max 130 análisis/día (definidos en config/plans.js, fuente única; antes era
 * un literal {mini:30,pro:80,max:200} duplicado aquí). Un plan desconocido
 * (legacy mal migrado, datos sucios) cae al mínimo de mini, que es lo
 * conservador (denegar antes que sobre-usar).
 *
 * AI_QUOTAS se importa de config/plans.js. No la redeclaramos localmente.
 */
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
  current_period_ends_at, cancel_at_period_end, amount_eur, trial_ends_at,
  payment_intent_ref
}) {
  const db = getDB();
  const setClauses = [];
  const vals = [];
  // setIf escribe cuando val !== undefined. Esto es deliberado y clave para el
  // trial: un trial terminado COBRADO debe dejar trial_ends_at = NULL (ya no
  // está en prueba), y los callers pasan `null` explícito (no undefined) para
  // forzar el WRITE. Si pasaran undefined (p.ej. isoFromUnix(null)) setIf lo
  // saltaría y la licencia quedaría marcada en trial para siempre (bug C). Ver
  // la coerción `sub.trial_end ? isoFromUnix(sub.trial_end) : null` en webhooks.
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
  setIf('trial_ends_at', trial_ends_at);
  setIf('payment_intent_ref', payment_intent_ref);
  if (!setClauses.length) return getLicenseById(id);
  vals.push(id);
  db.prepare(`UPDATE licenses SET ${setClauses.join(', ')} WHERE id = ?`).run(...vals);
  return getLicenseById(id);
}

/* ── Historial de análisis (G2) ── */

/**
 * Persiste un análisis generado (HTML de la IA) vinculado a una licencia —
 * el historial de análisis de la sección 14 (pantallas Historial / Informes).
 * Solo se llama tras una respuesta válida de la IA (routes/proxy.js); quien
 * llama lo envuelve en try/catch para que un fallo de escritura NUNCA bloquee
 * el análisis al usuario (el historial es un nice-to-have, no crítico).
 *
 * Privacidad: NO persistimos el prompt (lleva los datos financieros del
 * cliente); solo guardamos prompt_chars (conteo) y el result_html (el HTML
 * que la IA genera y que el frontend ya rendiza vía sanitizeAiHtml de todos
 * modos). kind/title son etiquetas que aporta el cliente (ExcelSubModule pasa
 * su `title` de subapartado; Cuestionario pasa `kind='cuestionario'`); se
 * truncan por higiene — no son críticos de seguridad: solo etiquetan el
 * historial PROPIO de cada licencia (requireLicense scopea todo por
 * req.license.id, no se puede escribir en el historial de otro).
 */
function createAnalysis({ license_id, kind = 'analysis', title = 'Análisis', result_html = '', result_json = null, meta = null, prompt_chars = 0 }) {
  const db = getDB();
  const k = String(kind || 'analysis').slice(0, 40);
  const t = String(title || 'Análisis').slice(0, 120);
  // Sesión 4 (F1): los análisis nuevos guardan la salida ESTRUCTURADA en
  // result_json (result_html queda ''); los antiguos siguen en result_html.
  const info = db.prepare(`
    INSERT INTO analyses (license_id, kind, title, result_html, result_json, meta_json, prompt_chars)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    license_id, k, t, result_html || '',
    result_json ? JSON.stringify(result_json) : null,
    meta ? JSON.stringify(meta) : null,
    Number(prompt_chars) || 0
  );
  return Number(info.lastInsertRowid);
}

function parseJsonColumn(value) {
  if (!value) return null;
  try { return JSON.parse(value); } catch { return null; }
}

/** Lista LIGERA del historial de una licencia (sin result_html), más recientes primero. */
function listAnalyses(license_id, limit = 50) {
  return getDB().prepare(`
    SELECT id, kind, title, prompt_chars, created_at,
           CASE WHEN result_json IS NOT NULL THEN 'json' ELSE 'html' END AS format
    FROM analyses
    WHERE license_id = ?
    ORDER BY created_at DESC, id DESC
    LIMIT ?
  `).all(license_id, limit);
}

/** Devuelve un análisis completo, scopeado por license_id → null/undefined si no es tuyo. */
function getAnalysis(license_id, id) {
  const row = getDB().prepare(`
    SELECT id, kind, title, result_html, result_json, meta_json, prompt_chars, created_at
    FROM analyses
    WHERE id = ? AND license_id = ?
  `).get(id, license_id);
  if (!row) return row;
  return {
    ...row,
    result_json: parseJsonColumn(row.result_json),
    meta: parseJsonColumn(row.meta_json),
    format: row.result_json ? 'json' : 'html'
  };
}

/** Último análisis de un tipo con sus metadatos (C1: última nota de salud). */
function getLatestAnalysisOfKind(license_id, kind) {
  const row = getDB().prepare(`
    SELECT id, title, meta_json, created_at FROM analyses
    WHERE license_id = ? AND kind = ? AND meta_json IS NOT NULL
    ORDER BY created_at DESC, id DESC LIMIT 1
  `).get(license_id, kind);
  if (!row) return null;
  return { id: row.id, title: row.title, created_at: row.created_at, meta: parseJsonColumn(row.meta_json) };
}

/* ── Perfil de empresa (G-a — onboarding, sección 14) ── */

/**
 * Lee el perfil de empresa de una licencia. Devuelve null si aún no existe
 * (licencia nueva que no ha hecho onboarding). El llamador (routes/profile.js)
 * responde con el perfil vacío en ese caso — nunca con error.
 *
 * Los ints onboarding_completed / welcome_card_dismissed se devuelven como
 * están (0/1); la capa de presentación (hook del frontend) los mapea a bool.
 * main_expenses es un JSON string → se desparsea aquí a array.
 */
function getCompanyProfile(license_id) {
  const row = getDB().prepare(`
    SELECT *
    FROM company_profiles
    WHERE license_id = ?
  `).get(license_id);
  if (!row) return null;
  let expenses = [];
  try { expenses = Array.isArray(JSON.parse(row.main_expenses)) ? JSON.parse(row.main_expenses) : []; } catch { expenses = []; }
  return {
    license_id: row.license_id,
    company_name: row.company_name,
    sector: row.sector,
    size: row.size,
    main_expenses: expenses,
    onboarding_completed: !!row.onboarding_completed,
    welcome_card_dismissed: !!row.welcome_card_dismissed,
    legal_form: row.legal_form || '',
    tax_id: row.tax_id || '',
    lang: row.lang || '',
    fiscal_reminders: !!row.fiscal_reminders,
    monthly_summary: row.monthly_summary == null ? true : !!row.monthly_summary,
    auto_collections: !!row.auto_collections,
    cash_balance: row.cash_balance == null ? null : Number(row.cash_balance),
    cash_balance_date: row.cash_balance_date || null,
    cash_alert_threshold: Number(row.cash_alert_threshold) || 0,
    updated_at: row.updated_at
  };
}

/**
 * Upsert del perfil de empresa con MERGE PARCIAL — INSERT si no existe, UPDATE
 * si ya existe, vía `ON CONFLICT(license_id) DO UPDATE` (license_id es la PK →
 * UNIQUE). El merge vive AQUÍ (en la capa de persistencia), no en la ruta:
 * cualquier caller de upsertCompanyProfile recibe el mismo contrato — un
 * campo ausente en `partial` se PRESERVA del perfil actual; un campo presente
 * se sobreescribe. Así un PUT que omita un campo no lo vacía, venga de la ruta
 * o de cualquier otro llamador futuro.
 *
 * El llamador (routes/profile.js) ya sanea/valida/filtra enum los valores
 * antes de pasarlos; aquí solo persistencia atómica + merge. main_expenses
 * (Array) se serializa a JSON string para la columna TEXT. Devuelve el perfil
 * completo leído tras el upsert (shape de getCompanyProfile).
 */
function upsertCompanyProfile(license_id, partial) {
  const db = getDB();
  const current = getCompanyProfile(license_id) || {};
  const pick = (k, dflt) => (partial[k] !== undefined ? partial[k] : (current[k] ?? dflt));
  const merged = {
    company_name: pick('company_name', ''),
    sector:       pick('sector', ''),
    size:         pick('size', ''),
    main_expenses: Array.isArray(partial.main_expenses) ? partial.main_expenses : (current.main_expenses || []),
    onboarding_completed:   !!pick('onboarding_completed', false),
    welcome_card_dismissed: !!pick('welcome_card_dismissed', false),
    legal_form:   pick('legal_form', ''),
    tax_id:       pick('tax_id', ''),
    lang:         pick('lang', ''),
    fiscal_reminders: !!pick('fiscal_reminders', false),
    monthly_summary: !!pick('monthly_summary', true),
    auto_collections: !!pick('auto_collections', false),
    cash_balance: pick('cash_balance', null),
    cash_balance_date: pick('cash_balance_date', null),
    cash_alert_threshold: Number(pick('cash_alert_threshold', 0)) || 0
  };
  db.prepare(`
    INSERT INTO company_profiles
      (license_id, company_name, sector, size, main_expenses,
       onboarding_completed, welcome_card_dismissed,
       legal_form, tax_id, lang, fiscal_reminders, monthly_summary, auto_collections, cash_balance, cash_balance_date, cash_alert_threshold,
       updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(license_id) DO UPDATE SET
      company_name          = excluded.company_name,
      sector                = excluded.sector,
      size                  = excluded.size,
      main_expenses         = excluded.main_expenses,
      onboarding_completed  = excluded.onboarding_completed,
      welcome_card_dismissed = excluded.welcome_card_dismissed,
      legal_form            = excluded.legal_form,
      tax_id                = excluded.tax_id,
      lang                  = excluded.lang,
      fiscal_reminders      = excluded.fiscal_reminders,
      monthly_summary       = excluded.monthly_summary,
      auto_collections      = excluded.auto_collections,
      cash_balance          = excluded.cash_balance,
      cash_balance_date     = excluded.cash_balance_date,
      cash_alert_threshold  = excluded.cash_alert_threshold,
      updated_at            = datetime('now')
  `).run(
    license_id, merged.company_name, merged.sector, merged.size,
    JSON.stringify(merged.main_expenses),
    merged.onboarding_completed ? 1 : 0,
    merged.welcome_card_dismissed ? 1 : 0,
    merged.legal_form, merged.tax_id, merged.lang,
    merged.fiscal_reminders ? 1 : 0,
    merged.monthly_summary ? 1 : 0,
    merged.auto_collections ? 1 : 0,
    merged.cash_balance, merged.cash_balance_date, merged.cash_alert_threshold
  );
  return getCompanyProfile(license_id);
}

module.exports = {
  initDB,
  getDB,
  hashTokensAtRest, // exportado para el test e2e de la migración v2 (#5)
  generateLicenseKey,
  createLicense,
  getLicenseByKey,
  getLicenseById,
  getLicenseByEmailAndKey,
  getLicenseByPaymentRef,
  getLicenseByPaymentIntent,
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
  peekResetToken,
  createOtp,
  verifyOtp,
  countRecentOtps,
  logAuthRequest,
  countAuthRequests,
  getActiveLicensesByEmail,
  OTP_MAX_PER_HOUR,
  OTP_MAX_PER_DAY,
  RESET_MAX_PER_HOUR,
  isPaymentEventProcessed,
  recordPaymentEvent,
  countAiAnalysesToday,
  reserveAiSlot,
  releaseAiSlot,
  aiQuotaForPlan,
  getLicenseByStripeSubscriptionId,
  updateSubscription,
  createAnalysis,
  listAnalyses,
  getAnalysis,
  getLatestAnalysisOfKind,
  getCompanyProfile,
  upsertCompanyProfile,
  audit,
  getStats
};
