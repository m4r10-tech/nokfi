/**
 * routes/dev.js — sesión 9 (API, Bloque 2.5): panel de Desarrolladores
 * (sesión web, no clave de API).
 *
 *   Webhooks
 *     GET    /api/dev/webhooks                    lista + tipos de evento
 *     POST   /api/dev/webhooks                    { url, events, description } → con el secreto
 *     PATCH  /api/dev/webhooks/:id                { url?, events?, description?, enabled? }
 *     DELETE /api/dev/webhooks/:id
 *     GET    /api/dev/webhooks/:id/secret         mostrar el secreto de firma
 *     POST   /api/dev/webhooks/:id/rotate-secret  secreto nuevo (el anterior deja de valer)
 *     POST   /api/dev/webhooks/:id/test           envía un evento "ping" y devuelve el resultado
 *     GET    /api/dev/deliveries?endpoint_id&before
 *     POST   /api/dev/deliveries/:id/resend
 *   Registro, clientes y trabajos
 *     GET    /api/dev/calls?key_id&client&result&mode&before
 *     GET    /api/dev/clients
 *     GET    /api/dev/jobs
 *   Playground
 *     POST   /api/dev/playground                  { operation, mode: test|live, input }
 *
 * Regla de planes: en modo prueba todo está disponible en todos los planes
 * (Mini incluido); lo real (claves nk_live_, Playground real y eventos reales)
 * es de Pro y Max. Los webhooks de una cuenta Mini solo reciben eventos de prueba.
 */

'use strict';

const express = require('express');
const rateLimit = require('express-rate-limit');
const { requireLicense } = require('../middleware/requireLicense');
const { API_PLANS } = require('../middleware/requireApiKey');
const W = require('../db/webhooks');
const webhooks = require('../services/webhooks');
const jobs = require('../services/jobs');
const T = require('../services/taxTools');
const { listApiCalls, clientsSummary, logApiCall } = require('../db/apikeys');
const { handlers: H } = require('./v1');

const router = express.Router();
router.use(requireLicense);

const idParam = (req) => { const n = Number(req.params.id); return Number.isInteger(n) ? n : 0; };
const send = (res, out) => res.status(out.status).json(out.body);

/* ── Webhooks ── */
router.get('/webhooks', (req, res) => res.json({
  webhooks: W.listEndpoints(req.license.id),
  event_types: W.EVENT_TYPES,
  live_events: API_PLANS.includes(req.license.plan)
}));
router.post('/webhooks', (req, res) => send(res, H.createWebhook(req.license, req.body, req.ip)));
router.patch('/webhooks/:id', (req, res) => send(res, H.updateWebhook(req.license, idParam(req), req.body)));
router.delete('/webhooks/:id', (req, res) => send(res, H.deleteWebhook(req.license, idParam(req), req.ip)));
router.get('/webhooks/:id/secret', (req, res) => {
  const ep = W.getEndpoint(req.license.id, idParam(req), { withSecret: true });
  return ep ? res.json({ secret: ep.secret }) : res.status(404).json({ error: 'not_found' });
});
router.post('/webhooks/:id/rotate-secret', (req, res) => {
  const ep = W.rotateSecret(req.license.id, idParam(req));
  return ep ? res.json({ secret: ep.secret }) : res.status(404).json({ error: 'not_found' });
});
router.post('/webhooks/:id/test', async (req, res) => {
  const r = await webhooks.sendTest(req.license.id, idParam(req));
  return r ? res.json(r) : res.status(404).json({ error: 'not_found' });
});
router.get('/deliveries', (req, res) => res.json({
  deliveries: W.listDeliveries(req.license.id, { endpoint_id: Number(req.query.endpoint_id) || null, before: req.query.before, limit: req.query.limit })
}));
router.post('/deliveries/:id/resend', async (req, res) => {
  const r = await webhooks.resend(req.license.id, idParam(req));
  if (r.error === 'not_found') return res.status(404).json({ error: 'not_found' });
  if (r.error === 'payload_expired') return res.status(410).json({ error: 'payload_expired', message: 'El contenido de este envío ya se ha borrado (se guarda 24 h).' });
  res.json(r);
});

/* ── Registro de llamadas, clientes y trabajos ── */
router.get('/calls', (req, res) => res.json(listApiCalls(req.license.id, req.query)));
router.get('/clients', (req, res) => res.json({ clients: clientsSummary(req.license.id) }));
router.get('/jobs', (req, res) => res.json({ jobs: jobs.listJobs(req.license.id, req.query.limit) }));

/* ── Playground ──
 * Ejecuta la MISMA función que la API con la sesión web (no hace falta pegar
 * la clave en el navegador). Queda en el Registro como "Playground". */
const OPERATIONS = {
  'analyze': { method: 'POST', path: '/api/v1/analyze', ai: true, run: (c) => H.analyze(c) },
  'invoices.extract': { method: 'POST', path: '/api/v1/invoices/extract', ai: true, run: (c) => H.extractInvoices(c) },
  'tax.nif': { method: 'GET', path: '/api/v1/tax/nif', run: (c) => T.taxId(c.body.value) },
  'tax.vat': { method: 'POST', path: '/api/v1/tax/vat', run: (c) => T.vat(c.body) },
  'tax.withholding': { method: 'POST', path: '/api/v1/tax/withholding', run: (c) => T.withholding(c.body) },
  'tax.model-130': { method: 'POST', path: '/api/v1/tax/model-130', run: (c) => T.model130(c.license, c.body) },
  'tax.quarter': { method: 'GET', path: '/api/v1/tax/quarter', run: (c) => T.quarter(c.license, c.body) },
  'tax.calendar': { method: 'GET', path: '/api/v1/tax/calendar', run: (c) => T.calendar(c.license, c.body) },
  'usage': { method: 'GET', path: '/api/v1/usage', run: (c) => ({ status: 200, body: H.usage(c.license, c.livemode) }) },
  // Facturas: en el Playground solo en modo prueba (TEST-…), para no emitir una factura real por accidente.
  'invoices.issue': { method: 'POST', path: '/api/v1/invoices', testOnly: true, run: (c) => H.issueInvoice(c) },
  'invoices.list': { method: 'GET', path: '/api/v1/invoices', run: (c) => require('../services/invoicing').list({ license: c.license, query: c.body, livemode: c.livemode }) }
};

const playgroundLimiter = rateLimit({
  windowMs: 60 * 1000, max: 20, standardHeaders: true, legacyHeaders: false,
  keyGenerator: (req) => `pg:${req.license.id}`,
  message: { error: 'rate_limited', message: 'Máximo 20 ejecuciones por minuto en el Playground.' }
});

router.post('/playground', playgroundLimiter, async (req, res) => {
  const op = OPERATIONS[req.body?.operation];
  if (!op) return res.status(400).json({ error: 'invalid_operation', message: `operation debe ser una de: ${Object.keys(OPERATIONS).join(', ')}.` });
  const livemode = req.body?.mode === 'live';
  if (livemode && !API_PLANS.includes(req.license.plan)) {
    return res.status(403).json({ error: 'api_plan_required', message: 'El modo real está en los planes Pro y Max. En modo prueba puedes probarlo todo.' });
  }
  if (livemode && op.testOnly) {
    return res.status(400).json({ error: 'test_only', message: 'En el Playground las facturas se emiten solo en modo prueba. Para emitir una real usa la API o la app.' });
  }
  const input = req.body?.input && typeof req.body.input === 'object' ? req.body.input : {};
  const started = Date.now();
  let out;
  try {
    out = await op.run({ license: req.license, body: input, ip: req.ip, source: 'api', livemode });
  } catch (e) {
    console.error('[PLAYGROUND]', e.message);
    out = { status: 500, body: { error: 'internal_error' } };
  }
  const ms = Date.now() - started;
  try {
    logApiCall({ license_id: req.license.id, key_id: null, method: op.method, path: op.path, status: out.status, error_code: out.body?.error || '', ms, livemode });
  } catch (_) { /* el registro nunca rompe la respuesta */ }
  res.json({ status: out.status, body: out.body, ms, livemode, request: { method: op.method, path: op.path }, uses_quota: !!op.ai && livemode && out.body?.ai_used !== false });
});

module.exports = router;
module.exports.OPERATIONS = OPERATIONS;
