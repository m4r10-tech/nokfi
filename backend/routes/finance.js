/**
 * routes/finance.js — núcleo de valor (sesión 4): V1 libro, V2 impuestos,
 * V4 cobros, V5 fugas, V3 previsión de caja, C4 calendario fiscal y el
 * resumen del panel de inicio.
 *
 *   GET    /api/ledger?from&to&type        libro (V1)
 *   POST   /api/ledger  { entries, force } alta en bloque (409 si hay duplicadas y !force)
 *   PATCH  /api/ledger/:id                 editar (la IA se equivoca: el usuario corrige)
 *   DELETE /api/ledger/:id
 *   GET    /api/finance/taxes?year&quarter 303 + 130 estimados (V2)
 *   PUT    /api/finance/reserve            { year, quarter, amount } lo apartado
 *   GET    /api/finance/receivables        cobros pendientes (V4)
 *   POST   /api/finance/collection-email   { entry_id, tone, lang } borrador de reclamación (IA gratuita)
 *   GET    /api/finance/leaks              fugas (V5)
 *   GET    /api/finance/forecast?days&hire&delay&extra   previsión (V3)
 *   GET    /api/finance/calendar?year      plazos fiscales (C4)
 *   GET    /api/dashboard                  resumen para /app/home
 *
 * Todo scopeado por req.license.id (requireLicense).
 */

'use strict';

const express = require('express');
const { requireLicense } = require('../middleware/requireLicense');
const { getCompanyProfile, getLatestAnalysisOfKind, audit } = require('../db/database');
const F = require('../db/finance');
const { sentStages } = require('../services/collections');
const { taxSummary, receivables, leaks, forecast, quarterOf } = require('../utils/finance');
const { deadlinesFor, upcoming, iso } = require('../utils/fiscalCalendar');
const { listActions, actionStats } = require('../db/actions');
const { freeText, allowMessage } = require('../services/ai/chat');
const { langDirective, profileContext } = require('../services/ai/prompts');
const benchmark = require('../utils/benchmark');

const ledger = express.Router();
const finance = express.Router();
const dashboard = express.Router();

/* ── V1: libro ── */
ledger.get('/', requireLicense, (req, res) => {
  res.json({ entries: F.listLedger(req.license.id, req.query) });
});

ledger.post('/', requireLicense, (req, res) => {
  const raw = Array.isArray(req.body?.entries) ? req.body.entries.slice(0, 500) : [];
  if (!raw.length) return res.status(400).json({ error: 'invalid_input', message: 'No hay apuntes que guardar.' });
  const entries = [];
  for (const [i, r] of raw.entries()) {
    const { entry, error } = normalizeOrError(r);
    if (error) return res.status(400).json({ error: 'invalid_input', field: error, index: i, message: `Apunte ${i + 1}: dato no válido (${error}).` });
    entries.push(entry);
  }
  // Duplicadas: mismo NIF (o nombre) + nº de factura + tipo, ya en el libro o repetidas en el lote.
  const seen = new Set();
  const duplicates = [];
  entries.forEach((e, i) => {
    const key = `${e.type}|${e.party_nif || e.party_name.toLowerCase()}|${e.invoice_number}`;
    if ((e.invoice_number && seen.has(key)) || F.findDuplicate(req.license.id, e)) duplicates.push(i);
    if (e.invoice_number) seen.add(key);
  });
  if (duplicates.length && !req.body?.force) {
    return res.status(409).json({ error: 'duplicates', duplicates, message: 'Algunas facturas ya están en el libro.' });
  }
  const ids = F.insertEntries(req.license.id, entries);
  audit('LEDGER_ENTRIES_CREATED', { license_id: req.license.id, ip: req.ip, detail: `n=${ids.length}` });
  res.status(201).json({ ids });
});

function normalizeOrError(r) {
  return F.normalizeEntry(r && typeof r === 'object' ? r : {});
}

ledger.patch('/:id', requireLicense, (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'invalid_id' });
  const out = F.updateEntry(req.license.id, id, req.body || {});
  if (!out) return res.status(404).json({ error: 'not_found', message: 'Apunte no encontrado.' });
  if (out.error) return res.status(400).json({ error: 'invalid_input', field: out.error });
  res.json({ entry: out });
});

ledger.delete('/:id', requireLicense, (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || !F.deleteEntry(req.license.id, id)) return res.status(404).json({ error: 'not_found' });
  res.json({ success: true });
});

/* ── V2: impuestos ── */
function currentQuarter() { return quarterOf(iso(new Date())); }

finance.get('/taxes', requireLicense, (req, res) => {
  const cq = currentQuarter();
  const year = Number(req.query.year) || cq.year;
  const quarter = Math.min(Math.max(Number(req.query.quarter) || cq.quarter, 1), 4);
  const profile = getCompanyProfile(req.license.id) || {};
  const entries = F.allEntries(req.license.id);
  res.json({
    legal_form: profile.legal_form || '',
    summary: taxSummary(entries, { year, quarter, legalForm: profile.legal_form, reserve: F.getReserve(req.license.id, year, quarter) })
  });
});

finance.put('/reserve', requireLicense, (req, res) => {
  const year = Number(req.body?.year), quarter = Number(req.body?.quarter), amount = Number(req.body?.amount);
  if (!Number.isInteger(year) || quarter < 1 || quarter > 4 || !Number.isFinite(amount) || amount < 0) {
    return res.status(400).json({ error: 'invalid_input' });
  }
  res.json({ reserved: F.setReserve(req.license.id, year, quarter, amount) });
});

/* ── V4: cobros ── */
finance.get('/receivables', requireLicense, (req, res) => {
  const out = receivables(F.allEntries(req.license.id));
  // Recordatorios automáticos ya enviados (etapa 1-3) por factura.
  const sent = sentStages(req.license.id);
  for (const p of out.pending) p.auto_stage = sent[p.id] || 0;
  res.json(out);
});

const TONES = {
  friendly: 'recordatorio amable y cercano, dando por hecho que es un olvido',
  firm: 'recordatorio firme pero educado, pidiendo una fecha concreta de pago',
  formal: 'aviso formal: menciona que, de no recibir el pago en 7 días, se valorarán otras medidas (sin amenazas concretas ni lenguaje legal inventado)'
};

finance.post('/collection-email', requireLicense, async (req, res) => {
  const entry = F.getEntry(req.license.id, Number(req.body?.entry_id));
  if (!entry || entry.type !== 'income') return res.status(404).json({ error: 'not_found' });
  if (!allowMessage(req.license.id)) return res.status(429).json({ error: 'chat_rate_limited' });
  const tone = TONES[req.body?.tone] ? req.body.tone : 'friendly';
  const profile = getCompanyProfile(req.license.id) || {};
  const days = Math.max(0, Math.round((Date.now() - Date.parse(entry.invoice_date + 'T00:00:00Z')) / 86400000));
  const system = [
    'Redactas emails de reclamación de facturas impagadas para autónomos y pymes. Solo el email, nada más.',
    'Formato EXACTO: primera línea "ASUNTO: <asunto>", una línea en blanco y después el cuerpo en texto plano (sin Markdown). Firma con el nombre de la empresa del remitente.',
    profileContext(profile),
    langDirective(req.body?.lang)
  ].join('\n\n');
  const prompt = `Tono: ${TONES[tone]}.
Cliente: ${entry.party_name || 'cliente'}.
Factura nº ${entry.invoice_number || '(sin número)'} del ${entry.invoice_date}${entry.due_date ? `, vencida el ${entry.due_date}` : ''}.
Importe: ${entry.total.toFixed(2)} €. Días desde la emisión: ${days}.
Concepto: ${entry.concept || '—'}.`;
  try {
    const { text } = await freeText({ system, prompt });
    const m = text.match(/^\s*ASUNTO:\s*(.+)\n+([\s\S]+)$/i) || text.match(/^\s*(?:SUBJECT|OBJET|OGGETTO|BETREFF|TEMAT):\s*(.+)\n+([\s\S]+)$/i);
    res.json({ subject: m ? m[1].trim() : '', body: (m ? m[2] : text).trim(), tone });
  } catch (e) {
    if (e.code === 'chat_unavailable') return res.status(503).json({ error: 'chat_unavailable' });
    res.status(500).json({ error: 'internal_error' });
  }
});

/* ── V5: fugas ── */
finance.get('/leaks', requireLicense, (req, res) => {
  res.json(leaks(F.allEntries(req.license.id)));
});

/* ── V3: previsión ── */
finance.get('/forecast', requireLicense, (req, res) => {
  const profile = getCompanyProfile(req.license.id) || {};
  if (profile.cash_balance == null) {
    return res.json({ needs_balance: true });
  }
  const out = forecast({
    entries: F.allEntries(req.license.id),
    balance: profile.cash_balance,
    days: Number(req.query.days) || 90,
    threshold: profile.cash_alert_threshold || 0,
    legalForm: profile.legal_form,
    scenario: { hire_monthly: req.query.hire, payment_delay_days: req.query.delay, extra_monthly_income: req.query.extra }
  });
  res.json({ ...out, balance_date: profile.cash_balance_date });
});

/* ── V7: comparación con tu sector (INE) ── */
finance.get('/benchmark', requireLicense, (req, res) => {
  res.json(benchmark.compare(getCompanyProfile(req.license.id), F.allEntries(req.license.id)));
});

/* ── C4: calendario fiscal ── */
finance.get('/calendar', requireLicense, (req, res) => {
  const profile = getCompanyProfile(req.license.id) || {};
  const year = Number(req.query.year) || new Date().getUTCFullYear();
  res.json({
    legal_form: profile.legal_form || '',
    reminders: !!profile.fiscal_reminders,
    year,
    deadlines: deadlinesFor(year, profile.legal_form || undefined),
    upcoming: upcoming(profile.legal_form || undefined)
  });
});

/* ── Panel de inicio ── */
dashboard.get('/', requireLicense, (req, res) => {
  const id = req.license.id;
  const profile = getCompanyProfile(id) || {};
  const entries = F.allEntries(id);
  const cq = currentQuarter();
  const health = getLatestAnalysisOfKind(id, 'cuestionario');
  const openActions = listActions(id, { limit: 50 }).filter(a => !a.done).slice(0, 4);
  const out = {
    health: health?.meta?.health ? { ...health.meta.health, analysis_id: health.id, created_at: health.created_at } : null,
    actions: { ...actionStats(id), next: openActions },
    ledger_count: entries.length,
    next_deadline: upcoming(profile.legal_form || undefined, iso(new Date()), 1)[0] || null
  };
  if (entries.length) {
    const tax = taxSummary(entries, { ...cq, legalForm: profile.legal_form, reserve: F.getReserve(id, cq.year, cq.quarter) });
    const rec = receivables(entries);
    const lk = leaks(entries);
    out.taxes = { year: tax.year, quarter: tax.quarter, due_date: tax.due_date, total_estimated: tax.total_estimated, reserved: tax.reserved, missing: tax.missing };
    out.receivables = { count: rec.pending.length, total: rec.total, overdue_60: rec.overdue_60 };
    out.leaks = { detected_this_month: lk.detected_this_month, recurring_monthly_total: lk.recurring_monthly_total, alerts: lk.increases.length + lk.duplicates.length };
    if (profile.cash_balance != null) {
      const fc = forecast({ entries, balance: profile.cash_balance, days: 90, threshold: profile.cash_alert_threshold || 0, legalForm: profile.legal_form });
      out.forecast = { at30: fc.at30, at90: fc.at90, min: fc.min, first_below: fc.first_below, threshold: fc.threshold };
    }
  }
  res.json(out);
});

module.exports = { ledger, finance, dashboard };
