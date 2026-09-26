/**
 * services/ai/quota.js — cuota diaria + "trabajos" de varios pasos.
 *
 * Regla de producto (F3, decidido 2026-09-26): 1 petición del usuario =
 * 1 análisis de su cuota diaria, aunque por dentro haga falta procesar por
 * lotes (resumir una carpeta grande, leer 40 facturas…). Para eso:
 *
 *   - La PRIMERA llamada de un trabajo reserva 1 slot (reserveAiSlot, atómico,
 *     Deuda H) y crea un job en memoria con un presupuesto de llamadas.
 *   - Las siguientes llamadas llevan `job` y no reservan nada (tope técnico:
 *     `calls` por trabajo y caducidad de 15 min → una carpeta enorme no
 *     dispara el coste sin límite).
 *   - Si NINGUNA llamada del trabajo ha salido bien, un fallo libera el slot
 *     (el análisis fallido no cuenta, igual que antes).
 *
 * Los jobs viven en memoria: el backend es un único proceso PM2 (fork). Un
 * reinicio solo invalida trabajos a medias (el frontend reintenta sin job).
 */

'use strict';

const crypto = require('crypto');
const { reserveAiSlot, releaseAiSlot, aiQuotaForPlan, countAiAnalysesToday, audit } = require('../../db/database');

const JOB_TTL_MS = 15 * 60 * 1000;
const jobs = new Map();

class QuotaError extends Error {
  constructor(limit) {
    super('license_daily_limit_reached');
    this.code = 'license_daily_limit_reached';
    this.limit = limit;
  }
}

function sweep() {
  const now = Date.now();
  for (const [id, j] of jobs) if (j.expires < now) jobs.delete(id);
}

/**
 * Obtiene el "permiso" para una llamada a la IA.
 * @param {object} license   fila de licencia
 * @param {object} o
 * @param {string} [o.jobId]  job existente (llamadas 2..n)
 * @param {string} o.family   familia del trabajo ('folder' | 'invoices' | 'single')
 * @param {number} [o.calls]  presupuesto de llamadas si se crea un job nuevo
 * @param {string} [o.ip]
 * @returns {{ job: object|null, onSuccess: Function, onFailure: Function }}
 */
function acquire(license, { jobId, family, calls = 1, ip } = {}) {
  sweep();
  if (jobId) {
    const job = jobs.get(jobId);
    if (!job || job.license_id !== license.id || job.family !== family || job.calls_left <= 0) {
      const err = new Error('invalid_job');
      err.code = 'invalid_job';
      throw err;
    }
    job.calls_left--;
    if (!job.reservation) job.reservation = reserveOrThrow(license, ip);
    return bind(license, job);
  }

  const reservation = reserveOrThrow(license, ip);
  if (calls <= 1) {
    const single = { license_id: license.id, family, reservation, succeeded: false, calls_left: 0 };
    return bind(license, single, true);
  }
  const job = {
    id: crypto.randomBytes(16).toString('hex'),
    license_id: license.id,
    family,
    reservation,
    succeeded: false,
    calls_left: calls - 1,
    expires: Date.now() + JOB_TTL_MS
  };
  jobs.set(job.id, job);
  return bind(license, job);
}

function reserveOrThrow(license, ip) {
  const limit = aiQuotaForPlan(license.plan);
  const r = reserveAiSlot(license.id, limit);
  if (!r) {
    const used = countAiAnalysesToday(license.id);
    audit('AI_LICENSE_DAILY_LIMIT_REACHED', { license_id: license.id, ip, detail: `used=${used}/${limit} plan=${license.plan}` });
    throw new QuotaError(limit);
  }
  return r;
}

function bind(license, job, ephemeral = false) {
  return {
    job: ephemeral ? null : job,
    onSuccess() { job.succeeded = true; },
    onFailure() {
      if (!job.succeeded && job.reservation) {
        try { releaseAiSlot(license.id, job.reservation.day, job.reservation.slot); } catch (_) { /* no enmascarar */ }
        job.reservation = null;
      }
    }
  };
}

function quotaMessage(limit) {
  return `Has agotado tu cuota diaria de ${limit} análisis. Inténtalo de nuevo mañana o mejora tu plan para disponer de más análisis diarios.`;
}

module.exports = { acquire, QuotaError, quotaMessage, _jobs: jobs };
