/**
 * middleware/api.js
 *
 * Único punto de comunicación con el backend. Ningún componente debe
 * usar fetch() directamente. Sigue el contrato de nokfi_api_contract.md.
 */

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

let sessionToken = null;
let onSessionExpired = null;

export function setSessionExpiredHandler(fn) { onSessionExpired = fn; }
export function setSessionToken(token) { sessionToken = token; }
export function getSessionToken() { return sessionToken; }

async function request(path, { method = 'GET', body, auth = false, isFormData = false } = {}) {
  const headers = {};
  if (!isFormData) headers['Content-Type'] = 'application/json';
  if (auth && sessionToken) headers['Authorization'] = `Bearer ${sessionToken}`;

  let res;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      body: body ? (isFormData ? body : JSON.stringify(body)) : undefined
    });
  } catch {
    return { ok: false, status: 0, data: { error: 'network_error', message: 'No se pudo conectar con el servidor.' } };
  }

  let data = {};
  try { data = await res.json(); } catch { /* respuestas vacías, ej. 204 */ }

  const sessionErrors = ['session_invalid', 'auth_required', 'license_not_found'];
  if (auth && res.status === 401 && sessionErrors.includes(data.error)) {
    sessionToken = null;
    if (onSessionExpired) onSessionExpired(data.error);
  }

  return { ok: res.ok, status: res.status, data };
}

export const authApi = {
  activate: (email, license_key, password, device_name) =>
    request('/auth/activate', { method: 'POST', body: { email, license_key, password, device_name } }),
  login: (email, license_key, password) =>
    request('/auth/login', { method: 'POST', body: { email, license_key, password } }),
  verify: () => request('/auth/verify', { method: 'POST', auth: true }),
  logout: () => request('/auth/logout', { method: 'POST', auth: true }),
  requestPasswordReset: (email, license_key) =>
    request('/auth/request-password-reset', { method: 'POST', body: { email, license_key } }),
  confirmPasswordReset: (token, new_password, device_name) =>
    request('/auth/confirm-password-reset', { method: 'POST', body: { token, new_password, device_name } }),
  revealKey: (password) => request('/auth/reveal-key', { method: 'POST', auth: true, body: { password } }),
  changePassword: (current_password, new_password) =>
    request('/auth/change-password', { method: 'POST', auth: true, body: { current_password, new_password } })
};

export const aiApi = {
  analyze: async (prompt, max_tokens) => {
    const result = await request('/proxy/ai', { method: 'POST', auth: true, body: { prompt, max_tokens } });
    // ⚠️ Auditoría de seguridad: además del límite global de Gemini, el backend
    // ahora aplica un límite diario POR LICENCIA (license_daily_limit_reached)
    // para proteger la cuota compartida de un solo cliente con uso intensivo.
    const quotaExceeded = ['ai_quota_exceeded', 'license_daily_limit_reached'].includes(result.data?.error);
    return { ...result, quotaExceeded };
  }
};

export const paymentsApi = {
  // Suscripción mensual (Fase 3) — solo Stripe para recurring.
  stripeCheckout: (email, plan) => request('/payments/stripe/create-checkout', { method: 'POST', body: { email, plan } }),
  // Customer Portal de Stripe: cancelar / mejorar plan / actualizar método de pago.
  stripePortal: () => request('/payments/stripe/create-portal-session', { method: 'POST', auth: true }),
  reveal: (session_id) => request('/payments/stripe/reveal?session_id=' + encodeURIComponent(session_id))
};

export default request;
