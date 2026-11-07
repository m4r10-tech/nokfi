/**
 * db/credits.js — paquetes de créditos (S15b, U1).
 *
 * Esquema (idempotente, se ejecuta en initDB):
 *   licenses.ai_credits   saldo de créditos de paquetes de la cuenta (no caducan).
 *                         Un único saldo para la web y la API /api/v1 (Q3).
 *   credit_purchases      una fila por compra pagada; stripe_session_id UNIQUE es
 *                         la llave de idempotencia: el mismo checkout nunca
 *                         acredita dos veces aunque Stripe repita el evento.
 *
 * Consumo (Q2): primero los créditos del día del plan (tabla ai_usage) y, cuando
 * se acaban, uno del saldo. takeCredit() es un UPDATE condicionado (atómico en
 * better-sqlite3, mismo criterio anti-TOCTOU que reserveAiSlot): dos peticiones
 * a la vez nunca dejan el saldo en negativo. Si la IA falla, refundCredit()
 * lo devuelve (el análisis fallido no cuenta, igual que con la cuota diaria).
 */

'use strict';

const { getDB } = require('./database');
const { ensureColumn } = require('./schema4');

function runCreditsSchema(db) {
  ensureColumn(db, 'licenses', 'ai_credits', 'INTEGER NOT NULL DEFAULT 0');
  db.exec(`
    CREATE TABLE IF NOT EXISTS credit_purchases (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      license_id        INTEGER NOT NULL REFERENCES licenses(id) ON DELETE CASCADE,
      pack              TEXT    NOT NULL,
      credits           INTEGER NOT NULL,
      amount_cents      INTEGER,
      currency          TEXT,
      stripe_session_id TEXT    NOT NULL UNIQUE,
      payment_intent    TEXT,
      livemode          INTEGER NOT NULL DEFAULT 0,
      created_at        TEXT    NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_credit_purchases_license ON credit_purchases(license_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_credit_purchases_pi      ON credit_purchases(payment_intent);
  `);
}

/** Saldo de créditos de paquetes de la cuenta. */
function creditBalance(license_id) {
  const r = getDB().prepare('SELECT ai_credits FROM licenses WHERE id = ?').get(license_id);
  return r ? Number(r.ai_credits) || 0 : 0;
}

/** Gasta 1 crédito del saldo si queda alguno. Devuelve true si lo ha gastado. */
function takeCredit(license_id) {
  return getDB().prepare('UPDATE licenses SET ai_credits = ai_credits - 1 WHERE id = ? AND ai_credits > 0').run(license_id).changes === 1;
}

/** Devuelve 1 crédito (la IA falló después de gastarlo). */
function refundCredit(license_id) {
  getDB().prepare('UPDATE licenses SET ai_credits = ai_credits + 1 WHERE id = ?').run(license_id);
}

/**
 * Acredita un paquete UNA sola vez por Checkout Session (idempotente).
 * @returns {{ credited: boolean, balance: number }}
 */
function grantPack({ license_id, pack, credits, amount_cents = null, currency = null, session_id, payment_intent = null, livemode = false }) {
  const db = getDB();
  return db.transaction(() => {
    const ins = db.prepare(`
      INSERT OR IGNORE INTO credit_purchases (license_id, pack, credits, amount_cents, currency, stripe_session_id, payment_intent, livemode)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(license_id, pack, credits, amount_cents, currency, session_id, payment_intent, livemode ? 1 : 0);
    if (ins.changes === 0) return { credited: false, balance: creditBalance(license_id) };
    db.prepare('UPDATE licenses SET ai_credits = ai_credits + ? WHERE id = ?').run(credits, license_id);
    return { credited: true, balance: creditBalance(license_id) };
  })();
}

/** Compras de la cuenta, la más reciente primero. */
function listPurchases(license_id, limit = 20) {
  return getDB().prepare(
    'SELECT pack, credits, amount_cents, currency, created_at FROM credit_purchases WHERE license_id = ? ORDER BY id DESC LIMIT ?'
  ).all(license_id, limit);
}

/** Compra de un paquete por el pi_… del cobro (contracargos). */
function purchaseByPaymentIntent(payment_intent) {
  if (!payment_intent) return null;
  return getDB().prepare('SELECT * FROM credit_purchases WHERE payment_intent = ?').get(payment_intent) || null;
}

module.exports = { runCreditsSchema, creditBalance, takeCredit, refundCredit, grantPack, listPurchases, purchaseByPaymentIntent };
