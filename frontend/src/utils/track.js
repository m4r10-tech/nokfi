/**
 * Eventos de la web pública (sesión 12): POST /api/events con sendBeacon.
 * Sin cookies ni identificadores: el backend solo suma por día, evento y
 * ruta (services/webEvents.js). Nunca falla ni bloquea la navegación.
 * Eventos: cta_trial (clic en «Probar gratis»), checkout_start (se va a
 * Stripe) y tool_use (primer uso de una herramienta pública).
 */
const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

export function track(name) {
  try {
    const body = JSON.stringify({ name, path: window.location.pathname });
    const url = `${API_BASE}/events`;
    if (navigator.sendBeacon?.(url, new Blob([body], { type: 'application/json' }))) return;
    fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true }).catch(() => {});
  } catch { /* sin red o bloqueado: no pasa nada */ }
}
