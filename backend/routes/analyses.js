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
 *   PATCH /api/analyses/:id { title } → renombrar (S15b D8) — 404 si no es tuyo
 *   DELETE /api/analyses/:id → borrar con sus tareas (S15b D8) — 404 si no es tuyo
 *
 * (auth: Bearer; rate-limit general via /api/ en server.js)
 */

'use strict';

const express = require('express');
const router = express.Router();
const { requireLicense } = require('../middleware/requireLicense');
const { listAnalyses, getAnalysis, renameAnalysis, deleteAnalysis } = require('../db/database');
const { listActionsForAnalysis } = require('../db/actions');

const parse = (s) => { try { return s ? JSON.parse(s) : null; } catch { return null; } };

router.get('/', requireLicense, (req, res) => {
  const rows = listAnalyses(req.license.id);
  res.json({
    analyses: rows.map(r => ({
      id: r.id,
      kind: r.kind,
      title: r.title,
      prompt_chars: r.prompt_chars,
      format: r.format,
      created_at: r.created_at,
      source: r.source || 'web',
      // Sesión 10: para el título y el resultado clave de cada línea.
      summary: parse(r.summary_json),
      key_figure: parse(r.key_figure_json)
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
  // Sesión 4 (F1): los análisis nuevos son JSON estructurado (`report`) con
  // sus tareas (C2); los antiguos siguen devolviendo result_html.
  const meta = analysis.meta || null;
  res.json({
    id: analysis.id,
    kind: analysis.kind,
    title: analysis.title,
    format: analysis.format,
    result_html: analysis.result_html,
    report: analysis.result_json || null,
    health: meta?.health || null,
    meta: meta ? { task: meta.task, module: meta.module, folder_name: meta.folder_name, file_count: meta.file_count, stats: meta.stats, files: meta.files, period: meta.period, periods: meta.periods } : null,
    actions: analysis.format === 'json' ? listActionsForAnalysis(req.license.id, analysis.id) : [],
    prompt_chars: analysis.prompt_chars,
    created_at: analysis.created_at
  });
});

/* ── S15b D8: renombrar y borrar (la API /api/v1 usa los mismos helpers) ── */
const MAX_TITLE = 120;
function validTitle(v) {
  const t = typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : '';
  return t && t.length <= MAX_TITLE ? t : null;
}

router.patch('/:id', requireLicense, (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'invalid_id', message: 'El identificador del análisis no es válido.' });
  const title = validTitle(req.body?.title);
  if (!title) return res.status(400).json({ error: 'invalid_title', message: `El título no puede estar vacío ni pasar de ${MAX_TITLE} caracteres.` });
  if (!renameAnalysis(req.license.id, id, title)) return res.status(404).json({ error: 'not_found', message: 'Análisis no encontrado.' });
  res.json({ id, title });
});

router.delete('/:id', requireLicense, (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'invalid_id', message: 'El identificador del análisis no es válido.' });
  if (!deleteAnalysis(req.license.id, id)) return res.status(404).json({ error: 'not_found', message: 'Análisis no encontrado.' });
  res.json({ success: true, id });
});

module.exports = router;
module.exports.validTitle = validTitle;
module.exports.MAX_TITLE = MAX_TITLE;
