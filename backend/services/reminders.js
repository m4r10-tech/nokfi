/**
 * services/reminders.js — C4: avisos por email del calendario fiscal.
 *
 * Cada 6 h (y 1 min después de arrancar) recorre las licencias activas con
 * `fiscal_reminders` activado y envía, por cada plazo, un aviso 7 días antes
 * y otro 1 día antes. `reminders_sent` (PK license+plazo+antelación) evita
 * duplicados aunque el proceso se reinicie. Si el envío falla, se borra la
 * marca para reintentarlo en la siguiente pasada.
 */

'use strict';

const { getDB } = require('../db/database');
const { upcoming } = require('../utils/fiscalCalendar');
const { sendFiscalReminderEmail } = require('../utils/mailer');

const LEADS = [7, 1];

async function runFiscalReminders(now = new Date()) {
  const db = getDB();
  const rows = db.prepare(`
    SELECT l.id, l.email, p.legal_form, p.lang
    FROM licenses l JOIN company_profiles p ON p.license_id = l.id
    WHERE l.status = 'active' AND p.fiscal_reminders = 1
  `).all();
  const mark = db.prepare('INSERT OR IGNORE INTO reminders_sent (license_id, deadline_key, lead_days) VALUES (?, ?, ?)');
  const unmark = db.prepare('DELETE FROM reminders_sent WHERE license_id = ? AND deadline_key = ? AND lead_days = ?');
  const today = now.toISOString().slice(0, 10);
  let sent = 0;
  for (const r of rows) {
    for (const d of upcoming(r.legal_form || undefined, today, 6)) {
      // Antelación que toca ahora: 1 si queda ≤1 día; 7 si quedan 2..7 días.
      const lead = d.days_left <= 1 ? 1 : d.days_left <= 7 ? 7 : null;
      if (!lead || !LEADS.includes(lead)) continue;
      if (mark.run(r.id, d.key, lead).changes === 0) continue; // ya enviado
      try {
        await sendFiscalReminderEmail({ to: r.email, lang: r.lang || 'es', deadline: d, daysLeft: d.days_left });
        sent++;
      } catch (e) {
        unmark.run(r.id, d.key, lead);
        console.error('[REMINDERS] Fallo enviando aviso fiscal:', e.message);
      }
    }
  }
  if (sent) console.log(`[REMINDERS] ${sent} avisos fiscales enviados`);
  return sent;
}

function startReminderScheduler() {
  if (process.env.NODE_ENV === 'test') return;
  const tick = async () => {
    await runFiscalReminders().catch(e => console.error('[REMINDERS]', e.message));
    // Resumen mensual (días 1-3 del mes) y reclamación automática de cobros.
    await require('./monthlySummary').runMonthlySummaries().catch(e => console.error('[SUMMARY]', e.message));
    await require('./collections').runAutoCollections().catch(e => console.error('[COLLECTIONS]', e.message));
  };
  setTimeout(tick, 60 * 1000).unref();
  setInterval(tick, 6 * 60 * 60 * 1000).unref();
}

module.exports = { runFiscalReminders, startReminderScheduler };
