/**
 * services/collections.js — reclamación automática de cobros (sesión 4).
 *
 * Para las licencias con `auto_collections` activado, cada factura EMITIDA sin
 * cobrar que tenga email del cliente recibe un recordatorio a los 7 días del
 * vencimiento (amable), a los 30 (firme) y a los 60 (formal). Sin fecha de
 * vencimiento se asume emisión + 30 días. Se envía solo la etapa que toca
 * (nunca varias de golpe) y nada si lleva más de 180 días vencida: esas se
 * reclaman a mano. Plantillas fijas (utils/mailer.js), sin IA. El cliente
 * responde directamente al usuario (Reply-To). `reminders_sent` con clave
 * `collect-<id>` y la etapa como `lead_days` evita duplicados.
 */

'use strict';

const { getDB, getCompanyProfile } = require('../db/database');
const { sendCollectionEmail } = require('../utils/mailer');

const STAGES = [[60, 3], [30, 2], [7, 1]];
const MAX_OVERDUE = 180;
const MAX_PER_RUN = 25;
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
  const today = now.toISOString().slice(0, 10);
  const db = getDB();
  const licenses = db.prepare(`
    SELECT l.id, l.email FROM licenses l JOIN company_profiles p ON p.license_id = l.id
    WHERE l.status = 'active' AND p.auto_collections = 1
  `).all();
  const mark = db.prepare('INSERT OR IGNORE INTO reminders_sent (license_id, deadline_key, lead_days) VALUES (?, ?, ?)');
  const unmark = db.prepare('DELETE FROM reminders_sent WHERE license_id = ? AND deadline_key = ? AND lead_days = ?');
  let sent = 0;
  for (const lic of licenses) {
    const profile = getCompanyProfile(lic.id) || {};
    const done = sentStages(lic.id);
    const entries = db.prepare(`SELECT * FROM ledger_entries WHERE license_id = ? AND type = 'income' AND paid = 0 AND party_email != ''`).all(lic.id);
    let n = 0;
    for (const e of entries) {
      if (n >= MAX_PER_RUN) break;
      const stage = stageFor(e, today);
      if (!stage || stage <= (done[e.id] || 0)) continue;
      const key = `collect-${e.id}`;
      if (mark.run(lic.id, key, stage).changes === 0) continue;
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

module.exports = { runAutoCollections, stageFor, sentStages };
