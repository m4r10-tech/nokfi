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

module.exports = { fetchWithTimeout, DEFAULT_TIMEOUT_MS };
