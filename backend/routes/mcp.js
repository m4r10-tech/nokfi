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

const SERVER_INFO = { name: 'nokfi', title: 'Nokfi', version: '1.0.0' };
const PROTOCOL_VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26'];
const LANGS = ['es', 'en', 'fr', 'it', 'de', 'pl'];

const INSTRUCTIONS = 'Nokfi is an AI for small-business documents and finance (Spain). Use extract_invoices to turn invoices (PDF/image as base64, or text) into validated JSON: the checks object is computed by Nokfi, not by the AI. Use analyze for financial reports. Every extract_invoices call and every analysis uses 1 analysis of the user\'s daily quota; check get_usage first when running many.';

const TOOLS = [
  {
    name: 'extract_invoices',
    title: 'Extract invoices',
    description: 'Extract structured data from up to 5 invoices (PDF, JPG, PNG, WebP as base64, or plain text). Returns issuer, NIF, number, dates, base, VAT, withholding and total, plus deterministic checks (totals, Spanish NIF/CIF/NIE check digit, date, VAT rate) and warnings. Nothing is stored. Uses 1 analysis of the daily quota.',
    inputSchema: {
      type: 'object',
      properties: {
        files: {
          type: 'array', minItems: 1, maxItems: 5,
          items: {
            type: 'object',
            properties: {
              name: { type: 'string', description: 'File name' },
              mime: { type: 'string', enum: ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'] },
              data: { type: 'string', description: 'File content in base64 (max 5 MB)' },
              text: { type: 'string', description: 'Alternative to data: invoice text' }
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
    description: 'Run a Nokfi analysis and get a structured report (summary, key figures, strengths, priorities, action plan). type: excel (data: { module: stock|ventas|servicios|entradas|caja|total, files: [{ name, rows: [ {column: value} ] }] }), compare (data: { module, periodA: { label, files }, periodB: { label, files } }), folder (data: { instruction, files: [{ name, text }] }) or cuestionario (data: { answers: { id: true|false } }). Figures are computed by Nokfi from all rows; the AI only explains them. Saved in the user\'s history. Uses 1 analysis of the daily quota.',
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
  switch (name) {
    case 'extract_invoices': return toolResult(await H.extractInvoices({ license, body: args, ip: req.ip, source: 'mcp' }));
    case 'analyze': return toolResult(await H.analyze({ license, body: args, ip: req.ip, source: 'mcp' }));
    case 'get_usage': return toolResult({ status: 200, body: H.usage(license) });
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
