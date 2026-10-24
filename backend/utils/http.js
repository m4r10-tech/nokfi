/**
 * utils/http.js
 *
 * fetch con TIMEOUT para llamadas salientes a servicios externos (Gemini,
 * Stripe). Sin él, un proveedor que acepta la conexión pero nunca responde
 * deja el request de Express colgado INDEFINIDAMENTE: el socket queda abierto,
 * el usuario no recibe respuesta y, en el caso de /api/proxy/ai, el slot de
 * cuota diaria (ai_usage) queda reservado hasta que el proceso muera.
 *
 * AbortSignal.timeout(ms) (Node 18+) aborta el fetch al vencer el plazo; el
 * caller lo captura como cualquier otro error de red (su catch ya libera la
 * cuota / responde 5xx). El timeout es de socket inactivo+total de la petición:
 * suficiente para una respuesta de IA larga (60s) sin permitir cuelgues.
 *
 * Los tests e2e stubbean global.fetch con funciones de 0 argumentos; esta
 * capa solo AÑADE la señal a las options, sin cambiar la forma de llamar.
 */

'use strict';

const DEFAULT_TIMEOUT_MS = 60000; // 60s — generoso para IA, corto para cuelgues

function fetchWithTimeout(url, options = {}, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const ms = Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : DEFAULT_TIMEOUT_MS;
  return fetch(url, { ...options, signal: AbortSignal.timeout(ms) });
}

/**
 * Petición HTTP larga (IA local, 2026-10). El fetch de Node (undici) corta solo
 * cualquier respuesta que tarde más de 300 s en empezar, y la IA local en CPU
 * puede tardar más en leer un prompt grande. Esto usa node:http, sin ese límite:
 * el único tope es timeoutMs. Devuelve un objeto con la forma de una Response de
 * fetch (ok, status, json(), text()) para que el código que lo usa no cambie.
 */
function requestLong(url, { method = 'GET', headers = {}, body } = {}, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const u = new URL(url);
  const lib = u.protocol === 'https:' ? require('https') : require('http');
  return new Promise((resolve, reject) => {
    const req = lib.request(u, { method, headers: body ? { ...headers, 'Content-Length': Buffer.byteLength(body) } : headers }, (res) => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        resolve({
          ok: res.statusCode >= 200 && res.statusCode < 300,
          status: res.statusCode,
          text: async () => text,
          json: async () => JSON.parse(text)
        });
      });
      res.on('error', reject);
    });
    req.setTimeout(timeoutMs, () => req.destroy(new Error(`timeout ${Math.round(timeoutMs / 1000)} s`)));
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

module.exports = { fetchWithTimeout, requestLong, DEFAULT_TIMEOUT_MS };
