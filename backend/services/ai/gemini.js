/**
 * services/ai/gemini.js — único punto que habla con la API de Google Gemini.
 *
 * Sesión 4 (F1/F2): antes routes/proxy.js reenviaba un prompt libre del
 * navegador. Ahora el backend arma el prompt (services/ai/prompts.js) con
 * `systemInstruction` y, cuando hay esquema, pide salida JSON estructurada
 * (`responseMimeType: application/json` + `responseSchema`).
 *
 * Errores tipados (AiError.code) para que las rutas respondan igual que antes:
 *   ai_quota_exceeded  → 429 de Gemini (cuota global del free tier)
 *   ai_provider_error  → cualquier otro fallo HTTP / red / timeout
 *   ai_empty_response  → respuesta vacía (bloqueo de seguridad, etc.)
 *   ai_bad_output      → se pidió JSON y no llegó JSON válido (p.ej. truncado)
 */

'use strict';

const { fetchWithTimeout } = require('../../utils/http');

class AiError extends Error {
  constructor(code, message) {
    super(message || code);
    this.code = code;
  }
}

/** Modelo de respaldo si el principal está saturado (503) o sin cuota (429):
 *  la cuota gratuita de Gemini es POR MODELO, así que el lite suele seguir
 *  disponible. Vacío ('none') desactiva el respaldo. */
function fallbackModel() {
  const f = process.env.GEMINI_FALLBACK_MODEL;
  if (f === 'none') return null;
  return f || 'gemini-flash-lite-latest';
}

const RETRYABLE = [429, 500, 502, 503, 504];

function defaultModel() {
  // Alias de Google que siempre apunta al flash vigente (ver historial de
  // routes/proxy.js: gemini-2.5-flash se retiró para keys nuevas en 2026-07).
  return process.env.GEMINI_MODEL || 'gemini-flash-latest';
}

/**
 * @param {object} o
 * @param {string} o.system        instrucción de sistema
 * @param {Array}  o.parts         partes del mensaje del usuario ({text} | {inlineData})
 * @param {object} [o.schema]      responseSchema → salida JSON
 * @param {number} [o.maxTokens]
 * @param {string} [o.model]
 * @param {number} [o.timeoutMs]
 * @returns {Promise<{ text: string, json: any, model: string }>}
 */
async function generate(opts) {
  const primary = opts.model || defaultModel();
  try {
    return await generateOnce({ ...opts, model: primary });
  } catch (e) {
    const fb = fallbackModel();
    if (!(e instanceof AiError) || !e.retryable || !fb || fb === primary) throw e;
    console.warn(`[AI] ${primary} no disponible (${e.message}); reintento con ${fb}`);
    return generateOnce({ ...opts, model: fb });
  }
}

async function generateOnce({ system, parts, contents, schema, maxTokens = 8192, model, timeoutMs = 90000, temperature }) {
  if (!process.env.GEMINI_API_KEY) throw new AiError('ai_not_configured');
  const m = model;
  const generationConfig = { maxOutputTokens: maxTokens };
  if (typeof temperature === 'number') generationConfig.temperature = temperature;
  if (schema) {
    generationConfig.responseMimeType = 'application/json';
    generationConfig.responseSchema = schema;
  }
  const body = {
    // `contents` (multi-turno, chat C5) o un único turno de usuario con `parts`.
    contents: contents || [{ role: 'user', parts }],
    generationConfig
  };
  if (system) body.systemInstruction = { parts: [{ text: system }] };

  let res;
  try {
    res = await fetchWithTimeout(
      `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY },
        body: JSON.stringify(body)
      },
      timeoutMs
    );
  } catch (e) {
    const err = new AiError('ai_provider_error', e.message);
    err.retryable = true;
    throw err;
  }

  if (!res.ok) {
    const errBody = await res.text().catch(() => '');
    console.error('[AI] Gemini respondió con error:', res.status, String(errBody).slice(0, 500));
    const err = res.status === 429 ? new AiError('ai_quota_exceeded', 'status 429') : new AiError('ai_provider_error', `status ${res.status}`);
    err.retryable = RETRYABLE.includes(res.status);
    throw err;
  }

  const data = await res.json();
  const candidate = data.candidates?.[0];
  const text = (candidate?.content?.parts || []).map(p => p.text || '').join('');
  if (!text) {
    console.error('[AI] Respuesta vacía. finishReason:', candidate?.finishReason);
    throw new AiError('ai_empty_response');
  }
  if (!schema) return { text, json: null, model: m };

  const json = parseJsonLoose(text);
  if (json == null) {
    console.error('[AI] JSON inválido. finishReason:', candidate?.finishReason, 'len:', text.length);
    throw new AiError('ai_bad_output');
  }
  return { text, json, model: m };
}

/** JSON.parse tolerante: quita vallas ```json y recorta al primer {…}/[…]. */
function parseJsonLoose(text) {
  const t = String(text).trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  try { return JSON.parse(t); } catch { /* sigue */ }
  const start = t.search(/[[{]/);
  const end = Math.max(t.lastIndexOf('}'), t.lastIndexOf(']'));
  if (start >= 0 && end > start) {
    try { return JSON.parse(t.slice(start, end + 1)); } catch { /* nada */ }
  }
  return null;
}

module.exports = { generate, AiError, parseJsonLoose, defaultModel, fallbackModel };
