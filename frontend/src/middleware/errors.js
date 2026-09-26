/**
 * middleware/errors.js — Tanda E (sesión 3): mapa central código → mensaje.
 *
 * El backend responde `{ error: '<código>', message: '<texto en español>' }`.
 * Antes cada pantalla caía a `common.error` ("Ha ocurrido un error") o pintaba
 * el `message` crudo (siempre en español, aunque la app estuviera en inglés).
 * Ahora: si el código es conocido → mensaje humano i18n (`errors.<código>`),
 * con acción sugerida. Si no, 5xx → "el servidor no responde"; si no, el
 * `message` del backend; y como último recurso el fallback de la pantalla.
 *
 * Los códigos AMBIGUOS por pantalla (p.ej. `not_found`, `invalid_credentials`)
 * NO van aquí: cada pantalla los trata antes con su copy concreto.
 */
const KNOWN = [
  'network_error', 'non_json_response', 'session_invalid', 'license_inactive',
  'otp_limit_reached', 'reset_limit_reached', 'rate_limited',
  'ai_quota_exceeded', 'license_daily_limit_reached', 'ai_provider_error',
  'ai_empty_response', 'ai_not_configured', 'prompt_too_long',
  'stripe_not_configured', 'stripe_error', 'invalid_plan', 'internal_error',
  'invalid_email', 'invalid_key_format',
  // Sesión 4
  'client_outdated', 'invalid_job', 'ai_bad_output', 'invalid_input', 'chat_rate_limited', 'chat_unavailable',
  'api_plan_required', 'subscription_active', 'payload_too_large'
];

export function apiErrorMessage(t, result, fallbackKey = 'common.error') {
  const data = result?.data || {};
  const code = data.error;
  if (code && KNOWN.includes(code)) return t(`errors.${code}`);
  if (result?.status >= 500) return t('errors.server');
  if (data.message) return data.message;
  return t(fallbackKey);
}

/** ¿Es un fallo de conectividad/servidor (merece estado "sin conexión" + reintento)? */
export function isConnectivityError(result) {
  const code = result?.data?.error;
  return code === 'network_error' || code === 'non_json_response' || result?.status >= 500;
}
