/**
 * routes/v1.js — F4: API pública versionada para automatizaciones
 * (n8n, Make, Zapier…). Claves reales en Pro y Max; claves de prueba
 * (nk_test_) en todos los planes. Misma cuota diaria que la web.
 *
 *   GET  /api/v1/openapi.json       especificación OpenAPI 3 (pública)
 *   GET  /api/v1/usage              cuota de hoy
 *   POST /api/v1/analyze            { type, data, lang?, title? } → informe JSON
 *   GET  /api/v1/analyses           lista
 *   GET  /api/v1/analyses/:id       informe completo (JSON estructurado)
 *   POST /api/v1/invoices/extract   { files: [{ name, mime, data } | { name, text }] }
 *                                   → facturas con checks y warnings (sesión 7)
 *                                   XML/Factur-X: lectura exacta sin IA ni cuota (sesión 11)
 *
 * Sesión 9 (Bloque 2):
 *   ?async=true | Prefer: respond-async   en analyze e invoices/extract → 202 + job
 *   GET  /api/v1/jobs, /api/v1/jobs/:id   estado y resultado (24 h)
 *   Idempotency-Key                        en todos los POST
 *   /api/v1/webhooks[/:id][/test]          endpoints de webhook (los usa el Trigger de n8n)
 *   /api/v1/tax/*                          herramientas sin IA (no gastan cuota)
 *
 * Sesión 11b (emisión de facturas, misma lógica que la app: services/invoicing):
 *   POST /api/v1/invoices                  emitir (Idempotency-Key OBLIGATORIA)
 *   GET  /api/v1/invoices[?from&to&status&q&limit]
 *   GET  /api/v1/invoices/:id              con eventos y registro VERI*FACTU
 *   POST /api/v1/invoices/:id/rectify      rectificativa (Idempotency-Key OBLIGATORIA)
 *   POST /api/v1/invoices/:id/cancel       { reason }
 *   POST /api/v1/invoices/:id/status       { status: rejected|accepted|paid|unpaid, reason?, date? }
 *   GET  /api/v1/invoices/:id/pdf
 *   GET  /api/v1/invoices/:id/xml?format=ubl|facturae|facturx|cii
 *   GET/POST /api/v1/customers
 *   Claves nk_test_: facturas de prueba (TEST-…) que no entran al libro ni van a la AEAT.
 *
 * Nunca acepta prompts libres: los tipos son los de la web y el backend arma
 * el prompt (F2).
 */

'use strict';

const express = require('express');
const router = express.Router();
const { requireApiKey } = require('../middleware/requireApiKey');
const { idempotency, isAsync } = require('../middleware/idempotency');
const { runAnalysis, checkInput } = require('../services/ai/analyze');
const { quotaMessage } = require('../services/ai/quota');
const { listAnalyses, getAnalysis, aiQuotaForPlan, countAiAnalysesToday, audit } = require('../db/database');
const { listActionsForAnalysis } = require('../db/actions');
const openapi = require('../config/openapi');
const { pdfText } = require('../utils/pdfText');
const einvoice = require('../services/einvoice');
const { checkInvoice } = require('../services/invoiceChecks');
const jobs = require('../services/jobs');
const webhooks = require('../services/webhooks');
const W = require('../db/webhooks');
const T = require('../services/taxTools');
const { sampleAnalysis, sampleInvoices } = require('../services/testMode');

const { absoluteLinks } = require('../services/ai/financeContext');

const TYPES = ['cuestionario', 'excel', 'compare', 'folder'];

router.get('/openapi.json', (_req, res) => res.json(openapi));

router.get('/usage', requireApiKey, (req, res) => res.json(usage(req.license, req.livemode)));

const typeError = () => ({ status: 400, body: { error: 'invalid_type', message: `type debe ser uno de: ${TYPES.join(', ')}.` } });

/** Lógica compartida por la API REST y el servidor MCP (sesión 7). Devuelve { status, body }. */
async function analyze({ license, body, ip, source = 'api', livemode = true }) {
  const type = String(body?.type || '');
  if (!TYPES.includes(type)) return typeError();
  if (!livemode) {
    const err = checkInput({ license, task: type, input: body?.data, lang: body?.lang });
    if (err) return err;
    const out = absoluteLinks(sampleAnalysis({ type, data: body?.data, title: body?.title }));
    webhooks.emit(license.id, 'analysis.completed', { id: null, type: out.type, title: out.title, source, report: out.report, health: out.health }, { livemode: false });
    return { status: 200, body: out };
  }
  const out = await runAnalysis({ license, task: type, input: body?.data, lang: body?.lang, title: body?.title, ip, source });
  if (out.status !== 200) return out;
  const b = out.body;
  return { status: 200, body: absoluteLinks({ id: b.analysis_id, type: b.kind, title: b.title, report: b.report, health: b.health, actions: b.actions }) };
}

function usage(license, livemode = true) {
  return { plan: license.plan, mode: livemode ? 'live' : 'test', daily_quota: aiQuotaForPlan(license.plan), used_today: countAiAnalysesToday(license.id) };
}

function listApiAnalyses(license, limit) {
  const n = Math.min(Math.max(Number(limit) || 50, 1), 100);
  return { analyses: listAnalyses(license.id, n).map(a => ({ id: a.id, type: a.kind, title: a.title, format: a.format, source: a.source || 'web', created_at: a.created_at })) };
}

function getApiAnalysis(license, rawId) {
  const id = Number(rawId);
  const a = Number.isInteger(id) ? getAnalysis(license.id, id) : null;
  if (!a) return null;
  return absoluteLinks({
    id: a.id, type: a.kind, title: a.title, created_at: a.created_at, format: a.format,
    report: a.result_json || null, html: a.result_json ? undefined : a.result_html,
    health: a.meta?.health || null,
    actions: a.format === 'json' ? listActionsForAnalysis(license.id, a.id) : []
  });
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
 * los datos extraídos (a diferencia de la web, aquí no hay libro).
 *
 * Sesión 11: las facturas ELECTRÓNICAS (Facturae, UBL, CII, Factur-X/ZUGFeRD
 * embebido en PDF) se leen tal cual, sin IA. Si todos los documentos lo son,
 * la petición no gasta cuota (ai_used: false). */
const INVOICE_MAX_FILES = 5;
const INVOICE_IMAGE_MIMES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_FILE_B64 = 7 * 1024 * 1024;

/**
 * Lee y valida los documentos. Devuelve { error } o
 * { files (para la IA), structured (facturas ya leídas), errors }.
 * Cada entrada lleva su posición (_i) para devolver el resultado en orden.
 */
async function readInvoiceFiles(body) {
  const raw = Array.isArray(body?.files) ? body.files : [];
  if (!raw.length) return { error: { status: 400, body: { error: 'invalid_input', message: 'Envía al menos un documento en "files".' } } };
  if (raw.length > INVOICE_MAX_FILES) return { error: { status: 400, body: { error: 'too_many_files', message: `Máximo ${INVOICE_MAX_FILES} documentos por petición.` } } };
  const files = [];
  const structured = [];
  const errors = [];
  for (const [i, f] of raw.entries()) {
    const name = String(f?.name || `documento-${i + 1}`).slice(0, 120);
    const mime = String(f?.mime || '').toLowerCase();
    try {
      if ((typeof f?.data === 'string' && f.data.length > MAX_FILE_B64) || (typeof f?.text === 'string' && f.text.length > MAX_FILE_B64)) {
        errors.push({ file_name: name, error: 'file_too_large', message: 'El archivo supera 5 MB.' }); continue;
      }
      const s = await einvoice.readStructured(f, name, mime);
      if (s?.error) { errors.push({ file_name: name, error: s.error, message: 'XML no reconocido: se admiten Facturae 3.2.x, UBL 2.x (Invoice/CreditNote) y CII (Factur-X/ZUGFeRD).' }); continue; }
      if (s) { structured.push(...s.invoices.map(inv => ({ ...inv, _i: i }))); continue; }
      if (typeof f?.text === 'string' && f.text.trim()) { files.push({ name, text: f.text.slice(0, 12000), _i: i }); continue; }
      if (typeof f?.data !== 'string' || !f.data) { errors.push({ file_name: name, error: 'empty_file', message: 'Falta "data" (base64) o "text".' }); continue; }
      if (mime === 'application/pdf') {
        const text = await pdfText(f.data);
        if (text.replace(/\s/g, '').length < 30) { errors.push({ file_name: name, error: 'pdf_scanned', message: 'El PDF no tiene texto (está escaneado): envíalo como imagen JPG o PNG.' }); continue; }
        files.push({ name, text, _i: i });
      } else if (INVOICE_IMAGE_MIMES.includes(mime)) {
        files.push({ name, mime, data: f.data, _i: i });
      } else {
        errors.push({ file_name: name, error: 'unsupported_type', message: 'Formatos admitidos: application/pdf, image/jpeg, image/png, image/webp, application/xml (factura electrónica) o texto.' });
      }
    } catch {
      errors.push({ file_name: name, error: 'unreadable_file', message: 'No se ha podido leer el archivo.' });
    }
  }
  if (!files.length && !structured.length) return { error: { status: 400, body: { error: 'no_readable_files', message: 'Ningún documento se ha podido leer.', errors } } };
  return { files, structured, errors };
}

/** ¿Hace falta la IA (y por tanto cuota) para estos documentos? */
const needsAi = (parsed) => parsed.files.length > 0;

const withChecks = ({ check_ok, _i, ...inv }) => ({ ...inv, ...checkInvoice(inv) });

async function extractInvoices({ license, body, ip, source = 'api', livemode = true, parsed = null }) {
  const p = parsed || await readInvoiceFiles(body);
  if (p.error) return p.error;
  let fromAi = [];
  if (needsAi(p)) {
    if (!livemode) fromAi = sampleInvoices(p.files).map((inv, k) => ({ ...inv, _i: p.files[k]._i }));
    else {
      const out = await runAnalysis({ license, task: 'invoices', input: { files: p.files.map(({ _i, ...f }) => f) }, lang: body?.lang, ip, source });
      if (out.status !== 200) return out;
      fromAi = out.body.invoices.map((inv, k) => ({ ...inv, _i: p.files[k]?._i ?? 99 }));
    }
  }
  const invoices = [...p.structured, ...fromAi].sort((a, b) => a._i - b._i).map(withChecks);
  return { status: 200, body: { invoices, errors: p.errors, ai_used: needsAi(p), ...(livemode ? {} : { test: true }) } };
}

/**
 * Sesión 9: responde en síncrono o, con ?async=true / Prefer: respond-async,
 * encola un trabajo y devuelve 202. Los errores de entrada y de cuota se
 * devuelven al momento (no llegan a crear el trabajo).
 */
async function respond(req, res, { kind, validate, run }) {
  if (!isAsync(req)) {
    const out = await run(null);
    return res.status(out.status).json(out.body);
  }
  const pre = await validate();
  if (pre?.error) return res.status(pre.error.status).json(pre.error.body);
  if (req.livemode && (pre?.files ? needsAi(pre) : true)) {
    const limit = aiQuotaForPlan(req.license.plan);
    if (countAiAnalysesToday(req.license.id) >= limit) {
      return res.status(429).json({ error: 'license_daily_limit_reached', message: quotaMessage(limit) });
    }
  }
  const job = jobs.createJob({ license: req.license, keyId: req.apiKey.id, kind, livemode: req.livemode, run: () => run(pre) });
  res.status(202).set('Location', `/api/v1/jobs/${job.id}`).json(job);
}

router.post('/analyze', requireApiKey, idempotency, (req, res) => respond(req, res, {
  kind: 'analyze',
  validate: () => {
    const type = String(req.body?.type || '');
    if (!TYPES.includes(type)) return { error: typeError() };
    const err = checkInput({ license: req.license, task: type, input: req.body?.data, lang: req.body?.lang });
    return err ? { error: err } : {};
  },
  run: () => analyze({ license: req.license, body: req.body, ip: req.ip, livemode: req.livemode })
}));

router.post('/invoices/extract', requireApiKey, idempotency, (req, res) => respond(req, res, {
  kind: 'invoices.extract',
  validate: () => readInvoiceFiles(req.body),
  run: (parsed) => extractInvoices({ license: req.license, body: req.body, ip: req.ip, livemode: req.livemode, parsed })
}));

/* ── Sesión 9: trabajos ── */
router.get('/jobs', requireApiKey, (req, res) => res.json({ jobs: jobs.listJobs(req.license.id, req.query.limit) }));

router.get('/jobs/:id', requireApiKey, (req, res) => {
  const job = jobs.getJob(req.license.id, req.params.id);
  if (!job) return res.status(404).json({ error: 'not_found', message: 'No existe un trabajo con ese id.' });
  res.json(job);
});

/* ── Sesión 9: webhooks (compartido con el panel, routes/dev.js) ── */
function createWebhook(license, body, ip) {
  const u = webhooks.validateUrl(body?.url);
  if (u.error) return { status: 400, body: u };
  const events = W.normalizeEvents(body?.events);
  if (!events) return { status: 400, body: { error: 'invalid_events', message: `events debe ser "*" o una lista de: ${W.EVENT_TYPES.join(', ')}.` } };
  const out = W.createEndpoint(license.id, { url: u.url, events, description: body?.description });
  if (out.error) return { status: 400, body: { error: out.error, message: `Máximo ${W.MAX_ENDPOINTS} webhooks por cuenta.` } };
  audit('WEBHOOK_CREATED', { license_id: license.id, ip, detail: `id=${out.endpoint.id}` });
  return { status: 201, body: out.endpoint };
}

function updateWebhook(license, id, body) {
  const patch = {};
  if (body?.url !== undefined) {
    const u = webhooks.validateUrl(body.url);
    if (u.error) return { status: 400, body: u };
    patch.url = u.url;
  }
  if (body?.events !== undefined) {
    patch.events = W.normalizeEvents(body.events);
    if (!patch.events) return { status: 400, body: { error: 'invalid_events', message: `events debe ser "*" o una lista de: ${W.EVENT_TYPES.join(', ')}.` } };
  }
  if (body?.description !== undefined) patch.description = String(body.description);
  if (body?.enabled !== undefined) patch.enabled = !!body.enabled;
  const ep = W.updateEndpoint(license.id, id, patch);
  return ep ? { status: 200, body: ep } : { status: 404, body: { error: 'not_found' } };
}

function deleteWebhook(license, id, ip) {
  if (!W.deleteEndpoint(license.id, id)) return { status: 404, body: { error: 'not_found' } };
  audit('WEBHOOK_DELETED', { license_id: license.id, ip, detail: `id=${id}` });
  return { status: 200, body: { deleted: true, id } };
}

const idParam = (req) => { const n = Number(req.params.id); return Number.isInteger(n) ? n : 0; };
const send = (res, out) => res.status(out.status).json(out.body);

router.get('/webhooks', requireApiKey, (req, res) => res.json({ webhooks: W.listEndpoints(req.license.id), event_types: W.EVENT_TYPES }));
router.post('/webhooks', requireApiKey, idempotency, (req, res) => send(res, createWebhook(req.license, req.body, req.ip)));
router.get('/webhooks/:id', requireApiKey, (req, res) => {
  const ep = W.getEndpoint(req.license.id, idParam(req));
  return ep ? res.json(ep) : res.status(404).json({ error: 'not_found' });
});
router.patch('/webhooks/:id', requireApiKey, (req, res) => send(res, updateWebhook(req.license, idParam(req), req.body)));
router.delete('/webhooks/:id', requireApiKey, (req, res) => send(res, deleteWebhook(req.license, idParam(req), req.ip)));
router.post('/webhooks/:id/test', requireApiKey, async (req, res) => {
  const r = await webhooks.sendTest(req.license.id, idParam(req));
  return r ? res.json(r) : res.status(404).json({ error: 'not_found' });
});

/* ── Sesión 11b: emisión de facturas ── */
const S = require('../services/invoicing');
const DI = require('../db/invoicing');

/** Emitir sin Idempotency-Key puede duplicar una factura si se reintenta: es obligatoria. */
function requireIdempotencyKey(req, res, next) {
  if (req.get('Idempotency-Key') === undefined) {
    return res.status(400).json({ error: 'idempotency_key_required', message: 'Para emitir facturas hace falta la cabecera Idempotency-Key (evita facturas duplicadas al reintentar).' });
  }
  next();
}

const ctx = (req) => ({ license: req.license, livemode: req.livemode, ip: req.ip });
const body = (req) => (req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {});

function issueInvoice({ license, body: b, livemode, ip, source = 'api' }) {
  const { rectifies_id: _r, ...rest } = b || {};
  return S.issue({ license, body: rest, source, livemode, ip });
}
function rectifyInvoice({ license, id, body: b, livemode, ip, source = 'api' }) {
  return S.issue({ license, body: { ...(b || {}), rectifies_id: id }, source, livemode, ip });
}

function listCustomers(license, q) {
  return { status: 200, body: { customers: DI.listCustomers(license.id, q || '') } };
}
function createCustomer(license, b, livemode) {
  // Con una clave de prueba no se escribe en la libreta real: se valida y se devuelve.
  const out = livemode ? DI.createCustomer(license.id, b || {}) : DI.validateCustomer(b || {});
  if (out.error) return { status: 400, body: { error: 'invalid_input', field: out.error, message: 'Dato del cliente no válido.' } };
  return { status: livemode ? 201 : 200, body: out.customer };
}

async function sendFile(res, out) {
  if (!out.file) return res.status(out.status).json(out.body);
  res.set({ 'Content-Type': out.file.contentType, 'Content-Disposition': `attachment; filename="${out.file.filename}"`, 'Cache-Control': 'no-store' });
  res.send(out.file.body);
}

router.post('/invoices', requireApiKey, requireIdempotencyKey, idempotency, (req, res) => send(res, issueInvoice({ ...ctx(req), body: body(req) })));
router.get('/invoices', requireApiKey, (req, res) => send(res, S.list({ license: req.license, query: req.query, livemode: req.livemode })));
router.get('/invoices/:id', requireApiKey, (req, res) => send(res, S.get({ license: req.license, id: idParam(req), livemode: req.livemode })));
router.post('/invoices/:id/rectify', requireApiKey, requireIdempotencyKey, idempotency, (req, res) => send(res, rectifyInvoice({ ...ctx(req), id: idParam(req), body: body(req) })));
router.post('/invoices/:id/cancel', requireApiKey, idempotency, (req, res) => send(res, S.cancel({ ...ctx(req), id: idParam(req), reason: body(req).reason })));
router.post('/invoices/:id/status', requireApiKey, idempotency, (req, res) => send(res, S.setStatus({ ...ctx(req), id: idParam(req), body: body(req) })));
router.get('/invoices/:id/pdf', requireApiKey, async (req, res) => sendFile(res, await S.pdf({ license: req.license, id: idParam(req), livemode: req.livemode })));
router.get('/invoices/:id/xml', requireApiKey, async (req, res) => sendFile(res, await S.einvoice({ license: req.license, id: idParam(req), format: req.query.format, livemode: req.livemode })));
router.get('/customers', requireApiKey, (req, res) => send(res, listCustomers(req.license, req.query.q)));
router.post('/customers', requireApiKey, idempotency, (req, res) => send(res, createCustomer(req.license, body(req), req.livemode)));

/* ── Sesión 9: herramientas fiscales sin IA (no gastan cuota) ── */
const input = (req) => (req.method === 'GET' ? req.query : req.body) || {};
const nif = (req, res) => send(res, T.taxId(input(req).value ?? input(req).nif));
router.get('/tax/nif', requireApiKey, nif);
router.post('/tax/nif', requireApiKey, nif);
router.post('/tax/vat', requireApiKey, (req, res) => send(res, T.vat(req.body)));
router.post('/tax/withholding', requireApiKey, (req, res) => send(res, T.withholding(req.body)));
router.post('/tax/model-130', requireApiKey, (req, res) => send(res, T.model130(req.license, req.body)));
router.get('/tax/quarter', requireApiKey, (req, res) => send(res, T.quarter(req.license, req.query)));
router.get('/tax/calendar', requireApiKey, (req, res) => send(res, T.calendar(req.license, req.query)));

module.exports = router;
module.exports.handlers = {
  analyze, extractInvoices, readInvoiceFiles, usage, listApiAnalyses, getApiAnalysis, createWebhook, updateWebhook, deleteWebhook,
  issueInvoice, rectifyInvoice, listCustomers, createCustomer,
  TYPES, INVOICE_MAX_FILES
};
