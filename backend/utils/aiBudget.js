/**
 * utils/aiBudget.js — tope de seguridad de gasto por proveedor de IA (sesión 7).
 *
 * Para no pagar nada sin querer: antes de llamar a un proveedor con tope, se
 * comprueba lo consumido HOY (tokens) y en el MES (coste estimado en USD) y,
 * si la llamada puede pasarse, se salta ese proveedor (la cadena prueba el
 * siguiente). Después se anota el consumo real que devuelve la API (usage).
 *
 * Genérico: cualquier proveedor puede tener tope con variables de entorno
 *   AI_BUDGET_<PROV>_DAILY_TOKENS   tokens (entrada + salida) al día
 *   AI_BUDGET_<PROV>_MONTHLY_USD    coste estimado al mes
 *   AI_PRICE_<PROV>_IN / _OUT       USD por millón de tokens (para estimar)
 * Hoy solo Cerebras lo trae por defecto (DEFAULTS), porque tiene tarjeta
 * asociada. Poner un tope a 0 lo desactiva del todo.
 */

'use strict';

const { getDB } = require('../db/database');

// Cerebras: prueba de 5 $ que caduca a los 30 días (sin cargos automáticos).
// Topes muy por debajo: ~4 $ al mes como máximo y 300.000 tokens al día.
// Precios de gpt-oss-120b redondeados al alza para estimar de más, no de menos.
const DEFAULTS = {
  cerebras: { dailyTokens: 300000, monthlyUsd: 4, priceIn: 0.4, priceOut: 0.8 }
};

function num(v) { const n = Number(v); return v !== undefined && v !== '' && Number.isFinite(n) ? n : undefined; }

/** Configuración de tope de un proveedor, o null si no tiene. */
function budgetFor(provider) {
  const d = DEFAULTS[provider] || {};
  const P = provider.toUpperCase();
  const cfg = {
    dailyTokens: num(process.env[`AI_BUDGET_${P}_DAILY_TOKENS`]) ?? d.dailyTokens,
    monthlyUsd: num(process.env[`AI_BUDGET_${P}_MONTHLY_USD`]) ?? d.monthlyUsd,
    priceIn: num(process.env[`AI_PRICE_${P}_IN`]) ?? d.priceIn ?? 0,
    priceOut: num(process.env[`AI_PRICE_${P}_OUT`]) ?? d.priceOut ?? 0
  };
  return cfg.dailyTokens === undefined && cfg.monthlyUsd === undefined ? null : cfg;
}

const today = () => new Date().toISOString().slice(0, 10);

function usage(provider, day = today()) {
  const db = getDB();
  const d = db.prepare('SELECT calls, tokens_in, tokens_out, cost_usd FROM ai_provider_usage WHERE provider = ? AND day = ?').get(provider, day)
    || { calls: 0, tokens_in: 0, tokens_out: 0, cost_usd: 0 };
  const m = db.prepare('SELECT COALESCE(SUM(cost_usd), 0) c FROM ai_provider_usage WHERE provider = ? AND substr(day, 1, 7) = ?').get(provider, day.slice(0, 7));
  return { ...d, tokens: d.tokens_in + d.tokens_out, month_usd: m.c };
}

/** ¿Cabe una llamada de ~estTokens? Devuelve { ok, reason }. Sin tope → siempre ok. */
function allow(provider, estTokens = 0) {
  const cfg = budgetFor(provider);
  if (!cfg) return { ok: true };
  const u = usage(provider);
  if (cfg.dailyTokens !== undefined && u.tokens + estTokens > cfg.dailyTokens) return { ok: false, reason: 'daily_tokens' };
  const estCost = (estTokens * Math.max(cfg.priceIn, cfg.priceOut)) / 1e6;
  if (cfg.monthlyUsd !== undefined && u.month_usd + estCost > cfg.monthlyUsd) return { ok: false, reason: 'monthly_usd' };
  return { ok: true };
}

/** Anota el consumo real de una llamada (usage de la respuesta OpenAI-compatible). */
function record(provider, { prompt_tokens = 0, completion_tokens = 0 } = {}) {
  const cfg = budgetFor(provider) || { priceIn: 0, priceOut: 0 };
  const cost = (prompt_tokens * cfg.priceIn + completion_tokens * cfg.priceOut) / 1e6;
  getDB().prepare(`INSERT INTO ai_provider_usage (provider, day, calls, tokens_in, tokens_out, cost_usd) VALUES (?, ?, 1, ?, ?, ?)
    ON CONFLICT(provider, day) DO UPDATE SET calls = calls + 1, tokens_in = tokens_in + excluded.tokens_in,
      tokens_out = tokens_out + excluded.tokens_out, cost_usd = cost_usd + excluded.cost_usd`)
    .run(provider, today(), Math.max(0, prompt_tokens | 0), Math.max(0, completion_tokens | 0), cost);
}

/** Tokens estimados de una petición: ~3 caracteres por token + la salida máxima pedida. */
function estimateTokens(chars, maxOut = 0) {
  return Math.ceil(chars / 3) + maxOut;
}

/** Resumen para el informe diario y /api/admin/ai-status. */
function status() {
  return Object.keys(DEFAULTS).concat(
    Object.keys(process.env).map(k => k.match(/^AI_BUDGET_([A-Z0-9]+)_/)?.[1]?.toLowerCase()).filter(Boolean)
  ).filter((v, i, a) => a.indexOf(v) === i).map(p => ({ provider: p, budget: budgetFor(p), today: usage(p) }));
}

module.exports = { budgetFor, allow, record, estimateTokens, usage, status };
