/**
 * services/collections.js — reclamación automática de cobros (sesión 4).
 *
 * Para las licencias con `auto_collections` activado, cada factura EMITIDA sin
 * cobrar que tenga email del cliente recibe un recordatorio a los 7 días del
 * vencimiento (amable), a los 30 (firme) y a los 60 (formal). Sin fecha de
 * vencimiento se asume emisión + 30 días. Se envía solo la etapa que toca
 * (nunca varias de golpe) y nada si lleva más de 180 días vencida: esas se
 * reclaman a mano. S15b: la PRIMERA comunicación siempre es la amable (aunque la
 * factura ya lleve 40 días vencida al activar la reclamación) y luego se sube de
 * una en una, con al menos MIN_GAP_DAYS entre avisos. Plantillas fijas (utils/mailer.js), sin IA. El cliente
 * responde directamente al usuario (Reply-To). `reminders_sent` con clave
 * `collect-<id>` y la etapa como `lead_days` evita duplicados.
 */

'use strict';

const { getDB, getCompanyProfile } = require('../db/database');
const { sendCollectionEmail } = require('../utils/mailer');

const STAGES = [[60, 3], [30, 2], [7, 1]];
const MAX_OVERDUE = 180;
const MAX_PER_RUN = 25;
const MIN_GAP_DAYS = 14;
const DAY = 86400000;

const addDays = (isoDate, n) => new Date(Date.parse(`${isoDate}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);
const daysBetween = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY);

/** Etapa que corresponde hoy a una factura (0 = ninguna). */
function stageFor(entry, today) {
  const due = entry.due_date || addDays(entry.invoice_date, 30);
  const overdue = daysBetween(due, today);
  if (overdue > MAX_OVERDUE) return 0;
  const hit = STAGES.find(([d]) => overdue >= d);
  return hit ? hit[1] : 0;
}

/**
 * S15b: etapa que se envía hoy a una factura, sabiendo la última enviada y
 * cuándo (`lastSentDay` AAAA-MM-DD). 0 = nada. Nunca salta etapas: sin avisos
 * previos va la amable (1); después, la siguiente cuando ya toca por días y han
 * pasado MIN_GAP_DAYS desde el último aviso.
 */
function nextStage(entry, today, sentStage = 0, lastSentDay = null) {
  const due = stageFor(entry, today);
  if (!due || due <= sentStage) return 0;
  if (sentStage && lastSentDay && daysBetween(lastSentDay, today) < MIN_GAP_DAYS) return 0;
  return sentStage + 1;
}

/** Fecha (AAAA-MM-DD) del último aviso enviado por factura: { [entryId]: día }. */
function lastSentDays(licenseId) {
  const out = {};
  for (const r of getDB().prepare(`SELECT deadline_key k, MAX(sent_at) d FROM reminders_sent
      WHERE license_id = ? AND deadline_key LIKE 'collect-%' GROUP BY deadline_key`).all(licenseId)) {
    out[Number(r.k.slice(8))] = String(r.d || '').slice(0, 10);
  }
  return out;
}

/** Etapas ya enviadas por factura: { [entryId]: etapa máxima }. */
function sentStages(licenseId) {
  const out = {};
  for (const r of getDB().prepare(`SELECT deadline_key k, MAX(lead_days) s FROM reminders_sent
      WHERE license_id = ? AND deadline_key LIKE 'collect-%' GROUP BY deadline_key`).all(licenseId)) {
    out[Number(r.k.slice(8))] = r.s;
  }
  return out;
}

async function runAutoCollections(now = new Date()) {
  // Programador horario: no enviar emails de madrugada (07:00 UTC ≈ 09:00 en España).
  if (now.getUTCHours() < 7) return 0;
  const today = now.toISOString().slice(0, 10);
  const db = getDB();
  const licenses = db.prepare(`
    SELECT l.id, l.email FROM licenses l JOIN company_profiles p ON p.license_id = l.id
    WHERE l.status = 'active' AND p.auto_collections = 1
  `).all();
  // sent_at con la hora del propio run (no la del reloj) para que el hueco entre avisos se mida igual en los tests.
  const sentAt = now.toISOString().slice(0, 19).replace('T', ' ');
  const mark = db.prepare('INSERT OR IGNORE INTO reminders_sent (license_id, deadline_key, lead_days, sent_at) VALUES (?, ?, ?, ?)');
  const unmark = db.prepare('DELETE FROM reminders_sent WHERE license_id = ? AND deadline_key = ? AND lead_days = ?');
  let sent = 0;
  for (const lic of licenses) {
    const profile = getCompanyProfile(lic.id) || {};
    const done = sentStages(lic.id);
    const lastDay = lastSentDays(lic.id);
    // Sesión 11: nunca se reclama una factura que el cliente ha rechazado.
    // Lo que se reclama es lo que queda tras las rectificativas; ni estas ni lo ya saldado se reclaman.
    const entries = db.prepare(`SELECT l.*, l.total + COALESCE((SELECT SUM(r.total) FROM invoices r WHERE r.rectifies_id = l.invoice_id AND r.status = 'issued'), 0) AS due_total
      FROM ledger_entries l WHERE l.license_id = ? AND l.type = 'income' AND l.paid = 0 AND l.party_email != ''
      AND (l.invoice_id IS NULL OR l.invoice_id NOT IN (SELECT id FROM invoices WHERE customer_status = 'rejected' OR rectifies_id IS NOT NULL))`)
      .all(lic.id).filter(e => e.due_total > 0.005).map(e => ({ ...e, total: Math.round(e.due_total * 100) / 100 }));
    let n = 0;
    for (const e of entries) {
      if (n >= MAX_PER_RUN) break;
      const stage = nextStage(e, today, done[e.id] || 0, lastDay[e.id]);
      if (!stage) continue;
      const key = `collect-${e.id}`;
      if (mark.run(lic.id, key, stage, sentAt).changes === 0) continue;
      try {
        await sendCollectionEmail({
          to: e.party_email, replyTo: lic.email, lang: profile.lang || 'es', stage,
          company: profile.company_name || lic.email, entry: e
        });
        sent++; n++;
      } catch (err) {
        unmark.run(lic.id, key, stage);
        console.error('[COLLECTIONS] Fallo enviando recordatorio de cobro:', err.message);
      }
    }
  }
  if (sent) console.log(`[COLLECTIONS] ${sent} recordatorios de cobro enviados`);
  return sent;
}

module.exports = { runAutoCollections, stageFor, nextStage, sentStages };
