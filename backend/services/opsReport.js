/**
 * services/opsReport.js — email diario de salud para el dueño de Nokfi.
 *
 * Una vez al día (primer tick del programador a partir de las 05:00 UTC,
 * ~07:00 en España) resume las últimas 24 h: errores de la app (client_errors), fallos
 * de la IA y de los emails (audit_log), estado de la copia de seguridad y del
 * disco, y actividad (altas, bajas, pagos fallidos, análisis). El asunto
 * empieza por ⚠ si hay algo que mirar. Sin datos de usuarios: solo recuentos
 * y mensajes técnicos. Destino: OPS_EMAIL (por defecto admin@nokfi.app).
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { getDB } = require('../db/database');
const { sendOpsReportEmail } = require('../utils/mailer');

const BACKUP_DIR = path.join(__dirname, '..', 'db', 'backups');
const BACKUP_MAX_AGE_H = 26;
const DISK_MIN_FREE_PCT = 15;

function ensureTable() {
  getDB().exec('CREATE TABLE IF NOT EXISTS ops_runs (key TEXT PRIMARY KEY, ran_at TEXT NOT NULL DEFAULT (datetime(\'now\')))');
}

function backupStatus(now = Date.now()) {
  try {
    const files = fs.readdirSync(BACKUP_DIR).filter(f => /^nokfi-.*\.db$/.test(f))
      .map(f => ({ f, st: fs.statSync(path.join(BACKUP_DIR, f)) })).sort((a, b) => b.st.mtimeMs - a.st.mtimeMs);
    if (!files.length) return { ok: false, text: 'No hay ninguna copia de seguridad' };
    const ageH = Math.round((now - files[0].st.mtimeMs) / 36e5);
    let offsite = process.env.R2_BUCKET ? 'copia en R2: aún no se ha subido ninguna' : 'copia fuera del servidor (R2): sin configurar';
    let offOk = !process.env.R2_BUCKET;
    try {
      const ts = Number(fs.readFileSync(path.join(BACKUP_DIR, 'offsite.ok'), 'utf8').trim()) * 1000;
      const offH = Math.round((now - ts) / 36e5);
      offOk = offH <= BACKUP_MAX_AGE_H;
      offsite = `copia en R2 hace ${offH} h`;
    } catch { /* sin subir aún */ }
    return {
      ok: ageH <= BACKUP_MAX_AGE_H && offOk,
      text: `Última copia hace ${ageH} h (${files[0].f}, ${Math.round(files[0].st.size / 1024)} KB, ${files.length} guardadas) · ${offsite}`
    };
  } catch {
    return { ok: false, text: 'No se pudo leer la carpeta de copias' };
  }
}

function diskStatus() {
  try {
    const line = execFileSync('df', ['-P', '/'], { encoding: 'utf8' }).trim().split('\n').pop().split(/\s+/);
    const usedPct = Number(String(line[4]).replace('%', ''));
    return { ok: 100 - usedPct >= DISK_MIN_FREE_PCT, text: `Disco: ${usedPct} % usado` };
  } catch {
    return { ok: true, text: 'Disco: no disponible' };
  }
}

/** Consumo de IA de AYER por proveedor (sesión 7), con su tope si lo tiene. */
function providerUsage(now) {
  const { usage, budgetFor } = require('../utils/aiBudget');
  const day = new Date(now.getTime() - 86400000).toISOString().slice(0, 10);
  return getDB().prepare('SELECT DISTINCT provider FROM ai_provider_usage WHERE day >= ?').all(day.slice(0, 7) + '-01')
    .map(({ provider }) => ({ provider, day, ...usage(provider, day), budget: budgetFor(provider) }));
}

function buildOpsReport(now = new Date()) {
  const db = getDB();
  const since = "datetime('now', '-1 day')";
  const count = (sql, ...a) => db.prepare(sql).get(...a).c;
  const events = db.prepare(`SELECT event, COUNT(*) c FROM audit_log WHERE ts >= ${since} GROUP BY event`).all();
  const ev = (name) => (events.find(e => e.event === name) || { c: 0 }).c;
  const errors = db.prepare(`SELECT source, message, COUNT(*) c FROM client_errors WHERE created_at >= ${since}
    GROUP BY source, message ORDER BY c DESC LIMIT 8`).all();
  const aiFails = db.prepare(`SELECT detail, COUNT(*) c FROM audit_log WHERE ts >= ${since} AND event = 'AI_PROVIDER_FAILED'
    GROUP BY detail ORDER BY c DESC LIMIT 5`).all();
  const mailFails = db.prepare(`SELECT detail, COUNT(*) c FROM audit_log WHERE ts >= ${since} AND event = 'EMAIL_FAILED'
    GROUP BY detail ORDER BY c DESC LIMIT 5`).all();

  const backup = backupStatus(now.getTime());
  const disk = diskStatus();
  const report = {
    date: now.toISOString().slice(0, 10),
    backup, disk,
    errors, errorsTotal: errors.reduce((s, e) => s + e.c, 0),
    ai: { ok: ev('AI_ANALYSIS_GENERATED'), failed: ev('AI_ANALYSIS_FAILED'), providerFails: aiFails, usage: providerUsage(now) },
    mail: { failed: mailFails },
    activity: {
      active_licenses: count("SELECT COUNT(*) c FROM licenses WHERE status = 'active'"),
      new_licenses: ev('LICENSE_CREATED_STRIPE_SUB'),
      paid: ev('SUBSCRIPTION_FIRST_PAID') + ev('SUBSCRIPTION_RENEWED'),
      payment_failed: ev('SUBSCRIPTION_PAYMENT_FAILED'),
      cancelled: ev('SUBSCRIPTION_CANCEL_SCHEDULED') + ev('SUBSCRIPTION_DELETED'),
      logins: ev('LOGIN_SUCCESS'),
      ledger_entries: count(`SELECT COUNT(*) c FROM ledger_entries WHERE created_at >= ${since}`)
    }
  };
  report.alerts = [
    !backup.ok && backup.text,
    !disk.ok && disk.text,
    report.ai.failed > 0 && `${report.ai.failed} análisis de IA fallidos`,
    ...report.ai.usage.filter(u => u.budget?.monthlyUsd && u.month_usd >= u.budget.monthlyUsd * 0.8)
      .map(u => `${u.provider}: gasto estimado del mes ${u.month_usd.toFixed(2)} $ (tope ${u.budget.monthlyUsd} $)`),
    ...require('../utils/aiBudget').expiringSoon(now).map(x => x.days > 0
      ? `${x.provider} caduca el ${x.date} (en ${x.days} días): quítalo del .env (AI_PROVIDERS, CHAT_PROVIDERS) y de privacidad/encargo`
      : `${x.provider} caducó el ${x.date} y ya no se usa: quítalo del .env y de privacidad/encargo`),
    mailFails.length > 0 && `${mailFails.reduce((s, m) => s + m.c, 0)} emails no enviados`,
    report.errorsTotal >= 10 && `${report.errorsTotal} errores de la app`,
    report.activity.payment_failed > 0 && `${report.activity.payment_failed} pagos fallidos`,
    ev('CHARGEBACK_UNRESOLVED') + ev('LICENSE_REVOKED_CHARGEBACK') > 0 && 'Contracargo (chargeback) recibido'
  ].filter(Boolean);
  return report;
}

/** Envía el informe si hoy aún no se ha enviado y ya son las 07:00 o más. */
async function runOpsReport(now = new Date(), { force = false } = {}) {
  if (!force && now.getUTCHours() < 5) return false; // ~07:00 en España
  ensureTable();
  const key = `ops-${now.toISOString().slice(0, 10)}`;
  const db = getDB();
  if (db.prepare('INSERT OR IGNORE INTO ops_runs (key) VALUES (?)').run(key).changes === 0) return false;
  try {
    await sendOpsReportEmail({ to: process.env.OPS_EMAIL || 'admin@nokfi.app', report: buildOpsReport(now) });
    return true;
  } catch (e) {
    db.prepare('DELETE FROM ops_runs WHERE key = ?').run(key);
    console.error('[OPS] Fallo enviando el informe diario:', e.message);
    return false;
  }
}

module.exports = { buildOpsReport, runOpsReport, backupStatus };
