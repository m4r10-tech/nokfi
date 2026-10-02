/**
 * routes/account.js — sesión 4.
 *
 *   F4 — claves de API (sesión web):
 *     GET    /api/keys           lista (sin la clave: solo prefijo)
 *     POST   /api/keys {name}    crea → devuelve la clave UNA vez (solo Pro/Max)
 *     DELETE /api/keys/:id       revoca
 *     GET    /api/keys/summary   resumen del espacio Desarrolladores (sesión 7)
 *
 *   C9 — RGPD autoservicio:
 *     GET    /api/me/export      todos mis datos en JSON
 *     DELETE /api/me {password}  borra la cuenta (antes hay que cancelar la
 *                                suscripción de Stripe: 409 subscription_active)
 *
 *   C8 — POST /api/client-errors  errores técnicos del frontend (sin auth,
 *                                 sin datos del usuario, límite por IP).
 */

'use strict';

const express = require('express');
const rateLimit = require('express-rate-limit');
const { requireLicense } = require('../middleware/requireLicense');
const { API_PLANS } = require('../middleware/requireApiKey');
const {
  getDB, getCompanyProfile, listAnalyses, getAnalysis, deleteLicense, audit, aiQuotaForPlan, countAiAnalysesToday
} = require('../db/database');
const { createApiKey, setApiKeyClient, listApiKeys, revokeApiKey, callsTodayByKey, apiSummary } = require('../db/apikeys');
const { listActions } = require('../db/actions');
const { listLedger } = require('../db/finance');
const { verifyPassword } = require('../utils/password');
const { sanitizeFreeText } = require('../utils/sanitize');

const keys = express.Router();
const me = express.Router();
const telemetry = express.Router();

/* ── F4 ── */
keys.get('/', requireLicense, (req, res) => {
  const calls = callsTodayByKey(req.license.id);
  // available = claves reales (Pro/Max); las de prueba, en todos los planes (sesión 9).
  res.json({ keys: listApiKeys(req.license.id).map(k => ({ ...k, calls_today: calls[k.id] || 0 })), available: API_PLANS.includes(req.license.plan), test_available: true });
});

// Sesión 7 — Resumen de Desarrolladores: llamadas de hoy, cuota, claves activas y último error.
keys.get('/summary', requireLicense, (req, res) => {
  const id = req.license.id;
  res.json({
    plan: req.license.plan,
    available: API_PLANS.includes(req.license.plan),
    quota: { daily: aiQuotaForPlan(req.license.plan), used_today: countAiAnalysesToday(id) },
    ...keyCounts(listApiKeys(id)),
    webhooks_total: getDB().prepare('SELECT COUNT(*) c FROM webhook_endpoints WHERE license_id = ?').get(id).c,
    ...apiSummary(id)
  });
});

// keys_total incluye las revocadas: sirve para marcar "Crea una clave" como hecho.
function keyCounts(list) {
  return { keys_active: list.filter(k => !k.revoked_at).length, keys_total: list.length };
}

keys.post('/', requireLicense, (req, res) => {
  const mode = req.body?.mode === 'test' ? 'test' : 'live';
  // El plan se valida SIEMPRE en el backend, no solo en la UI. Las claves de
  // prueba (sesión 9) están en todos los planes.
  if (mode === 'live' && !API_PLANS.includes(req.license.plan)) {
    return res.status(403).json({ error: 'api_plan_required', message: 'Las claves de API reales están disponibles en los planes Pro y Max. Puedes crear una clave de prueba.' });
  }
  const out = createApiKey(req.license.id, sanitizeFreeText(req.body?.name || ''), { mode, client: sanitizeFreeText(req.body?.client || '') });
  if (out.error) return res.status(400).json({ error: out.error, message: 'Has alcanzado el máximo de claves activas.' });
  audit('API_KEY_CREATED', { license_id: req.license.id, ip: req.ip, detail: `id=${out.id} mode=${mode}` });
  res.status(201).json(out);
});

// Sesión 9 — Clientes: asignar una clave a un cliente final ('' = sin cliente).
keys.patch('/:id', requireLicense, (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || typeof req.body?.client !== 'string') return res.status(400).json({ error: 'invalid_input' });
  if (!setApiKeyClient(req.license.id, id, sanitizeFreeText(req.body.client).trim())) return res.status(404).json({ error: 'not_found' });
  res.json({ success: true });
});

keys.delete('/:id', requireLicense, (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || !revokeApiKey(req.license.id, id)) return res.status(404).json({ error: 'not_found' });
  audit('API_KEY_REVOKED', { license_id: req.license.id, ip: req.ip, detail: `id=${id}` });
  res.json({ success: true });
});

/* ── C9 ── */
me.get('/export', requireLicense, (req, res) => {
  const l = req.license;
  const db = getDB();
  const analyses = listAnalyses(l.id, 10000).map(a => {
    const full = getAnalysis(l.id, a.id);
    return { id: a.id, kind: a.kind, title: a.title, created_at: a.created_at, report: full.result_json || undefined, html: full.result_json ? undefined : full.result_html };
  });
  audit('DATA_EXPORTED', { license_id: l.id, ip: req.ip });
  res.setHeader('Content-Disposition', 'attachment; filename="nokfi-mis-datos.json"');
  res.json({
    exported_at: new Date().toISOString(),
    account: {
      email: l.email, plan: l.plan, status: l.status, billing_model: l.billing_model, created_at: l.created_at,
      current_period_ends_at: l.current_period_ends_at, cancel_at_period_end: !!l.cancel_at_period_end, trial_ends_at: l.trial_ends_at,
      device_name: l.device_name
    },
    company_profile: getCompanyProfile(l.id),
    analyses,
    action_items: listActions(l.id, { limit: 10000 }),
    ledger_entries: listLedger(l.id),
    // Sesión 11: facturación.
    billing_profile: require('../db/invoicing').getBillingProfile(l.id),
    customers: require('../db/invoicing').listCustomers(l.id),
    invoices: [true, false].flatMap(livemode => require('../db/invoicing').listInvoices(l.id, { limit: 1000, livemode })).map(i => require('../db/invoicing').getInvoice(l.id, i.id)),
    tax_reserves: db.prepare('SELECT year, quarter, amount, updated_at FROM tax_reserves WHERE license_id = ?').all(l.id),
    leak_dismissals: db.prepare('SELECT party_key, party_name, created_at FROM leak_dismissals WHERE license_id = ?').all(l.id),
    api_calls: db.prepare('SELECT key_id, method, path, status, error_code, ms, created_at FROM api_calls WHERE license_id = ? ORDER BY id DESC LIMIT 5000').all(l.id),
    api_keys: listApiKeys(l.id),
    webhook_endpoints: db.prepare('SELECT id, url, events, description, enabled, created_at FROM webhook_endpoints WHERE license_id = ?').all(l.id),
    webhook_deliveries: db.prepare('SELECT endpoint_id, event_id, event_type, status, attempts, last_status, created_at FROM webhook_deliveries WHERE license_id = ? ORDER BY id DESC LIMIT 5000').all(l.id),
    api_jobs: db.prepare('SELECT id, kind, status, error_code, created_at, finished_at FROM api_jobs WHERE license_id = ? ORDER BY created_at DESC LIMIT 5000').all(l.id)
  });
});

me.delete('/', requireLicense, (req, res) => {
  const l = req.license;
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  if (!verifyPassword(password, l.password_hash)) {
    audit('ACCOUNT_DELETE_FAILED', { license_id: l.id, ip: req.ip });
    return res.status(401).json({ error: 'invalid_credentials', message: 'La contraseña no es correcta.' });
  }
  // No se toca Stripe desde aquí (cuidado extremo con pagos): la suscripción
  // debe estar ya cancelada (a fin de periodo) desde el Portal de Stripe.
  const subscriptionActive = l.billing_model === 'subscription' && l.stripe_subscription_id && !l.cancel_at_period_end;
  if (subscriptionActive) {
    return res.status(409).json({ error: 'subscription_active', message: 'Cancela primero tu suscripción desde "Gestionar suscripción".' });
  }
  audit('ACCOUNT_DELETED_BY_USER', { license_id: l.id, ip: req.ip, detail: `plan=${l.plan}` });
  getDB().prepare('DELETE FROM ai_usage WHERE license_id = ?').run(l.id);
  deleteLicense(l.id); // CASCADE: sesiones, perfil, historial, tareas, libro, claves…
  res.json({ success: true });
});

/* ── C8 ── */
const errorLimiter = rateLimit({ windowMs: 60 * 1000, max: 20, standardHeaders: true, legacyHeaders: false, message: { error: 'rate_limited' } });

function recordError({ source, message, stack, path, version, userAgent }) {
  try {
    getDB().prepare('INSERT INTO client_errors (source, message, stack, path, version, user_agent) VALUES (?, ?, ?, ?, ?, ?)')
      .run(source, String(message || '').slice(0, 500), String(stack || '').slice(0, 3000), String(path || '').split('?')[0].slice(0, 200),
        String(version || '').slice(0, 40), String(userAgent || '').slice(0, 200));
    // Retención: 30 días.
    if (Math.random() < 0.05) getDB().prepare("DELETE FROM client_errors WHERE created_at < datetime('now', '-30 days')").run();
  } catch (e) {
    console.error('[ERRORS] no se pudo guardar el error:', e.message);
  }
}

telemetry.post('/', errorLimiter, (req, res) => {
  const b = req.body || {};
  if (typeof b.message !== 'string' || !b.message) return res.status(400).json({ error: 'invalid_input' });
  recordError({ source: 'client', message: b.message, stack: b.stack, path: b.path, version: b.version, userAgent: req.headers['user-agent'] });
  res.status(204).end();
});

/* ── Sesión 12: eventos de la web pública (sin cookies, solo recuentos) ── */
const webEvents = express.Router();
const eventLimiter = rateLimit({ windowMs: 60 * 1000, max: 30, standardHeaders: true, legacyHeaders: false, message: { error: 'rate_limited' } });
webEvents.post('/', eventLimiter, (req, res) => {
  const { recordEvent } = require('../services/webEvents');
  if (!recordEvent(req.body?.name, req.body?.path)) return res.status(400).json({ error: 'invalid_input' });
  res.status(204).end();
});

module.exports = { keys, me, telemetry, webEvents, recordError };
