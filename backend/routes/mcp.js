/**
 * routes/mcp.js — sesión 7 (API, Bloque 1.4): servidor MCP remoto de Nokfi.
 *
 *   POST /api/mcp    JSON-RPC 2.0 (transporte "Streamable HTTP", sin estado)
 *   GET  /api/mcp    405 (no abrimos canal SSE: todas las respuestas son JSON)
 *
 * Autenticación: la MISMA clave de API (Authorization: Bearer nk_live_…),
 * mismo plan (Pro/Max), misma cuota y mismo registro de llamadas que la API
 * REST. Las herramientas llaman a las mismas funciones que /api/v1
 * (routes/v1.js → handlers), así que el comportamiento es idéntico.
 *
 * Métodos: initialize, notifications/*, ping, tools/list, tools/call.
 */

'use strict';

const express = require('express');
const router = express.Router();
const { requireApiKey } = require('../middleware/requireApiKey');
const { handlers: H } = require('./v1');
const T = require('../services/taxTools');

const SERVER_INFO = { name: 'nokfi', title: 'Nokfi', version: '1.1.0' };
const PROTOCOL_VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26'];
const LANGS = ['es', 'en', 'fr', 'it', 'de', 'pl'];

const INSTRUCTIONS = 'Nokfi is an AI for small-business documents and finance (Spain). Use extract_invoices to turn invoices (PDF/image as base64, or text) into validated JSON: the checks object is computed by Nokfi, not by the AI. Structured e-invoices (Facturae, UBL, CII, Factur-X/ZUGFeRD PDF) are read exactly, without AI and without quota. Use analyze for financial reports. Every analysis and every extract_invoices call that needs the AI uses 1 analysis of the user\'s daily quota; check get_usage first when running many. The tax tools (validate_tax_id, calculate_vat, calculate_withholding, estimate_model_130, fiscal_calendar) are deterministic Spanish tax calculations and do NOT use quota: prefer them over doing the math yourself. With a test key (nk_test_) AI tools return realistic sample data.';

const TOOLS = [
  {
    name: 'extract_invoices',
    title: 'Extract invoices',
    description: 'Extract structured data from up to 5 invoices (PDF, JPG, PNG, WebP as base64, plain text, or e-invoice XML). Returns issuer, NIF, number, dates, base, VAT, withholding and total, plus deterministic checks (totals, Spanish NIF/CIF/NIE check digit, date, VAT rate) and warnings. Nothing is stored. E-invoices (Facturae 3.2.x, UBL 2.x, CII, Factur-X/ZUGFeRD embedded in a PDF) are read exactly without AI and do not use quota (ai_used: false, source_format set); otherwise uses 1 analysis of the daily quota.',
    inputSchema: {
      type: 'object',
      properties: {
        files: {
          type: 'array', minItems: 1, maxItems: 5,
          items: {
            type: 'object',
            properties: {
              name: { type: 'string', description: 'File name' },
              mime: { type: 'string', enum: ['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'application/xml', 'text/xml'] },
              data: { type: 'string', description: 'File content in base64 (max 5 MB)' },
              text: { type: 'string', description: 'Alternative to data: invoice text or e-invoice XML' }
            }
          }
        },
        lang: { type: 'string', enum: LANGS, description: 'Language of text fields' }
      },
      required: ['files']
    },
    annotations: { readOnlyHint: true, openWorldHint: false }
  },
  {
    name: 'analyze',
    title: 'Run a financial analysis',
    description: 'Run a Nokfi analysis and get a structured report (summary, key figures, strengths, priorities, action plan). type: excel (data: { module: stock|ventas|servicios|entradas|caja|total, files: [{ name, rows: [ {column: value} ] }] }), compare (data: { module, periodA: { label, files }, periodB: { label, files } }), folder (data: { instruction, files: [{ name, text }] }) or cuestionario (data: { answers: { id: true|false|"partial"|"na" } }). Figures are computed by Nokfi from all rows; the AI only explains them. Saved in the user\'s history. Uses 1 analysis of the daily quota.',
    inputSchema: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['excel', 'compare', 'folder', 'cuestionario'] },
        data: { type: 'object' },
        title: { type: 'string' },
        lang: { type: 'string', enum: LANGS }
      },
      required: ['type', 'data']
    }
  },
  {
    name: 'validate_tax_id',
    title: 'Validate a Spanish tax ID',
    description: 'Validate a Spanish NIF, NIE or CIF (format and check digit) and get the entity type and the intra-EU VAT number. Does not query the AEAT census. No quota.',
    inputSchema: { type: 'object', properties: { value: { type: 'string', description: 'NIF, NIE or CIF, e.g. B12345674' } }, required: ['value'] },
    annotations: { readOnlyHint: true, openWorldHint: false }
  },
  {
    name: 'calculate_vat',
    title: 'Calculate VAT',
    description: 'Spanish VAT (IVA) from a net or gross amount, optionally with recargo de equivalencia (5.2 / 1.4 / 0.62 / 0.5 %). Returns base, VAT, surcharge and total. No quota.',
    inputSchema: {
      type: 'object',
      properties: {
        amount: { type: 'number' },
        rate: { type: 'number', enum: T.VAT_RATES, description: 'Default 21' },
        includes_vat: { type: 'boolean', description: 'true if amount already includes VAT' },
        equivalence_surcharge: { type: 'boolean' }
      },
      required: ['amount']
    },
    annotations: { readOnlyHint: true, openWorldHint: false }
  },
  {
    name: 'calculate_withholding',
    title: 'Calculate IRPF withholding',
    description: 'IRPF withholding for an invoice base (professional 15 %, new_professional 7 %, rental 19 %, agricultural 2 %, modules 1 %, or a custom rate) plus VAT and the invoice total to collect. No quota.',
    inputSchema: {
      type: 'object',
      properties: {
        base: { type: 'number' },
        type: { type: 'string', enum: Object.keys(T.WITHHOLDING_TYPES) },
        rate: { type: 'number', description: 'Custom rate (overrides type)' },
        vat_rate: { type: 'number', enum: T.VAT_RATES, description: 'Default 21' }
      },
      required: ['base']
    },
    annotations: { readOnlyHint: true, openWorldHint: false }
  },
  {
    name: 'estimate_model_130',
    title: 'Estimate Modelo 130',
    description: 'Estimate the quarterly IRPF payment (Modelo 130, estimación directa): 20 % of year-to-date net income minus previous payments and withholdings. Either pass year-to-date income/expenses, or source "ledger" to compute it from the user\'s Nokfi ledger. No quota.',
    inputSchema: {
      type: 'object',
      properties: {
        year: { type: 'integer' }, quarter: { type: 'integer', minimum: 1, maximum: 4 },
        source: { type: 'string', enum: ['input', 'ledger'] },
        income: { type: 'number' }, expenses: { type: 'number' },
        previous_payments: { type: 'number' }, withholdings: { type: 'number' }
      }
    },
    annotations: { readOnlyHint: true, openWorldHint: false }
  },
  {
    name: 'fiscal_calendar',
    title: 'Spanish fiscal calendar',
    description: 'Upcoming Spanish tax deadlines (303, 130, 111, 115, 390, 347, 100, 200, 202…) with days left, for autonomo or sociedad (defaults to the user\'s profile). Pass year for the full year. No quota.',
    inputSchema: {
      type: 'object',
      properties: { legal_form: { type: 'string', enum: ['autonomo', 'sociedad'] }, year: { type: 'integer' }, limit: { type: 'integer', minimum: 1, maximum: 24 } }
    },
    annotations: { readOnlyHint: true, openWorldHint: false }
  },
  {
    name: 'get_usage',
    title: 'Get usage',
    description: 'Plan, daily analysis quota and analyses used today.',
    inputSchema: { type: 'object', properties: {} },
    annotations: { readOnlyHint: true }
  },
  {
    name: 'list_analyses',
    title: 'List analyses',
    description: 'List the latest analyses (id, type, title, date, source web/api).',
    inputSchema: { type: 'object', properties: { limit: { type: 'integer', minimum: 1, maximum: 100 } } },
    annotations: { readOnlyHint: true }
  },
  {
    name: 'get_analysis',
    title: 'Get an analysis',
    description: 'Get a full report by id.',
    inputSchema: { type: 'object', properties: { id: { type: 'integer' } }, required: ['id'] },
    annotations: { readOnlyHint: true }
  }
];

const rpcError = (id, code, message) => ({ jsonrpc: '2.0', id: id ?? null, error: { code, message } });
const rpcResult = (id, result) => ({ jsonrpc: '2.0', id, result });

/** Resultado de herramienta: el JSON como texto y como structuredContent; los fallos, con isError. */
function toolResult(out) {
  const text = JSON.stringify(out.body);
  if (out.status !== 200) return { content: [{ type: 'text', text }], isError: true };
  return { content: [{ type: 'text', text }], structuredContent: out.body };
}

async function callTool(req, name, args = {}) {
  const license = req.license;
  const livemode = req.livemode;
  switch (name) {
    case 'extract_invoices': return toolResult(await H.extractInvoices({ license, body: args, ip: req.ip, source: 'mcp', livemode }));
    case 'analyze': return toolResult(await H.analyze({ license, body: args, ip: req.ip, source: 'mcp', livemode }));
    case 'validate_tax_id': return toolResult(T.taxId(args.value));
    case 'calculate_vat': return toolResult(T.vat(args));
    case 'calculate_withholding': return toolResult(T.withholding(args));
    case 'estimate_model_130': return toolResult(T.model130(license, args));
    case 'fiscal_calendar': return toolResult(T.calendar(license, args));
    case 'get_usage': return toolResult({ status: 200, body: H.usage(license, livemode) });
    case 'list_analyses': return toolResult({ status: 200, body: H.listApiAnalyses(license, args.limit) });
    case 'get_analysis': {
      const a = H.getApiAnalysis(license, args.id);
      return toolResult(a ? { status: 200, body: a } : { status: 404, body: { error: 'not_found', message: 'No existe un análisis con ese id.' } });
    }
    default: return null;
  }
}

async function handleMessage(req, msg) {
  if (!msg || msg.jsonrpc !== '2.0' || typeof msg.method !== 'string') return rpcError(msg?.id, -32600, 'Invalid Request');
  const isNotification = msg.id === undefined || msg.id === null;
  if (isNotification) return null; // notifications/initialized, cancelled…
  const p = msg.params || {};
  switch (msg.method) {
    case 'initialize': {
      const version = PROTOCOL_VERSIONS.includes(p.protocolVersion) ? p.protocolVersion : PROTOCOL_VERSIONS[0];
      return rpcResult(msg.id, { protocolVersion: version, capabilities: { tools: { listChanged: false } }, serverInfo: SERVER_INFO, instructions: INSTRUCTIONS });
    }
    case 'ping': return rpcResult(msg.id, {});
    case 'tools/list': return rpcResult(msg.id, { tools: TOOLS });
    case 'tools/call': {
      const result = await callTool(req, p.name, p.arguments && typeof p.arguments === 'object' ? p.arguments : {});
      return result ? rpcResult(msg.id, result) : rpcError(msg.id, -32602, `Unknown tool: ${p.name}`);
    }
    default: return rpcError(msg.id, -32601, `Method not found: ${msg.method}`);
  }
}

router.post('/', requireApiKey, async (req, res) => {
  const body = req.body;
  if (Array.isArray(body)) {
    const replies = (await Promise.all(body.map(m => handleMessage(req, m)))).filter(Boolean);
    return replies.length ? res.json(replies) : res.status(202).end();
  }
  const reply = await handleMessage(req, body);
  if (!reply) return res.status(202).end();
  res.json(reply);
});

router.get('/', (_req, res) => res.status(405).set('Allow', 'POST').json({ error: 'method_not_allowed', message: 'Usa POST (MCP Streamable HTTP, sin SSE).' }));
router.delete('/', (_req, res) => res.status(405).set('Allow', 'POST').end());

module.exports = router;
module.exports.TOOLS = TOOLS;
