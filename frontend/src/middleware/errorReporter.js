/**
 * C8 — Aviso automático de errores del frontend a un endpoint PROPIO
 * (POST /api/client-errors). Sin servicios de terceros (no hace falta Sentry
 * ni tocar la política de cookies) y SIN datos financieros del usuario: solo
 * mensaje, pila (recortada), ruta sin query, versión y navegador.
 * Deduplicado y con tope por sesión para no inundar el backend.
 */
const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';
const sent = new Set();
let count = 0;
const MAX_PER_SESSION = 10;

export function reportError(error, extra = {}) {
  try {
    const message = String(error?.message || error || 'unknown').slice(0, 500);
    const key = message.slice(0, 120);
    if (sent.has(key) || count >= MAX_PER_SESSION) return;
    sent.add(key);
    count++;
    const body = JSON.stringify({
      message,
      stack: String(error?.stack || extra.componentStack || '').slice(0, 3000),
      path: window.location.pathname,
      version: typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev'
    });
    // keepalive: el aviso sale aunque la pestaña se cierre.
    fetch(`${API_BASE}/client-errors`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true }).catch(() => {});
  } catch { /* nunca romper la app por informar */ }
}

export function installGlobalErrorHandlers() {
  window.addEventListener('error', (e) => {
    // Errores de recursos (img/script) no llevan e.error: se ignoran.
    if (e.error) reportError(e.error);
  });
  window.addEventListener('unhandledrejection', (e) => reportError(e.reason));
}
