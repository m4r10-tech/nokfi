/**
 * routes/v1.js — F4: API pública versionada para automatizaciones
 * (n8n, Make, Zapier…). Solo planes Pro y Max. Misma cuota diaria que la web.
 *
 *   GET  /api/v1/openapi.json       especificación OpenAPI 3 (pública)
 *   GET  /api/v1/usage              cuota de hoy
 *   POST /api/v1/analyze            { type, data, lang?, title? } → informe JSON
 *   GET  /api/v1/analyses           lista
 *   GET  /api/v1/analyses/:id       informe completo (JSON estructurado)
 *   POST /api/v1/invoices/extract   { files: [{ name, mime, data } | { name, text }] }
 *                                   → facturas con checks y warnings (sesión 7)
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
const { pdfText } = require('../utils/pdfText');
const { checkInvoice } = require('../services/invoiceChecks');

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

/* ── Sesión 7: extracción de facturas (Bloque 1.2) ──
 * Hasta 5 documentos por petición (1 análisis de la cuota por petición).
 * PDF digital → se extrae el texto aquí; imagen (JPG/PNG/WebP) → la lee el
 * modelo con visión; texto → tal cual. No se guarda nada: ni el archivo ni
 * los datos extraídos (a diferencia de la web, aquí no hay libro). */
const INVOICE_MAX_FILES = 5;
const INVOICE_IMAGE_MIMES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_FILE_B64 = 7 * 1024 * 1024;

router.post('/invoices/extract', requireApiKey, async (req, res) => {
  const raw = Array.isArray(req.body?.files) ? req.body.files : [];
  if (!raw.length) return res.status(400).json({ error: 'invalid_input', message: 'Envía al menos un documento en "files".' });
  if (raw.length > INVOICE_MAX_FILES) return res.status(400).json({ error: 'too_many_files', message: `Máximo ${INVOICE_MAX_FILES} documentos por petición.` });
  const files = [];
  const errors = [];
  for (const [i, f] of raw.entries()) {
    const name = String(f?.name || `documento-${i + 1}`).slice(0, 120);
    const mime = String(f?.mime || '').toLowerCase();
    try {
      if (typeof f?.text === 'string' && f.text.trim()) { files.push({ name, text: f.text.slice(0, 12000) }); continue; }
      if (typeof f?.data !== 'string' || !f.data) { errors.push({ file_name: name, error: 'empty_file', message: 'Falta "data" (base64) o "text".' }); continue; }
      if (f.data.length > MAX_FILE_B64) { errors.push({ file_name: name, error: 'file_too_large', message: 'El archivo supera 5 MB.' }); continue; }
      if (mime === 'application/pdf') {
        const text = await pdfText(f.data);
        if (text.replace(/\s/g, '').length < 30) { errors.push({ file_name: name, error: 'pdf_scanned', message: 'El PDF no tiene texto (está escaneado): envíalo como imagen JPG o PNG.' }); continue; }
        files.push({ name, text });
      } else if (INVOICE_IMAGE_MIMES.includes(mime)) {
        files.push({ name, mime, data: f.data });
      } else {
        errors.push({ file_name: name, error: 'unsupported_type', message: 'Formatos admitidos: application/pdf, image/jpeg, image/png, image/webp o texto.' });
      }
    } catch {
      errors.push({ file_name: name, error: 'unreadable_file', message: 'No se ha podido leer el archivo.' });
    }
  }
  if (!files.length) return res.status(400).json({ error: 'no_readable_files', message: 'Ningún documento se ha podido leer.', errors });

  const out = await runAnalysis({ license: req.license, task: 'invoices', input: { files }, lang: req.body?.lang, ip: req.ip, source: 'api' });
  if (out.status !== 200) return res.status(out.status).json(out.body);
  const invoices = out.body.invoices.map(({ check_ok, ...inv }) => ({ ...inv, ...checkInvoice(inv) }));
  res.json({ invoices, errors });
});

module.exports = router;
