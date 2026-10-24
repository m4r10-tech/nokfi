/**
 * services/ai/localQueue.js — turno de la IA local (2026-10).
 *
 * El VPS solo puede generar con un modelo a la vez (CPU). Análisis, chat y
 * emails comparten esta cola: uno trabajando y como mucho LOCAL_AI_MAX_QUEUE
 * esperando. Si hay más, se falla en el acto con un error reintentable en vez
 * de dejar al usuario minutos esperando algo que no llegará a tiempo.
 */

'use strict';

const { AiError } = require('./gemini');

let running = 0;
const waiting = [];

function maxQueue() {
  return Number(process.env.LOCAL_AI_MAX_QUEUE) || 3;
}

async function run(task) {
  if (running >= 1 && waiting.length >= maxQueue()) {
    const err = new AiError('ai_provider_error', 'local: cola llena');
    err.retryable = true;
    throw err;
  }
  // El turno se pasa directamente al siguiente (sin dejar el hueco libre un
  // instante), así nunca hay dos generando a la vez.
  if (running >= 1) await new Promise(resolve => waiting.push(resolve));
  else running++;
  try {
    return await task();
  } finally {
    const next = waiting.shift();
    if (next) next();
    else running--;
  }
}

const stats = () => ({ running, waiting: waiting.length });

/** ¿Responde el llama-server? null si la IA local no está configurada. */
async function health() {
  if (!process.env.LOCAL_AI_URL) return null;
  try {
    const r = await require('../../utils/http').requestLong(`${process.env.LOCAL_AI_URL}/health`, {}, 5000);
    return r.ok;
  } catch {
    return false;
  }
}

module.exports = { run, stats, health };
