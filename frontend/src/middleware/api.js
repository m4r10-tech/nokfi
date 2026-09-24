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

  // #8 (sesión 2): no parsear como JSON lo que no lo es. Si el backend (o un
  // intermediario) devuelve HTML — 502 de Cloudflare, error de nginx — res.json()
  // lanzaba y el catch lo tragaba como data={}, dejando estados de UI confusos
  // (éxito vacío). Ahora se mira el content-type y se devuelve un error claro.
  let data = {};
  const contentType = res.headers.get('content-type') || '';
  if (res.status === 204) {
    data = {};
  } else if (contentType.includes('application/json')) {
    try { data = await res.json(); } catch { data = {}; /* JSON malformado */ }
  } else {
    await res.text().catch(() => ''); // drenar el body
    data = { error: 'non_json_response', message: 'El servidor no respondió correctamente. Inténtalo de nuevo en unos minutos.' };
  }

  // #10 (sesión 2): añadidos no_token y license_inactive, y se acepta también
  // 403 (verify devuelve 403 license_inactive) — antes esos códigos caían en
  // mensajes genéricos en vez de cerrar la sesión con el motivo correcto.
  const sessionErrors = ['session_invalid', 'auth_required', 'license_not_found', 'no_token', 'license_inactive'];
  if (auth && (res.status === 401 || res.status === 403) && sessionErrors.includes(data.error)) {
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
  // Recuperación de acceso con OTP (olvido de clave y/o contraseña) — página /recuperar
  requestRecovery: (email) =>
    request('/auth/request-recovery', { method: 'POST', body: { email } }),
  verifyRecoveryOtp: (email, code) =>
    request('/auth/verify-recovery-otp', { method: 'POST', body: { email, code } }),
  resendRecoveredKeys: (recovery_token) =>
    request('/auth/resend-recovered-keys', { method: 'POST', body: { recovery_token } }),
  confirmRecovery: (recovery_token, license_key, new_password, device_name) =>
    request('/auth/confirm-recovery', { method: 'POST', body: { recovery_token, license_key, new_password, device_name } }),
  revealKey: (password) => request('/auth/reveal-key', { method: 'POST', auth: true, body: { password } }),
  changePassword: (current_password, new_password) =>
    request('/auth/change-password', { method: 'POST', auth: true, body: { current_password, new_password } })
};

export const aiApi = {
  analyze: async (prompt, max_tokens, { kind, title } = {}) => {
    // kind/title son etiquetas opcionales que el backend persiste para etiquetar
    // el historial del análisis (sección 14 — pantallas Historial / Informes).
    // ExcelSubModule pasa su `title` de subapartado; Cuestionario pasa kind.
    const result = await request('/proxy/ai', { method: 'POST', auth: true, body: { prompt, max_tokens, kind, title } });
    // ⚠️ Auditoría de seguridad: además del límite global de Gemini, el backend
    // ahora aplica un límite diario POR LICENCIA (license_daily_limit_reached)
    // para proteger la cuota compartida de un solo cliente con uso intensivo.
    const quotaExceeded = ['ai_quota_exceeded', 'license_daily_limit_reached'].includes(result.data?.error);
    return { ...result, quotaExceeded };
  }
};

// Historial de análisis (G2 — sección 14). El backend scopea todo por la
// licencia de la sesión (Bearer); el frontend no envía license_id.
export const analysesApi = {
  list: () => request('/analyses', { auth: true }),
  get: (id) => request(`/analyses/${encodeURIComponent(id)}`, { auth: true })
};

// Perfil de empresa del onboarding (G-a — sección 14). El backend scopea por
// la licencia de la sesión (PUT/GET no aceptan license_id en el body). El hook
// useCompanyProfile.js es el único consumidor (vía DashboardLayout).
export const profileApi = {
  get: () => request('/profile', { auth: true }),
  put: (partial) => request('/profile', { method: 'PUT', auth: true, body: partial })
};

export const paymentsApi = {
  // Catálogo público de planes (precio, cuota, trial) — fuente única del frontend
  // para que SIEMPRE muestre lo que Stripe cobra (anti-drift vs .env del backend).
  getPlans: () => request('/payments/plans'),
  // Suscripción mensual (Fase 3) — solo Stripe para recurring.
  stripeCheckout: (email, plan) => request('/payments/stripe/create-checkout', { method: 'POST', body: { email, plan } }),
  // Customer Portal de Stripe: cancelar / mejorar plan / actualizar método de pago.
  stripePortal: () => request('/payments/stripe/create-portal-session', { method: 'POST', auth: true }),
  reveal: (session_id) => request('/payments/stripe/reveal?session_id=' + encodeURIComponent(session_id))
};

export default request;
