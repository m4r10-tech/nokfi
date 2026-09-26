/**
 * db/schema4.js — esquema de la sesión 4 (idempotente, se ejecuta en initDB).
 *
 * Todo con `CREATE TABLE IF NOT EXISTS` + `ensureColumn` (ALTER TABLE solo si
 * la columna no existe) → se puede ejecutar contra una BD nueva, una ya
 * migrada o la de producción sin errores ni pérdida de datos.
 *
 * Tablas nuevas:
 *   action_items    C2 — tareas del plan de acción de cada informe
 *   ledger_entries  V1 — libro de ingresos y gastos (facturas)
 *   tax_reserves    V2 — lo que el usuario lleva apartado para Hacienda
 *   api_keys        F4 — claves de API por licencia (hash, nunca en claro)
 *   client_errors   C8 — errores técnicos del frontend/backend (sin datos financieros)
 *   reminders_sent  C4 — avisos del calendario fiscal ya enviados (anti-duplicado)
 *
 * Columnas nuevas:
 *   analyses.result_json / meta_json   F1 — salida estructurada + metadatos (C1)
 *   company_profiles.*                 perfil ampliado (forma jurídica, NIF,
 *                                      idioma, avisos fiscales, caja…)
 */

'use strict';

function hasColumn(db, table, column) {
  return db.prepare(`PRAGMA table_info(${table})`).all().some(c => c.name === column);
}

function ensureColumn(db, table, column, ddl) {
  if (!hasColumn(db, table, column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddl}`);
    console.log(`✅ Migración sesión 4: añadida columna ${table}.${column}`);
  }
}

function runSession4Schema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS action_items (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      license_id   INTEGER NOT NULL REFERENCES licenses(id) ON DELETE CASCADE,
      analysis_id  INTEGER REFERENCES analyses(id) ON DELETE CASCADE,
      title        TEXT    NOT NULL,
      detail       TEXT    NOT NULL DEFAULT '',
      timeframe    TEXT    NOT NULL DEFAULT '',
      position     INTEGER NOT NULL DEFAULT 0,
      done         INTEGER NOT NULL DEFAULT 0,
      done_at      TEXT    DEFAULT NULL,
      created_at   TEXT    NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_actions_license  ON action_items(license_id, done);
    CREATE INDEX IF NOT EXISTS idx_actions_analysis ON action_items(analysis_id);

    CREATE TABLE IF NOT EXISTS ledger_entries (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      license_id     INTEGER NOT NULL REFERENCES licenses(id) ON DELETE CASCADE,
      type           TEXT    NOT NULL CHECK(type IN ('income','expense')),
      party_name     TEXT    NOT NULL DEFAULT '',
      party_nif      TEXT    NOT NULL DEFAULT '',
      invoice_number TEXT    NOT NULL DEFAULT '',
      invoice_date   TEXT    NOT NULL,
      due_date       TEXT    DEFAULT NULL,
      concept        TEXT    NOT NULL DEFAULT '',
      category       TEXT    NOT NULL DEFAULT '',
      base           REAL    NOT NULL DEFAULT 0,
      vat_rate       REAL    NOT NULL DEFAULT 0,
      vat_amount     REAL    NOT NULL DEFAULT 0,
      irpf_rate      REAL    NOT NULL DEFAULT 0,
      irpf_amount    REAL    NOT NULL DEFAULT 0,
      total          REAL    NOT NULL DEFAULT 0,
      paid           INTEGER NOT NULL DEFAULT 0,
      paid_at        TEXT    DEFAULT NULL,
      source         TEXT    NOT NULL DEFAULT 'manual' CHECK(source IN ('manual','ai')),
      file_name      TEXT    NOT NULL DEFAULT '',
      needs_review   INTEGER NOT NULL DEFAULT 0,
      created_at     TEXT    NOT NULL DEFAULT (datetime('now')),
      updated_at     TEXT    NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_ledger_license_date ON ledger_entries(license_id, invoice_date);

    CREATE TABLE IF NOT EXISTS tax_reserves (
      license_id  INTEGER NOT NULL REFERENCES licenses(id) ON DELETE CASCADE,
      year        INTEGER NOT NULL,
      quarter     INTEGER NOT NULL CHECK(quarter BETWEEN 1 AND 4),
      amount      REAL    NOT NULL DEFAULT 0,
      updated_at  TEXT    NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (license_id, year, quarter)
    );

    CREATE TABLE IF NOT EXISTS api_keys (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      license_id    INTEGER NOT NULL REFERENCES licenses(id) ON DELETE CASCADE,
      name          TEXT    NOT NULL DEFAULT '',
      key_hash      TEXT    NOT NULL UNIQUE,
      prefix        TEXT    NOT NULL,
      created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
      last_used_at  TEXT    DEFAULT NULL,
      revoked_at    TEXT    DEFAULT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_api_keys_license ON api_keys(license_id);

    CREATE TABLE IF NOT EXISTS client_errors (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      source      TEXT    NOT NULL DEFAULT 'client' CHECK(source IN ('client','server')),
      message     TEXT    NOT NULL DEFAULT '',
      stack       TEXT    NOT NULL DEFAULT '',
      path        TEXT    NOT NULL DEFAULT '',
      version     TEXT    NOT NULL DEFAULT '',
      user_agent  TEXT    NOT NULL DEFAULT '',
      created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_client_errors_ts ON client_errors(created_at);

    CREATE TABLE IF NOT EXISTS reminders_sent (
      license_id    INTEGER NOT NULL REFERENCES licenses(id) ON DELETE CASCADE,
      deadline_key  TEXT    NOT NULL,
      lead_days     INTEGER NOT NULL,
      sent_at       TEXT    NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (license_id, deadline_key, lead_days)
    );
  `);

  ensureColumn(db, 'analyses', 'result_json', 'TEXT DEFAULT NULL');
  ensureColumn(db, 'analyses', 'meta_json', 'TEXT DEFAULT NULL');

  ensureColumn(db, 'company_profiles', 'legal_form', "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, 'company_profiles', 'tax_id', "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, 'company_profiles', 'lang', "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, 'company_profiles', 'fiscal_reminders', 'INTEGER NOT NULL DEFAULT 0');
  ensureColumn(db, 'company_profiles', 'cash_balance', 'REAL DEFAULT NULL');
  ensureColumn(db, 'company_profiles', 'cash_balance_date', 'TEXT DEFAULT NULL');
  ensureColumn(db, 'company_profiles', 'cash_alert_threshold', 'REAL NOT NULL DEFAULT 0');
}

module.exports = { runSession4Schema, ensureColumn, hasColumn };
