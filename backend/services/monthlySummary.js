/**
 * services/monthlySummary.js — resumen mensual por email (sesión 4).
 *
 * El día 1 de cada mes (primer tick del programador ≥ 08:00 UTC) cada
 * licencia activa con `monthly_summary` recibe cómo cerró el mes anterior y
 * qué le viene: resultado del mes, impuestos del trimestre, cobros
 * pendientes, gastos recurrentes, caja y próximo plazo fiscal. Solo se
 * envía si hay algo que contar (libro o análisis). `reminders_sent`
 * (clave `summary-YYYY-MM`) evita duplicados. Todo sale de cálculos
 * deterministas (utils/finance.js): la IA no interviene.
 */

'use strict';

const { getDB, getCompanyProfile } = require('../db/database');
const F = require('../db/finance');
const { taxSummary, receivables, leaks, forecast, quarterOf } = require('../utils/finance');
const { upcoming, iso } = require('../utils/fiscalCalendar');
const { actionStats } = require('../db/actions');
const { sendMonthlySummaryEmail } = require('../utils/mailer');

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

/** Datos del resumen de `month` ('YYYY-MM', el mes que acaba de cerrar). */
function buildSummary(licenseId, month, today) {
  const profile = getCompanyProfile(licenseId) || {};
  const entries = F.allEntries(licenseId);
  const analyses = getDB().prepare('SELECT COUNT(*) c FROM analyses WHERE license_id = ?').get(licenseId).c;
  if (!entries.length && !analyses) return null;

  const inMonth = entries.filter(e => e.invoice_date.startsWith(month));
  const income = inMonth.filter(e => e.type === 'income').reduce((s, e) => s + e.base, 0);
  const expense = inMonth.filter(e => e.type === 'expense').reduce((s, e) => s + e.base, 0);
  const cq = quarterOf(today);
  const tax = taxSummary(entries, { ...cq, legalForm: profile.legal_form, reserve: F.getReserve(licenseId, cq.year, cq.quarter) });
  const rec = receivables(entries, today);
  const lk = leaks(entries, today);
  const out = {
    company: profile.company_name || '',
    lang: profile.lang || 'es',
    month,
    invoices: inMonth.length,
    income: r2(income), expense: r2(expense), result: r2(income - expense),
    taxes: { quarter: `${cq.quarter}T ${cq.year}`, estimated: tax.total_estimated, reserved: tax.reserved, due_date: tax.due_date },
    receivables: { total: rec.total, count: rec.pending.length, overdue_60: rec.overdue_60 },
    recurring_monthly: lk.recurring_monthly_total,
    alerts: lk.increases.length + lk.duplicates.length,
    actions_open: actionStats(licenseId).open,
    next_deadline: upcoming(profile.legal_form || undefined, today, 1)[0] || null,
    forecast: null
  };
  if (profile.cash_balance != null && entries.length) {
    const fc = forecast({ entries, balance: profile.cash_balance, days: 30, threshold: profile.cash_alert_threshold || 0, legalForm: profile.legal_form, refDate: today });
    out.forecast = { at30: fc.at30, min: fc.min, first_below: fc.first_below, threshold: fc.threshold };
  }
  return out;
}

function previousMonth(todayIso) {
  const d = new Date(`${todayIso.slice(0, 7)}-01T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() - 1);
  return d.toISOString().slice(0, 7);
}

/** Envía los resúmenes pendientes. Solo actúa los días 1-3 del mes. */
async function runMonthlySummaries(now = new Date()) {
  const today = iso(now);
  if (Number(today.slice(8, 10)) > 3) return 0;
  const month = previousMonth(today);
  const key = `summary-${month}`;
  const db = getDB();
  const rows = db.prepare(`
    SELECT l.id, l.email FROM licenses l JOIN company_profiles p ON p.license_id = l.id
    WHERE l.status = 'active' AND p.monthly_summary = 1
  `).all();
  const mark = db.prepare('INSERT OR IGNORE INTO reminders_sent (license_id, deadline_key, lead_days) VALUES (?, ?, 0)');
  const unmark = db.prepare('DELETE FROM reminders_sent WHERE license_id = ? AND deadline_key = ? AND lead_days = 0');
  let sent = 0;
  for (const r of rows) {
    const data = buildSummary(r.id, month, today);
    if (!data) continue;
    if (mark.run(r.id, key).changes === 0) continue;
    try {
      await sendMonthlySummaryEmail({ to: r.email, data });
      sent++;
    } catch (e) {
      unmark.run(r.id, key);
      console.error('[SUMMARY] Fallo enviando el resumen mensual:', e.message);
    }
  }
  if (sent) console.log(`[SUMMARY] ${sent} resúmenes mensuales enviados (${month})`);
  return sent;
}

module.exports = { buildSummary, runMonthlySummaries, previousMonth };
