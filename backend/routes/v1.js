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

router.get('/usage', requireApiKey, (req, res) => res.json(usage(req.license)));

/** Lógica compartida por la API REST y el servidor MCP (sesión 7). Devuelve { status, body }. */
async function analyze({ license, body, ip, source = 'api' }) {
  const type = String(body?.type || '');
  if (!TYPES.includes(type)) {
    return { status: 400, body: { error: 'invalid_type', message: `type debe ser uno de: ${TYPES.join(', ')}.` } };
  }
  const out = await runAnalysis({ license, task: type, input: body?.data, lang: body?.lang, title: body?.title, ip, source });
  if (out.status !== 200) return out;
  const b = out.body;
  return { status: 200, body: { id: b.analysis_id, type: b.kind, title: b.title, report: b.report, health: b.health, actions: b.actions } };
}

router.post('/analyze', requireApiKey, async (req, res) => {
  const out = await analyze({ license: req.license, body: req.body, ip: req.ip });
  res.status(out.status).json(out.body);
});

function usage(license) {
  return { plan: license.plan, daily_quota: aiQuotaForPlan(license.plan), used_today: countAiAnalysesToday(license.id) };
}

function listApiAnalyses(license, limit) {
  const n = Math.min(Math.max(Number(limit) || 50, 1), 100);
  return { analyses: listAnalyses(license.id, n).map(a => ({ id: a.id, type: a.kind, title: a.title, format: a.format, source: a.source || 'web', created_at: a.created_at })) };
}

function getApiAnalysis(license, rawId) {
  const id = Number(rawId);
  const a = Number.isInteger(id) ? getAnalysis(license.id, id) : null;
  if (!a) return null;
  return {
    id: a.id, type: a.kind, title: a.title, created_at: a.created_at, format: a.format,
    report: a.result_json || null, html: a.result_json ? undefined : a.result_html,
    health: a.meta?.health || null,
    actions: a.format === 'json' ? listActionsForAnalysis(license.id, a.id) : []
  };
}

router.get('/analyses', requireApiKey, (req, res) => res.json(listApiAnalyses(req.license, req.query.limit)));

router.get('/analyses/:id', requireApiKey, (req, res) => {
  const a = getApiAnalysis(req.license, req.params.id);
  if (!a) return res.status(404).json({ error: 'not_found' });
  res.json(a);
});

/* ── Sesión 7: extracción de facturas (Bloque 1.2) ──
 * Hasta 5 documentos por petición (1 análisis de la cuota por petición).
 * PDF digital → se extrae el texto aquí; imagen (JPG/PNG/WebP) → la lee el
 * modelo con visión; texto → tal cual. No se guarda nada: ni el archivo ni
 * los datos extraídos (a diferencia de la web, aquí no hay libro). */
const INVOICE_MAX_FILES = 5;
const INVOICE_IMAGE_MIMES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_FILE_B64 = 7 * 1024 * 1024;

async function extractInvoices({ license, body, ip, source = 'api' }) {
  const raw = Array.isArray(body?.files) ? body.files : [];
  if (!raw.length) return { status: 400, body: { error: 'invalid_input', message: 'Envía al menos un documento en "files".' } };
  if (raw.length > INVOICE_MAX_FILES) return { status: 400, body: { error: 'too_many_files', message: `Máximo ${INVOICE_MAX_FILES} documentos por petición.` } };
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
  if (!files.length) return { status: 400, body: { error: 'no_readable_files', message: 'Ningún documento se ha podido leer.', errors } };

  const out = await runAnalysis({ license, task: 'invoices', input: { files }, lang: body?.lang, ip, source });
  if (out.status !== 200) return out;
  const invoices = out.body.invoices.map(({ check_ok, ...inv }) => ({ ...inv, ...checkInvoice(inv) }));
  return { status: 200, body: { invoices, errors } };
}

router.post('/invoices/extract', requireApiKey, async (req, res) => {
  const out = await extractInvoices({ license: req.license, body: req.body, ip: req.ip });
  res.status(out.status).json(out.body);
});

module.exports = router;
module.exports.handlers = { analyze, extractInvoices, usage, listApiAnalyses, getApiAnalysis, TYPES, INVOICE_MAX_FILES };
