/**
 * routes/v1.js — F4: API pública versionada para automatizaciones
 * (n8n, Make, Zapier…). Solo planes Pro y Max. Misma cuota diaria que la web.
 *
 *   GET  /api/v1/openapi.json       especificación OpenAPI 3 (pública)
 *   GET  /api/v1/usage              cuota de hoy
 *   POST /api/v1/analyze            { type, data, lang?, title? } → informe JSON
 *   GET  /api/v1/analyses           lista
 *   GET  /api/v1/analyses/:id       informe completo (JSON estructurado)
 *
 * Nunca acepta prompts libres: los tipos son los de la web y el backend arma
 * el prompt (F2).
 */

'use strict';

const express = require('express');
const router = express.Router();
const { requireApiKey } = require('../middleware/requireApiKey');
const { runAnalysis } = require('../services/ai/analyze');
const { listAnalyses, getAnalysis, aiQuotaForPlan, countAiAnalysesToday } = require('../db/database');
const { listActionsForAnalysis } = require('../db/actions');
const openapi = require('../config/openapi');

const TYPES = ['cuestionario', 'excel', 'compare', 'folder'];

router.get('/openapi.json', (_req, res) => res.json(openapi));

router.get('/usage', requireApiKey, (req, res) => {
  res.json({ plan: req.license.plan, daily_quota: aiQuotaForPlan(req.license.plan), used_today: countAiAnalysesToday(req.license.id) });
});

router.post('/analyze', requireApiKey, async (req, res) => {
  const type = String(req.body?.type || '');
  if (!TYPES.includes(type)) {
    return res.status(400).json({ error: 'invalid_type', message: `type debe ser uno de: ${TYPES.join(', ')}.` });
  }
  const out = await runAnalysis({
    license: req.license, task: type, input: req.body?.data, lang: req.body?.lang, title: req.body?.title,
    ip: req.ip, source: 'api'
  });
  if (out.status !== 200) return res.status(out.status).json(out.body);
  const b = out.body;
  res.json({ id: b.analysis_id, type: b.kind, title: b.title, report: b.report, health: b.health, actions: b.actions });
});

router.get('/analyses', requireApiKey, (req, res) => {
  const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 100);
  res.json({ analyses: listAnalyses(req.license.id, limit).map(a => ({ id: a.id, type: a.kind, title: a.title, format: a.format, created_at: a.created_at })) });
});

router.get('/analyses/:id', requireApiKey, (req, res) => {
  const id = Number(req.params.id);
  const a = Number.isInteger(id) ? getAnalysis(req.license.id, id) : null;
  if (!a) return res.status(404).json({ error: 'not_found' });
  res.json({
    id: a.id, type: a.kind, title: a.title, created_at: a.created_at, format: a.format,
    report: a.result_json || null, html: a.result_json ? undefined : a.result_html,
    health: a.meta?.health || null,
    actions: a.format === 'json' ? listActionsForAnalysis(req.license.id, a.id) : []
  });
});

module.exports = router;
