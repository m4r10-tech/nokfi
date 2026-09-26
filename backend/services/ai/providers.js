/**
 * services/ai/providers.js — capa de proveedores de IA para los ANÁLISIS
 * (sesión 4, cambio de IA por privacidad).
 *
 * Decisión (2026-09-26): nada que lleve datos de usuarios va a planes que
 * entrenen con ellos. El free tier de Gemini SÍ entrena → fuera por defecto.
 * Proveedores gratuitos que contractualmente NO entrenan con los datos:
 *   groq        Groq Cloud (OpenAI-compatible). Llama 4 Scout: texto + imágenes.
 *   cloudflare  Cloudflare Workers AI (OpenAI-compatible). Respaldo.
 *   gemini      Solo si se añade a AI_PROVIDERS (p.ej. cuando haya plan de PAGO).
 *
 * Orden: AI_PROVIDERS (por defecto "groq,cloudflare"); solo se usan los que
 * tengan credenciales. Si uno falla (cuota, saturación, petición demasiado
 * grande, formato no soportado…) se prueba el siguiente.
 *
 * Misma interfaz que antes (generate({ system, parts, schema, maxTokens })):
 * `parts` = [{ text } | { inlineData: { mimeType, data } }].
 */

'use strict';

const { fetchWithTimeout } = require('../../utils/http');
const gemini = require('./gemini');
const { AiError, parseJsonLoose } = gemini;

const IMAGE_MIMES = ['image/jpeg', 'image/png', 'image/webp'];

/** Esquema estilo Gemini (type: 'OBJECT'…) → JSON Schema estándar compacto para el prompt. */
function toJsonSchema(s) {
  if (!s || typeof s !== 'object') return s;
  const out = {};
  if (s.type) out.type = String(s.type).toLowerCase();
  if (s.enum) out.enum = s.enum;
  if (s.description) out.description = s.description;
  if (s.properties) out.properties = Object.fromEntries(Object.entries(s.properties).map(([k, v]) => [k, toJsonSchema(v)]));
  if (s.items) out.items = toJsonSchema(s.items);
  if (s.required) out.required = s.required;
  return out;
}

function jsonInstruction(schema) {
  return 'FORMATO DE RESPUESTA: devuelve ÚNICAMENTE un objeto JSON válido (sin texto antes ni después, sin ```), '
    + `que cumpla este JSON Schema:\n${JSON.stringify(toJsonSchema(schema))}`;
}

/** parts (formato Gemini) → content de OpenAI. Lanza 'unsupported' si hay algo que el proveedor no admite. */
function toOpenAiContent(parts) {
  const hasImage = parts.some(p => p.inlineData);
  if (!hasImage) return parts.map(p => p.text || '').join('\n\n');
  return parts.map(p => {
    if (p.inlineData) {
      if (!IMAGE_MIMES.includes(p.inlineData.mimeType)) {
        const err = new AiError('ai_provider_error', `formato ${p.inlineData.mimeType} no soportado`);
        err.retryable = true;
        throw err;
      }
      return { type: 'image_url', image_url: { url: `data:${p.inlineData.mimeType};base64,${p.inlineData.data}` } };
    }
    return { type: 'text', text: p.text || '' };
  });
}

function providerError(name, status, body) {
  console.error(`[AI] ${name} respondió con error:`, status, String(body).slice(0, 400));
  const err = status === 429 ? new AiError('ai_quota_exceeded', `${name} 429`) : new AiError('ai_provider_error', `${name} ${status}`);
  err.retryable = true; // cualquier fallo de un proveedor → probar el siguiente
  return err;
}

async function openAiCompatible({ name, url, key, model, system, parts, schema, maxTokens, jsonMode, timeoutMs = 90000 }) {
  const sys = schema ? `${system}\n\n${jsonInstruction(schema)}` : system;
  const body = {
    model,
    messages: [{ role: 'system', content: sys }, { role: 'user', content: toOpenAiContent(parts) }],
    max_tokens: maxTokens,
    temperature: 0.3
  };
  if (schema && jsonMode) body.response_format = { type: 'json_object' };
  let res;
  try {
    res = await fetchWithTimeout(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify(body)
    }, timeoutMs);
  } catch (e) {
    const err = new AiError('ai_provider_error', `${name}: ${e.message}`);
    err.retryable = true;
    throw err;
  }
  if (!res.ok) throw providerError(name, res.status, await res.text().catch(() => ''));
  const data = await res.json();
  const text = data.choices?.[0]?.message?.content || '';
  if (!text) {
    const err = new AiError('ai_empty_response', `${name} vacío`);
    err.retryable = true;
    throw err;
  }
  if (!schema) return { text, json: null, model: `${name}:${model}` };
  const json = parseJsonLoose(text);
  if (json == null) {
    console.error(`[AI] ${name} devolvió JSON inválido (len ${text.length}, finish ${data.choices?.[0]?.finish_reason})`);
    const err = new AiError('ai_bad_output', `${name} JSON inválido`);
    err.retryable = true;
    throw err;
  }
  return { text, json, model: `${name}:${model}` };
}

const PROVIDERS = {
  groq: {
    configured: () => !!process.env.GROQ_API_KEY,
    generate: (o) => openAiCompatible({
      ...o, name: 'groq', url: 'https://api.groq.com/openai/v1/chat/completions', key: process.env.GROQ_API_KEY,
      model: process.env.GROQ_MODEL || 'meta-llama/llama-4-scout-17b-16e-instruct', jsonMode: true
    })
  },
  cloudflare: {
    configured: () => !!(process.env.CF_ACCOUNT_ID && process.env.CF_AI_TOKEN),
    generate: (o) => openAiCompatible({
      ...o, name: 'cloudflare', url: `https://api.cloudflare.com/client/v4/accounts/${process.env.CF_ACCOUNT_ID}/ai/v1/chat/completions`,
      key: process.env.CF_AI_TOKEN, model: process.env.CF_AI_MODEL || '@cf/meta/llama-4-scout-17b-16e-instruct', jsonMode: false
    })
  },
  gemini: {
    configured: () => !!process.env.GEMINI_API_KEY,
    generate: (o) => gemini.generate(o)
  }
};

function providerOrder() {
  return (process.env.AI_PROVIDERS || 'groq,cloudflare').split(',').map(s => s.trim()).filter(p => PROVIDERS[p]?.configured());
}

/** Mismo contrato que gemini.generate; recorre los proveedores configurados. */
async function generate(opts) {
  const order = providerOrder();
  if (!order.length) throw new AiError('ai_not_configured');
  let last;
  for (const name of order) {
    try {
      return await PROVIDERS[name].generate({ maxTokens: 8192, ...opts });
    } catch (e) {
      last = e;
      if (!(e instanceof AiError) || e.retryable === false) throw e;
      console.warn(`[AI] ${name} falló (${e.message}); probando el siguiente proveedor`);
    }
  }
  throw last;
}

module.exports = { generate, providerOrder, toJsonSchema, toOpenAiContent, PROVIDERS };
