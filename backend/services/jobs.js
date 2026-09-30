/**
 * services/jobs.js — sesión 9 (API, Bloque 2): trabajos asíncronos.
 *
 *   ?async=true  o  Prefer: respond-async   →  202 { id: "job_…", status: "queued" }
 *   GET /api/v1/jobs/:id                    →  estado y, al terminar, el resultado
 *
 * La entrada (facturas, filas…) vive SOLO en memoria mientras se procesa: en
 * la BD queda el estado y el resultado, que se borra a las 24 h. Si el
 * proceso se reinicia con trabajos a medias, se marcan como fallidos
 * (server_restarted) y se avisa con job.failed: el cliente lo relanza con
 * una Idempotency-Key nueva.
 *
 * Cola en memoria: 3 trabajos a la vez en total y 2 por licencia.
 */

'use strict';

const crypto = require('crypto');
const { getDB } = require('../db/database');
const webhooks = require('./webhooks');

const MAX_RUNNING = 3;
const MAX_PER_LICENSE = 2;
const KINDS = ['analyze', 'invoices.extract'];

const queue = [];          // [{ id, license_id, run }]
const running = new Map(); // id → license_id
const done = new Map();    // id → Promise (tests)

function publicJob(row) {
  if (!row) return null;
  const finished = row.status === 'succeeded' || row.status === 'failed';
  return {
    id: row.id,
    object: 'job',
    kind: row.kind,
    status: row.status,
    livemode: !!row.livemode,
    created_at: row.created_at,
    finished_at: row.finished_at,
    result: row.status === 'succeeded' && row.result_json ? JSON.parse(row.result_json) : null,
    result_expired: row.status === 'succeeded' && !row.result_json,
    error: row.status === 'failed' ? { code: row.error_code, message: row.error_message } : null,
    ...(finished ? {} : { poll_after_seconds: 3 })
  };
}

function getJob(license_id, id) {
  return publicJob(getDB().prepare('SELECT * FROM api_jobs WHERE id = ? AND license_id = ?').get(String(id), license_id));
}

function listJobs(license_id, limit = 20) {
  const n = Math.min(Math.max(Number(limit) || 20, 1), 100);
  return getDB().prepare('SELECT * FROM api_jobs WHERE license_id = ? ORDER BY created_at DESC, rowid DESC LIMIT ?').all(license_id, n)
    .map(r => { const j = publicJob(r); delete j.result; return j; });
}

/**
 * Encola un trabajo. `run` es una función async que devuelve { status, body }
 * (la misma que usa la ruta síncrona).
 */
function createJob({ license, keyId = null, kind, livemode = true, run }) {
  if (!KINDS.includes(kind)) throw new Error(`kind desconocido: ${kind}`);
  const id = 'job_' + crypto.randomBytes(12).toString('hex');
  getDB().prepare('INSERT INTO api_jobs (id, license_id, key_id, kind, livemode) VALUES (?, ?, ?, ?, ?)')
    .run(id, license.id, keyId, kind, livemode ? 1 : 0);
  let resolveDone;
  done.set(id, new Promise(r => { resolveDone = r; }));
  queue.push({ id, license_id: license.id, livemode, kind, run, resolveDone });
  setImmediate(pump);
  return getJob(license.id, id);
}

function pump() {
  while (running.size < MAX_RUNNING) {
    const perLicense = (lid) => [...running.values()].filter(x => x === lid).length;
    const i = queue.findIndex(j => perLicense(j.license_id) < MAX_PER_LICENSE);
    if (i < 0) return;
    const job = queue.splice(i, 1)[0];
    running.set(job.id, job.license_id);
    execute(job).finally(() => {
      running.delete(job.id);
      job.resolveDone();
      setTimeout(() => done.delete(job.id), 60000).unref();
      setImmediate(pump);
    });
  }
}

async function execute(job) {
  const db = getDB();
  db.prepare("UPDATE api_jobs SET status = 'running' WHERE id = ?").run(job.id);
  let out;
  try {
    out = await job.run();
  } catch (e) {
    console.error('[JOBS] excepción:', e.message);
    out = { status: 500, body: { error: 'internal_error', message: 'Ha ocurrido un error inesperado. Inténtalo de nuevo en unos minutos.' } };
  }
  const opts = { livemode: job.livemode };
  if (out.status === 200) {
    db.prepare("UPDATE api_jobs SET status = 'succeeded', result_json = ?, finished_at = datetime('now') WHERE id = ?")
      .run(JSON.stringify(out.body), job.id);
    webhooks.emit(job.license_id, 'job.completed', { job_id: job.id, kind: job.kind, status: 'succeeded', result: out.body }, opts);
  } else {
    const code = String(out.body?.error || 'job_failed').slice(0, 60);
    const message = String(out.body?.message || '').slice(0, 300);
    db.prepare("UPDATE api_jobs SET status = 'failed', error_code = ?, error_message = ?, finished_at = datetime('now') WHERE id = ?")
      .run(code, message, job.id);
    webhooks.emit(job.license_id, 'job.failed', { job_id: job.id, kind: job.kind, status: 'failed', error: { code, message, http_status: out.status } }, opts);
  }
}

/** Espera a que termine un trabajo (tests). */
function waitFor(id) { return done.get(id) || Promise.resolve(); }

/** Al arrancar: los trabajos que quedaron a medias ya no pueden terminar. */
function failInterruptedJobs() {
  const db = getDB();
  const rows = db.prepare("SELECT id, license_id, kind, livemode FROM api_jobs WHERE status IN ('queued', 'running')").all();
  const message = 'El servidor se reinició mientras se procesaba el trabajo. Vuelve a lanzarlo.';
  for (const r of rows) {
    db.prepare("UPDATE api_jobs SET status = 'failed', error_code = 'server_restarted', error_message = ?, finished_at = datetime('now') WHERE id = ?").run(message, r.id);
    webhooks.emit(r.license_id, 'job.failed', { job_id: r.id, kind: r.kind, status: 'failed', error: { code: 'server_restarted', message, http_status: 503 } }, { livemode: !!r.livemode });
  }
  return rows.length;
}

module.exports = { createJob, getJob, listJobs, waitFor, failInterruptedJobs, KINDS };
