/**
 * services/webEvents.js — sesión 12: eventos de la web pública, sin cookies.
 *
 * Solo recuentos por día, evento y página (sin IP, sin user-agent, sin
 * identificadores): cuántas veces se pulsa «Probar gratis», cuántos pagos se
 * empiezan y cuántas veces se usa cada herramienta pública. Las visitas las
 * cuenta Cloudflare Web Analytics; esto completa lo que Cloudflare no mide.
 * Se ven en el informe diario (services/opsReport.js).
 */

'use strict';

const { getDB } = require('../db/database');

const EVENTS = ['cta_trial', 'checkout_start', 'tool_use'];
const MAX_ROWS_PER_DAY = 500; // tope ante envíos falsos con rutas inventadas

let ready = false;
function ensureTable() {
  if (ready) return;
  getDB().exec(`CREATE TABLE IF NOT EXISTS web_events (
    day   TEXT    NOT NULL,
    name  TEXT    NOT NULL,
    path  TEXT    NOT NULL DEFAULT '',
    count INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (day, name, path)
  )`);
  ready = true;
}

/** Ruta limpia (sin query ni hash) o '' si no parece una ruta de la web. */
function cleanPath(p) {
  const s = String(p || '').split(/[?#]/)[0].toLowerCase();
  return /^\/[a-z0-9\-/]{0,80}$/.test(s) ? s.replace(/\/+$/, '') || '/' : '';
}

/** Suma 1 al evento. Devuelve false si no es un evento conocido. */
function recordEvent(name, path, now = new Date()) {
  if (!EVENTS.includes(name)) return false;
  ensureTable();
  const db = getDB();
  const day = now.toISOString().slice(0, 10);
  let p = cleanPath(path);
  const exists = db.prepare('SELECT 1 FROM web_events WHERE day = ? AND name = ? AND path = ?').get(day, name, p);
  if (!exists && db.prepare('SELECT COUNT(*) c FROM web_events WHERE day = ?').get(day).c >= MAX_ROWS_PER_DAY) p = '';
  db.prepare(`INSERT INTO web_events (day, name, path, count) VALUES (?, ?, ?, 1)
    ON CONFLICT(day, name, path) DO UPDATE SET count = count + 1`).run(day, name, p);
  return true;
}

/** Recuentos de un día: { totals: { evento: n }, top: [{ name, path, count }] }. */
function eventsForDay(day) {
  ensureTable();
  const rows = getDB().prepare('SELECT name, path, count FROM web_events WHERE day = ? ORDER BY count DESC').all(day);
  const totals = Object.fromEntries(EVENTS.map(e => [e, 0]));
  for (const r of rows) totals[r.name] += r.count;
  return { totals, top: rows.slice(0, 8) };
}

module.exports = { EVENTS, recordEvent, eventsForDay, cleanPath };
