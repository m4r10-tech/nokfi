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
  } else if (res.status === 413) {
    // Nginx corta cuerpos > 10 MB con HTML: lote de archivos demasiado grande.
    await res.text().catch(() => '');
    data = { error: 'payload_too_large' };
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

// Sesión 4 (F2): el navegador manda el TIPO de análisis y los DATOS; el
// backend arma el prompt (plantillas + perfil + idioma) y devuelve un informe
// estructurado (F1). `job` encadena los lotes de una misma petición (carpeta,
// facturas): 1 petición del usuario = 1 análisis de la cuota.
export const aiApi = {
  run: async (task, input, { lang, title, job } = {}) => {
    const result = await request('/ai/analyze', { method: 'POST', auth: true, body: { task, input, lang, title, job } });
    const quotaExceeded = ['ai_quota_exceeded', 'license_daily_limit_reached'].includes(result.data?.error);
    return { ...result, quotaExceeded };
  }
};

// C2 — tareas del plan de acción (marcables, persistentes por licencia).
export const actionsApi = {
  list: () => request('/actions', { auth: true }),
  setDone: (id, done) => request(`/actions/${encodeURIComponent(id)}`, { method: 'PATCH', auth: true, body: { done } })
};

// C5 — asistente (modelos gratuitos, no gasta cuota; no se guarda la conversación).
export const chatApi = {
  send: (messages, { analysisId, lang } = {}) =>
    request('/chat', { method: 'POST', auth: true, body: { messages, analysis_id: analysisId, lang } })
};

// Núcleo de valor (sesión 4): V1 libro, V2 impuestos, V4 cobros, V5 fugas,
// V3 previsión, C4 calendario y el resumen del panel.
const qs = (o) => {
  const p = new URLSearchParams();
  Object.entries(o || {}).forEach(([k, v]) => { if (v !== undefined && v !== null && v !== '') p.set(k, v); });
  const s = p.toString();
  return s ? `?${s}` : '';
};
export const ledgerApi = {
  list: (filters) => request(`/ledger${qs(filters)}`, { auth: true }),
  create: (entries, force = false) => request('/ledger', { method: 'POST', auth: true, body: { entries, force } }),
  update: (id, partial) => request(`/ledger/${encodeURIComponent(id)}`, { method: 'PATCH', auth: true, body: partial }),
  remove: (id) => request(`/ledger/${encodeURIComponent(id)}`, { method: 'DELETE', auth: true })
};
export const financeApi = {
  taxes: (year, quarter) => request(`/finance/taxes${qs({ year, quarter })}`, { auth: true }),
  setReserve: (year, quarter, amount) => request('/finance/reserve', { method: 'PUT', auth: true, body: { year, quarter, amount } }),
  receivables: () => request('/finance/receivables', { auth: true }),
  collectionEmail: (entry_id, tone, lang) => request('/finance/collection-email', { method: 'POST', auth: true, body: { entry_id, tone, lang } }),
  leaks: () => request('/finance/leaks', { auth: true }),
  dismissLeak: (party_key, party_name) => request('/finance/leaks/dismiss', { method: 'POST', auth: true, body: { party_key, party_name } }),
  restoreLeak: (party_key) => request('/finance/leaks/dismiss', { method: 'DELETE', auth: true, body: { party_key } }),
  forecast: (params) => request(`/finance/forecast${qs(params)}`, { auth: true }),
  calendar: (year) => request(`/finance/calendar${qs({ year })}`, { auth: true }),
  benchmark: () => request('/finance/benchmark', { auth: true })
};
export const dashboardApi = { get: () => request('/dashboard', { auth: true }) };

/** Descarga un archivo con la sesión (PDF de una factura). Devuelve { ok, status, data? }. */
async function download(path, fallbackName) {
  let res;
  try {
    res = await fetch(`${API_BASE}${path}`, { headers: sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {} });
  } catch {
    return { ok: false, status: 0, data: { error: 'network_error' } };
  }
  if (!res.ok) {
    const data = (res.headers.get('content-type') || '').includes('application/json') ? await res.json().catch(() => ({})) : {};
    return { ok: false, status: res.status, data };
  }
  const blob = await res.blob();
  const name = (res.headers.get('content-disposition') || '').match(/filename="([^"]+)"/)?.[1] || fallbackName;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  return { ok: true, status: res.status };
}

/* ── Sesión 11: emisión de facturas ── */
export const invoicingApi = {
  settings: () => request('/invoicing/settings', { auth: true }),
  saveSettings: (data) => request('/invoicing/settings', { method: 'PUT', auth: true, body: data }),
  customers: (q) => request(`/invoicing/customers${qs({ q })}`, { auth: true }),
  createCustomer: (data) => request('/invoicing/customers', { method: 'POST', auth: true, body: data }),
  updateCustomer: (id, data) => request(`/invoicing/customers/${encodeURIComponent(id)}`, { method: 'PATCH', auth: true, body: data }),
  removeCustomer: (id) => request(`/invoicing/customers/${encodeURIComponent(id)}`, { method: 'DELETE', auth: true }),
  list: (filters) => request(`/invoicing/invoices${qs(filters)}`, { auth: true }),
  get: (id) => request(`/invoicing/invoices/${encodeURIComponent(id)}`, { auth: true }),
  issue: (data) => request('/invoicing/invoices', { method: 'POST', auth: true, body: data }),
  cancel: (id, reason) => request(`/invoicing/invoices/${encodeURIComponent(id)}/cancel`, { method: 'POST', auth: true, body: { reason } }),
  send: (id, data) => request(`/invoicing/invoices/${encodeURIComponent(id)}/send`, { method: 'POST', auth: true, body: data }),
  pdf: (id, number) => download(`/invoicing/invoices/${encodeURIComponent(id)}/pdf`, `factura_${number || id}.pdf`)
};

// F4 — claves de API; C9 — mis datos (descargar / borrar la cuenta).
export const keysApi = {
  list: () => request('/keys', { auth: true }),
  summary: () => request('/keys/summary', { auth: true }),
  create: (name, { mode = 'live', client = '' } = {}) => request('/keys', { method: 'POST', auth: true, body: { name, mode, client } }),
  setClient: (id, client) => request(`/keys/${encodeURIComponent(id)}`, { method: 'PATCH', auth: true, body: { client } }),
  revoke: (id) => request(`/keys/${encodeURIComponent(id)}`, { method: 'DELETE', auth: true })
};
// Sesión 9 — panel de Desarrolladores (webhooks, registro, clientes, Playground).
export const devApi = {
  webhooks: () => request('/dev/webhooks', { auth: true }),
  createWebhook: (body) => request('/dev/webhooks', { method: 'POST', auth: true, body }),
  updateWebhook: (id, body) => request(`/dev/webhooks/${encodeURIComponent(id)}`, { method: 'PATCH', auth: true, body }),
  deleteWebhook: (id) => request(`/dev/webhooks/${encodeURIComponent(id)}`, { method: 'DELETE', auth: true }),
  secret: (id) => request(`/dev/webhooks/${encodeURIComponent(id)}/secret`, { auth: true }),
  rotateSecret: (id) => request(`/dev/webhooks/${encodeURIComponent(id)}/rotate-secret`, { method: 'POST', auth: true }),
  testWebhook: (id) => request(`/dev/webhooks/${encodeURIComponent(id)}/test`, { method: 'POST', auth: true }),
  deliveries: (params) => request(`/dev/deliveries${qs(params)}`, { auth: true }),
  resend: (id) => request(`/dev/deliveries/${encodeURIComponent(id)}/resend`, { method: 'POST', auth: true }),
  calls: (params) => request(`/dev/calls${qs(params)}`, { auth: true }),
  clients: () => request('/dev/clients', { auth: true }),
  playground: (body) => request('/dev/playground', { method: 'POST', auth: true, body })
};
export const shareApi = {
  list: () => request('/share', { auth: true }),
  create: (label, days) => request('/share', { method: 'POST', auth: true, body: { label, days } }),
  revoke: (id) => request(`/share/${encodeURIComponent(id)}`, { method: 'DELETE', auth: true }),
  // Vista pública: el token del enlace es la credencial (sin sesión).
  view: (token, year) => request(`/shared/${encodeURIComponent(token)}${qs({ year })}`)
};
export const meApi = {
  export: () => request('/me/export', { auth: true }),
  remove: (password) => request('/me', { method: 'DELETE', auth: true, body: { password } })
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
  // locale (sesión 4): Checkout de Stripe en el idioma de la web.
  stripeCheckout: (email, plan, locale) => request('/payments/stripe/create-checkout', { method: 'POST', body: { email, plan, locale } }),
  // Customer Portal de Stripe: cancelar / mejorar plan / actualizar método de pago.
  stripePortal: (locale) => request('/payments/stripe/create-portal-session', { method: 'POST', auth: true, body: { locale } }),
  reveal: (session_id) => request('/payments/stripe/reveal?session_id=' + encodeURIComponent(session_id))
};

export default request;
