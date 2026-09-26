/**
 * routes/ai.js — análisis con IA de la web (sesión 4, F1/F2).
 *
 *   POST /api/ai/analyze   { task, input, lang?, title?, job? }
 *     El navegador manda el TIPO de análisis y los DATOS; el backend arma el
 *     prompt (services/ai/prompts.js). Ver services/ai/analyze.js.
 *
 *   GET   /api/actions            → tareas del plan de acción (C2)
 *   PATCH /api/actions/:id        { done }  → marcar / desmarcar
 *
 * (auth: Bearer; rate-limit /api/ai/ en server.js)
 */

'use strict';

const express = require('express');
const { requireLicense } = require('../middleware/requireLicense');
const { runAnalysis } = require('../services/ai/analyze');
const { listActions, setActionDone, actionStats } = require('../db/actions');

const aiRouter = express.Router();
const actionsRouter = express.Router();

aiRouter.post('/analyze', requireLicense, async (req, res) => {
  const b = req.body || {};
  const out = await runAnalysis({
    license: req.license,
    task: String(b.task || ''),
    input: b.input,
    lang: b.lang,
    title: b.title,
    jobId: typeof b.job === 'string' ? b.job : undefined,
    ip: req.ip,
    source: 'web'
  });
  res.status(out.status).json(out.body);
});

actionsRouter.get('/', requireLicense, (req, res) => {
  res.json({ actions: listActions(req.license.id), stats: actionStats(req.license.id) });
});

actionsRouter.patch('/:id', requireLicense, (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'invalid_id', message: 'Identificador no válido.' });
  const ok = setActionDone(req.license.id, id, !!req.body?.done);
  if (!ok) return res.status(404).json({ error: 'not_found', message: 'Tarea no encontrada.' });
  res.json({ success: true, stats: actionStats(req.license.id) });
});

module.exports = { aiRouter, actionsRouter };
