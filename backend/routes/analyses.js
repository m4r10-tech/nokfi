/**
 * routes/analyses.js
 *
 * Historial de análisis de una licencia (sección 14 del proyecto — pantallas
 * Historial / Informes). Los análisis se persisten en routes/proxy.js al
 * generarse (createAnalysis); aquí solo se exponen para listarlos y abrirlos.
 *
 * Ambas rutas van tras `requireLicense` y se scopean SIEMPRE por req.license.id:
 * una licencia solo ve SU propio historial. getAnalysis devuelve null si el id
 * no pertenece a esa licencia → 404, sin filtrar si el análisis existe para
 * otro (no leakage de IDs ajenos).
 *
 * Endpoints:
 *   GET /api/analyses       → lista ligera (sin result_html) del historial, más recientes primero
 *   GET /api/analyses/:id   → análisis completo (con result_html) — 404 si no es tuyo
 *
 * (auth: Bearer; rate-limit general via /api/ en server.js)
 */

'use strict';

const express = require('express');
const router = express.Router();
const { requireLicense } = require('../middleware/requireLicense');
const { listAnalyses, getAnalysis } = require('../db/database');

router.get('/', requireLicense, (req, res) => {
  const rows = listAnalyses(req.license.id);
  res.json({
    analyses: rows.map(r => ({
      id: r.id,
      kind: r.kind,
      title: r.title,
      prompt_chars: r.prompt_chars,
      created_at: r.created_at
    }))
  });
});

router.get('/:id', requireLicense, (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    return res.status(400).json({ error: 'invalid_id', message: 'El identificador del análisis no es válido.' });
  }
  const analysis = getAnalysis(req.license.id, id);
  if (!analysis) {
    return res.status(404).json({ error: 'not_found', message: 'Análisis no encontrado.' });
  }
  res.json({
    id: analysis.id,
    kind: analysis.kind,
    title: analysis.title,
    result_html: analysis.result_html,
    prompt_chars: analysis.prompt_chars,
    created_at: analysis.created_at
  });
});

module.exports = router;
