/**
 * services/deferred.js — respuestas que tardan (IA local, 2026-10).
 *
 * Cloudflare corta una petición si el origen tarda más de 100 s y Nginx a los
 * 60 s. Con Groq o Cloudflare la IA responde en segundos, pero si caen y entra
 * la IA local del VPS un análisis puede tardar minutos. Para esas rutas:
 *
 *   - Si la respuesta llega antes de DEFER_AFTER_MS, se contesta igual que
 *     siempre (nada cambia para el navegador).
 *   - Si no, se contesta 202 { pending: "pend_…" } y el trabajo sigue en
 *     segundo plano. El navegador consulta GET /api/pending/:id hasta tener
 *     el resultado, que se devuelve con su estado HTTP original y se borra.
 *
 * Los resultados viven solo en memoria (un único proceso PM2) y caducan a los
 * 30 min. Si el servidor se reinicia, la consulta da 404 pending_not_found y el
 * usuario lo vuelve a lanzar (la cuota de un análisis fallido no se descuenta).
 */

'use strict';

const crypto = require('crypto');

const DEFER_AFTER_MS = Number(process.env.DEFER_AFTER_MS) || 25000;
const TTL_MS = 30 * 60 * 1000;
const MAX_PENDING_PER_LICENSE = 5;

const store = new Map(); // id → { licenseId, done, status, body, expires }

setInterval(() => {
  const now = Date.now();
  for (const [id, e] of store) if (e.expires < now) store.delete(id);
}, 5 * 60 * 1000).unref();

/** Ejecuta un handler con una respuesta "de mentira" que captura status + JSON. */
function capture(handler, req) {
  return new Promise((resolve, reject) => {
    const res = {
      statusCode: 200,
      status(code) { this.statusCode = code; return this; },
      json(body) { resolve({ status: this.statusCode, body }); return this; },
      set() { return this; },
      setHeader() { return this; }
    };
    Promise.resolve().then(() => handler(req, res)).catch(reject);
  });
}

/**
 * Envuelve un handler de Express (req, res) que responde con res.status().json().
 * Necesita req.license (va detrás de requireLicense).
 */
function deferrable(handler, { waitMs } = {}) {
  return async (req, res) => {
    const licenseId = req.license?.id;
    const running = [...store.values()].filter(e => e.licenseId === licenseId && !e.done).length;
    if (running >= MAX_PENDING_PER_LICENSE) {
      return res.status(429).json({ error: 'too_many_pending', message: 'Tienes varias tareas en curso. Espera a que terminen.' });
    }
    const work = capture(handler, req).catch((e) => {
      console.error('[DEFERRED] Excepción:', e.message);
      return { status: 500, body: { error: 'internal_error', message: 'Ha ocurrido un error inesperado. Inténtalo de nuevo en unos minutos.' } };
    });
    let timer;
    const late = new Promise((resolve) => { timer = setTimeout(() => resolve(null), waitMs ?? DEFER_AFTER_MS); });
    const first = await Promise.race([work, late]);
    clearTimeout(timer);
    if (first) return res.status(first.status).json(first.body);

    const id = `pend_${crypto.randomBytes(12).toString('hex')}`;
    const entry = { licenseId, done: false, status: 0, body: null, expires: Date.now() + TTL_MS };
    store.set(id, entry);
    work.then((out) => { entry.done = true; entry.status = out.status; entry.body = out.body; entry.expires = Date.now() + TTL_MS; });
    res.status(202).json({ pending: id });
  };
}

/** GET /api/pending/:id — estado de una respuesta aplazada. */
function pendingHandler(req, res) {
  const id = String(req.params.id || '');
  const entry = store.get(id);
  if (!entry || entry.licenseId !== req.license?.id) {
    return res.status(404).json({ error: 'pending_not_found', message: 'La tarea se ha interrumpido. Vuelve a lanzarla.' });
  }
  if (!entry.done) return res.status(202).json({ pending: id });
  store.delete(id);
  res.status(entry.status).json(entry.body);
}

module.exports = { deferrable, pendingHandler, DEFER_AFTER_MS, _store: store };
