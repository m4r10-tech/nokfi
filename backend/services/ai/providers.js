/**
 * services/ai/providers.js — capa de proveedores de IA para los ANÁLISIS
 * (sesión 4, cambio de IA por privacidad).
 *
 * Decisión (2026-09-26): nada que lleve datos de usuarios va a planes que
 * entrenen con ellos. El free tier de Gemini SÍ entrena → fuera por defecto.
 * Proveedores que contractualmente NO entrenan con los datos:
 *   cloudflare  Cloudflare Workers AI (OpenAI-compatible). Principal.
 *   groq        Groq Cloud (OpenAI-compatible, gratis sin tarjeta). gpt-oss-120b (texto) y qwen3.8-27b (imágenes).
 *   gemini      Solo si se añade a AI_PROVIDERS (p.ej. cuando haya plan de PAGO).
 *   local       IA en el propio VPS (llama-server, LOCAL_AI_URL). Último respaldo (2026-10).
 *
 * Orden: AI_PROVIDERS (por defecto "groq,cloudflare,local"); solo se usan los que
 * tengan credenciales. Si uno falla (cuota, saturación, petición demasiado
 * grande, formato no soportado…) se prueba el siguiente.
 *
 * Misma interfaz que antes (generate({ system, parts, schema, maxTokens })):
 * `parts` = [{ text } | { inlineData: { mimeType, data } }].
 */

'use strict';

const { fetchWithTimeout, requestLong } = require('../../utils/http');
const { audit } = require('../../db/database');
const budget = require('../../utils/aiBudget');
const gemini = require('./gemini');
const localAi = require('./localQueue');
const { AiError, parseJsonLoose } = gemini;
const { langDirective } = require('./prompts');

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
  if (s.maxItems) out.maxItems = s.maxItems;
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

async function openAiCompatible({ name, url, key, model, system, parts, schema, maxTokens, jsonMode, jsonSchema = false, extra = {}, timeoutMs = 90000, long = false }) {
  // Con json_schema (IA local) la gramática ya impone la estructura: el esquema en
  // texto solo alarga la lectura (~500 tokens) y en las pruebas empeoraba el informe.
  const sys = schema && !jsonSchema ? `${system}\n\n${jsonInstruction(schema)}` : system;
  const content = toOpenAiContent(parts);
  // Tope de seguridad (utils/aiBudget.js): si la llamada puede pasarse, se salta este proveedor.
  const chars = sys.length + parts.reduce((n, p) => n + (p.text ? p.text.length : p.inlineData ? 4000 : 0), 0);
  const gate = budget.allow(name, budget.estimateTokens(chars, maxTokens));
  if (!gate.ok) {
    const err = new AiError('ai_quota_exceeded', `${name}: tope de seguridad (${gate.reason})`);
    err.retryable = true;
    throw err;
  }
  const body = {
    model,
    messages: [{ role: 'system', content: sys }, { role: 'user', content }],
    max_tokens: maxTokens,
    temperature: 0.3,
    ...extra
  };
  if (schema && jsonSchema) body.response_format = { type: 'json_schema', json_schema: { name: 'nokfi', schema: toJsonSchema(schema) } };
  else if (schema && jsonMode) body.response_format = { type: 'json_object' };
  let res;
  try {
    res = await (long ? requestLong : fetchWithTimeout)(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(key ? { Authorization: `Bearer ${key}` } : {}) },
      body: JSON.stringify(body)
    }, timeoutMs);
  } catch (e) {
    const err = new AiError('ai_provider_error', `${name}: ${e.message}`);
    err.retryable = true;
    throw err;
  }
  if (!res.ok) throw providerError(name, res.status, await res.text().catch(() => ''));
  const data = await res.json();
  if (data.usage) budget.record(name, data.usage);
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
  // Groq (sep-2026) retiró Llama: texto con gpt-oss-120b; imágenes con qwen3.8-27b (visión).
  groq: {
    configured: () => !!process.env.GROQ_API_KEY,
    generate: (o) => {
      const vision = o.parts.some(p => p.inlineData);
      return openAiCompatible({
        ...o, name: 'groq', url: 'https://api.groq.com/openai/v1/chat/completions', key: process.env.GROQ_API_KEY,
        model: vision ? (process.env.GROQ_VISION_MODEL || 'qwen/qwen3.8-27b') : (process.env.GROQ_MODEL || 'openai/gpt-oss-120b'),
        jsonMode: true, extra: vision ? {} : { reasoning_effort: 'low' }
      });
    }
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
  },
  // IA local (2026-10): llama-server en el propio VPS (solo 127.0.0.1). Último
  // respaldo: lento en CPU, pero los datos no salen del servidor. El JSON va
  // forzado por gramática (json_schema), así un modelo pequeño no puede romperlo.
  local: {
    configured: () => !!process.env.LOCAL_AI_URL,
    generate: async (o) => {
      // En CPU lee ~18 tokens/s: una petición enorme no acabaría a tiempo. Mejor
      // fallar en el acto que hacer esperar minutos para nada.
      const chars = (o.system || '').length + o.parts.reduce((n, p) => n + (p.text ? p.text.length : 0), 0);
      if (chars > (Number(process.env.LOCAL_AI_MAX_PROMPT_CHARS) || 28000)) {
        const err = new AiError('prompt_too_long', 'local: petición demasiado grande');
        err.retryable = true;
        throw err;
      }
      return localAi.run(() => openAiCompatible({
        ...o,
        // Los modelos pequeños olvidan el idioma pedido en el system: se repite al final.
        parts: o.lang ? [...o.parts, { text: langDirective(o.lang) }] : o.parts,
        name: 'local', url: `${process.env.LOCAL_AI_URL}/v1/chat/completions`, key: '',
        model: process.env.LOCAL_AI_MODEL || 'local',
        maxTokens: Math.min(o.maxTokens || 3000, Number(process.env.LOCAL_AI_MAX_TOKENS) || 3000),
        jsonSchema: true, extra: { chat_template_kwargs: { enable_thinking: false } }, long: true,
        timeoutMs: Number(process.env.LOCAL_AI_TIMEOUT_MS) || 12 * 60000
      }));
    }
  }
};

function providerOrder() {
  // Un proveedor con fecha de caducidad (AI_EXPIRES_<PROV>) deja de usarse solo ese día.
  return (process.env.AI_PROVIDERS || 'groq,cloudflare,local').split(',').map(s => s.trim())
    .filter(p => PROVIDERS[p]?.configured() && !budget.expired(p));
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
      // Para el email diario de salud (services/opsReport.js): sin datos del usuario.
      audit('AI_PROVIDER_FAILED', { detail: `analysis ${name}: ${String(e.code || e.message).slice(0, 120)}` });
      if (!(e instanceof AiError) || e.retryable === false) throw e;
      console.warn(`[AI] ${name} falló (${e.message}); probando el siguiente proveedor`);
    }
  }
  throw last;
}

module.exports = { generate, providerOrder, toJsonSchema, toOpenAiContent, PROVIDERS };
