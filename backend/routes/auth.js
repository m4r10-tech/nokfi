/**
 * routes/auth.js
 *
 * Modelo de login (Fase 2 — fingerprint → contraseña): Email + Clave
 * (XXXX-XXXX-XXXX-XXXX) + Contraseña (scrypt). El anti-sharing que aportaba
 * el device-fingerprint se delega en la cuota diaria de IA por licencia.
 *
 * Endpoints:
 *   POST /api/auth/activate              → primer login: setea la contraseña elegida
 *   POST /api/auth/login                 → login con contraseña ya seteada
 *   POST /api/auth/verify                → comprobar si un token sigue siendo válido
 *   POST /api/auth/logout                → cerrar sesión actual
 *   POST /api/auth/request-password-reset → solicitar token de reset (envía email)
 *   POST /api/auth/confirm-password-reset → confirmar reset con el token + nueva contraseña
 *   POST /api/auth/request-recovery       → recuperación por email: envía OTP de 6 dígitos
 *   POST /api/auth/verify-recovery-otp    → verifica el OTP y revela las claves + recovery_token
 *   POST /api/auth/resend-recovered-keys  → reenvía las claves por email (recovery_token vivo)
 *   POST /api/auth/confirm-recovery       → cambio de contraseña opcional tras el OTP
 *   POST /api/auth/reveal-key            → (auth) revelar la clave sabiendo la contraseña
 *   POST /api/auth/change-password       → (auth) cambiar la contraseña
 */

'use strict';

const express = require('express');
const router = express.Router();

const {
  getLicenseByEmailAndKey,
  getLicenseById,
  setPasswordHash,
  canResetPassword,
  markPasswordReset,
  createSession,
  getSession,
  deleteSession,
  createResetToken,
  consumeResetToken,
  peekResetToken,
  createOtp,
  verifyOtp,
  logAuthRequest,
  countAuthRequests,
  getActiveLicensesByEmail,
  OTP_MAX_PER_HOUR,
  OTP_MAX_PER_DAY,
  RESET_MAX_PER_HOUR,
  audit
} = require('../db/database');

const { hashPassword, verifyPassword, isPasswordSet } = require('../utils/password');

const { sanitizeFreeText } = require('../utils/sanitize'); // antes definido aquí abajo
const { sendPasswordResetEmail, sendPasswordResetLimitEmail, sendRecoveryOtpEmail, sendRecoveredKeysEmail } = require('../utils/mailer');
const { aiQuotaForPlan } = require('../db/database');

const KEY_REGEX = /^[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{4}$/i;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 256;

/** Validaciones de longitud/formato comunes a todos los puntos donde llega una contraseña. */
function validatePassword(plain) {
  if (typeof plain !== 'string' || plain.length < MIN_PASSWORD_LENGTH) {
    return { ok: false, status: 400, body: { error: 'weak_password', message: `La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres.` } };
  }
  if (plain.length > MAX_PASSWORD_LENGTH) {
    return { ok: false, status: 400, body: { error: 'weak_password', message: 'La contraseña es demasiado larga.' } };
  }
  return { ok: true };
}

/**
 * Sanitización defensiva de texto libre (device_name viaja al frontend como
 * texto y a emails ya escapados). Mismo razonamiento que antes.
 */
/* ──────────────────────────────────────────────────────────
   Helper interno: valida email + clave (sin fingerprint).
   Devuelve { email, license_key, password, device_name } o { error }.
────────────────────────────────────────────────────────── */
function validateCredentials(body) {
  const email = (body.email || '').trim().toLowerCase();
  const license_key = (body.license_key || '').trim().toUpperCase();
  const password = body.password;
  const device_name = sanitizeFreeText(body.device_name || '').slice(0, 120);

  if (!email || !EMAIL_REGEX.test(email)) {
    return { error: { status: 400, body: { error: 'invalid_email', message: 'Email no válido.' } } };
  }
  if (!license_key || !KEY_REGEX.test(license_key)) {
    return { error: { status: 400, body: { error: 'invalid_key_format', message: 'Formato de clave inválido. Usa XXXX-XXXX-XXXX-XXXX.' } } };
  }
  const pwdCheck = validatePassword(password);
  if (!pwdCheck.ok) return { error: pwdCheck };
  return { email, license_key, password, device_name };
}

/* ──────────────────────────────────────────────────────────
   POST /api/auth/activate
   Primer login: la licencia aún no tiene contraseña. El usuario la elige aquí.
   Body: { email, license_key, password, device_name? }
────────────────────────────────────────────────────────── */
router.post('/activate', (req, res) => {
  const parsed = validateCredentials(req.body || {});
  if (parsed.error) return res.status(parsed.error.status).json(parsed.error.body);

  const { email, license_key, password, device_name } = parsed;
  const ip = req.ip;
  const license = getLicenseByEmailAndKey(email, license_key);

  if (!license) {
    audit('ACTIVATION_FAILED_NOT_FOUND', { ip, detail: `email=${email}` });
    return res.status(404).json({ error: 'not_found', message: 'Email o clave de licencia incorrectos.' });
  }

  if (license.status !== 'active') {
    audit('ACTIVATION_FAILED_INACTIVE', { license_id: license.id, ip, detail: `status=${license.status}` });
    const message = license.status === 'revoked'
      ? 'Esta licencia ha sido revocada.'
      : 'Esta licencia está suspendida. Contacta con soporte.';
    return res.status(403).json({ error: 'license_inactive', message });
  }

  // Si ya tiene contraseña, esto no es una activación — debe usar /login
  if (isPasswordSet(license)) {
    audit('ACTIVATION_FAILED_PASSWORD_ALREADY_SET', { license_id: license.id, ip });
    return res.status(409).json({
      error: 'already_activated',
      message: 'Esta licencia ya tiene una contraseña. Usa la opción de iniciar sesión, o restablece la contraseña si la has olvidado.'
    });
  }

  // Seteo inicial de contraseña
  setPasswordHash(license.id, hashPassword(password), device_name || '');
  const { token, expires_at } = createSession(license.id, ip);

  audit('ACTIVATION_SUCCESS', { license_id: license.id, ip, detail: `device_name=${device_name || ''}` });

  const updatedLicense = getLicenseById(license.id);
  res.status(201).json({ success: true, token, expires_at, license: publicLicenseView(updatedLicense) });
});

/* ──────────────────────────────────────────────────────────
   POST /api/auth/login
   Login con contraseña ya seteada.
   Body: { email, license_key, password }
────────────────────────────────────────────────────────── */
router.post('/login', (req, res) => {
  // Validamos email+key; la contraseña la validamos suavemente (solo longitud mínima)
  // para no filtrar si la cuenta existe antes de la verificación.
  const email = (req.body?.email || '').trim().toLowerCase();
  const license_key = (req.body?.license_key || '').trim().toUpperCase();
  const password = req.body?.password;

  if (!email || !EMAIL_REGEX.test(email) || !license_key || !KEY_REGEX.test(license_key) || typeof password !== 'string' || password.length === 0) {
    return res.status(400).json({ error: 'invalid_input', message: 'Email, clave o contraseña inválidos.' });
  }

  const ip = req.ip;
  const license = getLicenseByEmailAndKey(email, license_key);

  if (!license) {
    audit('LOGIN_FAILED_NOT_FOUND', { ip, detail: `email=${email}` });
    return res.status(401).json({ error: 'invalid_credentials', message: 'Email, clave o contraseña incorrectos.' });
  }

  if (license.status !== 'active') {
    audit('LOGIN_FAILED_INACTIVE', { license_id: license.id, ip, detail: `status=${license.status}` });
    // Mensaje genérico para no revelar que SÍ existe la cuenta pero está inactiva vía credenciales.
    return res.status(401).json({ error: 'invalid_credentials', message: 'Email, clave o contraseña incorrectos.' });
  }

  // Licencia migrada sin contraseña, o nunca activada → invita a activar.
  // #15 (sesión 2) — decisión deliberada: este 409 es un mini-oráculo (delata
  // que el par email+clave existe pero sin contraseña), pero se MANTIENE porque
  // en este punto el caller ya demostró conocer el par válido — la única info
  // nueva es "no hay contraseña puesta", que es justo lo que el usuario legítimo
  // necesita para entrar por el flujo de activación. Cambiarlo a 401 genérico
  // dejaría a esos usuarios sin camino de recuperación usable.
  if (!isPasswordSet(license)) {
    audit('LOGIN_FAILED_NOT_ACTIVATED', { license_id: license.id, ip });
    return res.status(409).json({
      error: 'not_activated',
      message: 'Esta licencia aún no tiene contraseña. Usa la opción de activación inicial.'
    });
  }

  if (!verifyPassword(password, license.password_hash)) {
    audit('LOGIN_FAILED_WRONG_PASSWORD', { license_id: license.id, ip });
    return res.status(401).json({ error: 'invalid_credentials', message: 'Email, clave o contraseña incorrectos.' });
  }

  const { token, expires_at } = createSession(license.id, ip);
  audit('LOGIN_SUCCESS', { license_id: license.id, ip });

  res.json({ success: true, token, expires_at, license: publicLicenseView(license) });
});

/* ──────────────────────────────────────────────────────────
   POST /api/auth/verify
   Header: Authorization: Bearer <token>
────────────────────────────────────────────────────────── */
router.post('/verify', (req, res) => {
  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;

  if (!token) return res.status(401).json({ valid: false, error: 'no_token' });

  const session = getSession(token);
  if (!session) return res.status(401).json({ valid: false, error: 'session_invalid' });

  const license = getLicenseById(session.license_id);
  if (!license || license.status !== 'active') {
    return res.status(403).json({ valid: false, error: 'license_inactive' });
  }

  res.json({ valid: true, license: publicLicenseView(license) });
});

/* ──────────────────────────────────────────────────────────
   POST /api/auth/logout
   Header: Authorization: Bearer <token>
────────────────────────────────────────────────────────── */
router.post('/logout', (req, res) => {
  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;

  if (!token) return res.status(400).json({ error: 'no_token' });

  const session = getSession(token);
  if (session) {
    deleteSession(token);
    audit('LOGOUT', { license_id: session.license_id, ip: req.ip });
  }

  res.json({ success: true });
});

/* ──────────────────────────────────────────────────────────
   POST /api/auth/reveal-key  (auth: Bearer)
   Revela la clave de licencia tras re-introducir la contraseña.
   Body: { password }
────────────────────────────────────────────────────────── */
router.post('/reveal-key', (req, res) => {
  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
  if (!token) return res.status(401).json({ error: 'auth_required' });

  const session = getSession(token);
  if (!session) return res.status(401).json({ error: 'session_invalid' });

  const license = getLicenseById(session.license_id);
  if (!license || license.status !== 'active') {
    return res.status(403).json({ error: 'license_inactive' });
  }
  if (!isPasswordSet(license)) {
    return res.status(409).json({ error: 'not_activated' });
  }

  const password = req.body?.password;
  if (!verifyPassword(typeof password === 'string' ? password : '', license.password_hash)) {
    audit('REVEAL_KEY_FAILED', { license_id: license.id, ip: req.ip });
    return res.status(401).json({ error: 'invalid_credentials' });
  }

  audit('REVEAL_KEY_SUCCESS', { license_id: license.id, ip: req.ip });
  res.json({ key: license.key });
});

/* ──────────────────────────────────────────────────────────
   POST /api/auth/change-password  (auth: Bearer)
   Body: { current_password, new_password }
────────────────────────────────────────────────────────── */
router.post('/change-password', (req, res) => {
  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
  if (!token) return res.status(401).json({ error: 'auth_required' });

  const session = getSession(token);
  if (!session) return res.status(401).json({ error: 'session_invalid' });

  const license = getLicenseById(session.license_id);
  if (!license || license.status !== 'active') {
    return res.status(403).json({ error: 'license_inactive' });
  }
  if (!isPasswordSet(license)) {
    return res.status(409).json({ error: 'not_activated' });
  }

  const current_password = req.body?.current_password;
  const new_password = req.body?.new_password;

  if (!verifyPassword(typeof current_password === 'string' ? current_password : '', license.password_hash)) {
    audit('CHANGE_PASSWORD_FAILED_CURRENT', { license_id: license.id, ip: req.ip });
    return res.status(401).json({ error: 'invalid_credentials', message: 'La contraseña actual no es correcta.' });
  }

  const pwdCheck = validatePassword(new_password);
  if (!pwdCheck.ok) return res.status(pwdCheck.status).json(pwdCheck.body);

  setPasswordHash(license.id, hashPassword(new_password));
  audit('PASSWORD_CHANGED', { license_id: license.id, ip: req.ip });
  res.json({ success: true });
});

/* ──────────────────────────────────────────────────────────
   POST /api/auth/request-password-reset
   El usuario olvidó su contraseña. Requiere email + clave (no sesión).
   Genera un reset_token y lo envía por email.
   Body: { email, license_key }
────────────────────────────────────────────────────────── */
router.post('/request-password-reset', async (req, res) => {
  const email = (req.body?.email || '').trim().toLowerCase();
  const license_key = (req.body?.license_key || '').trim().toUpperCase();

  if (!email || !EMAIL_REGEX.test(email) || !license_key || !KEY_REGEX.test(license_key)) {
    return res.status(400).json({ error: 'invalid_input', message: 'Email o clave inválidos.' });
  }

  // #6 (sesión 2) — oráculo de enumeración por 429: el límite por email se
  // comprueba ANTES de mirar si el par email+clave existe, contando TODAS las
  // solicitudes (auth_request_log las registra siempre). Así el 429 salta
  // igual para pares válidos e inventados y no delata qué cuentas existen.
  if (countAuthRequests(email, 'password_reset', '-1 hour') >= RESET_MAX_PER_HOUR) {
    audit('PASSWORD_RESET_REQUEST_RATE_LIMITED', { ip: req.ip, detail: `email=${email}` });
    return res.status(429).json({
      error: 'reset_limit_reached',
      message: 'Has hecho demasiadas solicitudes. Espera una hora e inténtalo de nuevo.'
    });
  }
  logAuthRequest(email, 'password_reset');

  const license = getLicenseByEmailAndKey(email, license_key);

  // Respuesta genérica siempre (anti-enumeración)
  const genericResponse = {
    success: true,
    message: 'Si los datos son correctos, recibirás un email con instrucciones para restablecer tu contraseña.'
  };

  if (!license || license.status !== 'active') {
    audit('PASSWORD_RESET_REQUEST_INVALID', { ip: req.ip, detail: `email=${email}` });
    return res.json(genericResponse);
  }

  if (!canResetPassword(license)) {
    // #6: el límite anual ya NO se revela por HTTP (un 429 aquí delataría que
    // el par email+clave es válido). La respuesta es la genérica y la
    // explicación llega SOLO al buzón del titular (sendPasswordResetLimitEmail).
    audit('PASSWORD_RESET_REQUEST_YEARLY_LIMIT', { license_id: license.id, ip: req.ip });
    try {
      await sendPasswordResetLimitEmail({ to: license.email });
    } catch (e) {
      console.error('[EMAIL ERROR]', e.message);
    }
    return res.json(genericResponse);
  }

  const { token, expires_at } = createResetToken(license.id, 'password_reset', 30);

  try {
    await sendPasswordResetEmail({ to: license.email, token, expires_at });
  } catch (e) {
    console.error('[EMAIL ERROR]', e.message);
  }

  audit('PASSWORD_RESET_REQUESTED', { license_id: license.id, ip: req.ip });
  res.json(genericResponse);
});

/* ──────────────────────────────────────────────────────────
   POST /api/auth/confirm-password-reset
   El usuario llega desde el enlace del email con el token.
   Body: { token, new_password, device_name? }
   Setea la nueva contraseña y crea sesión inmediata.
────────────────────────────────────────────────────────── */
router.post('/confirm-password-reset', (req, res) => {
  const token = (req.body?.token || '').trim();
  const new_password = req.body?.new_password;
  const device_name = sanitizeFreeText(req.body?.device_name || '').slice(0, 120);

  if (!token) {
    return res.status(400).json({ error: 'missing_token' });
  }
  const pwdCheck = validatePassword(new_password);
  if (!pwdCheck.ok) return res.status(pwdCheck.status).json(pwdCheck.body);

  // #9 (sesión 2): peek ANTES de consumir. Si la licencia está inactiva se
  // responde 403 SIN quemar el token — antes el consume quedaba hecho y el
  // enlace moría aunque el admin reactivara la licencia un minuto después.
  const peeked = peekResetToken(token, 'password_reset');
  if (!peeked) {
    return res.status(400).json({
      error: 'invalid_or_expired_token',
      message: 'Este enlace ya no es válido. Puede haber expirado o haberse usado ya.'
    });
  }

  const license = getLicenseById(peeked.license_id);
  if (!license || license.status !== 'active') {
    return res.status(403).json({ error: 'license_inactive', message: 'Licencia no disponible.' });
  }

  // Token válido + licencia activa → ahora sí, consumir (un solo uso).
  const consumed = consumeResetToken(token, 'password_reset');
  if (!consumed) {
    // Carrera imposible en SQLite (writes serializados), pero por higiene.
    return res.status(400).json({ error: 'invalid_or_expired_token' });
  }

  setPasswordHash(license.id, hashPassword(new_password), device_name || null);
  markPasswordReset(license.id);
  // Las sesiones previas siguen siendo válidas: quien resetea por email puede tener
  // otra pestaña abierta legítimamente; el reset no las revoca.
  const { token: sessionToken, expires_at } = createSession(license.id, req.ip);

  audit('PASSWORD_RESET_CONFIRMED', { license_id: license.id, ip: req.ip });

  const updatedLicense = getLicenseById(license.id);
  res.json({ success: true, token: sessionToken, expires_at, license: publicLicenseView(updatedLicense) });
});

/* ──────────────────────────────────────────────────────────
   Helper: vista pública de la licencia — nunca exponer password_hash
   ni campos internos sensibles (stripe_customer_id queda oculto: basta un
   booleano has_subscription para que el frontend sepa si hay portal que
   gestionar). Incluye los campos de suscripción relevantes para la sección
   "Suscripción" de Configuracion (Fase 3) y la cuota IA del plan.
────────────────────────────────────────────────────────── */
function publicLicenseView(license) {
  return {
    key: license.key,
    email: license.email,
    plan: license.plan,
    status: license.status,
    billing_model: license.billing_model || 'subscription',
    has_subscription: !!license.stripe_customer_id,
    current_period_ends_at: license.current_period_ends_at || null,
    cancel_at_period_end: !!license.cancel_at_period_end,
    trial_ends_at: license.trial_ends_at || null,
    device_name: license.device_name || null,
    created_at: license.created_at,
    ai_quota: aiQuotaForPlan(license.plan)
  };
}

/* ════════════════════════════════════════════════════════════
   RECUPERACIÓN DE ACCESO CON OTP (olvido de clave y/o contraseña)
   Flujo: request-recovery (email) → verify-recovery-otp (código
   de 6 dígitos) → pantalla muestra las claves + opción de cambiar
   la contraseña (confirm-recovery). El email NUNCA lleva la clave;
   esta solo se muestra tras verificar el OTP (prueba de posesión
   del buzón, equivalente a la del reset por enlace ya existente).

   Nota sobre multi-licencia: un email puede tener varias licencias
   activas. El recovery_token se ancla a la primera (FK obligatoria
   en reset_tokens), pero confirm-recovery recibe `license_key` y
   aplica la nueva contraseña SOLO a esa licencia (tras comprobar que
   pertenece al email verificado) — un comprador puede gestionar
   licencias de terceros y no debemos tocar contraseñas ajenas.
════════════════════════════════════════════════════════════ */

/* ──────────────────────────────────────────────────────────
   POST /api/auth/request-recovery
   Body: { email }. Respuesta SIEMPRE genérica (anti-enumeración).
   Si el email tiene licencias activas, envía un OTP de 6 dígitos
   (10 min de validez).

   #7 (sesión 2) — anti-enumeración reforzada:
   · El límite (OTP_MAX_PER_HOUR/hora + OTP_MAX_PER_DAY/día, #14) se aplica
     ANTES de consultar la DB y cuenta TODAS las solicitudes del email
     (auth_request_log), así el 429 salta igual exista o no la cuenta.
   · Si el email no existe se hace trabajo dummy (delay equivalente al envío
     del email) para igualar la latencia y cerrar el oráculo de timing.
   (Además del authLimiter global por IP de la ruta.)
────────────────────────────────────────────────────────── */
const RECOVERY_DUMMY_DELAY_MS = 400; // ~ latencia típica del envío vía Resend

router.post('/request-recovery', async (req, res) => {
  const email = (req.body?.email || '').trim().toLowerCase();

  const genericResponse = {
    success: true,
    message: 'Si el email corresponde a una cuenta, recibirás un código de verificación.'
  };

  if (!email || !EMAIL_REGEX.test(email)) {
    return res.status(400).json({ error: 'invalid_input', message: 'Email inválido.' });
  }

  if (countAuthRequests(email, 'recovery', '-1 hour') >= OTP_MAX_PER_HOUR
      || countAuthRequests(email, 'recovery', '-24 hours') >= OTP_MAX_PER_DAY) {
    audit('RECOVERY_OTP_RATE_LIMITED', { ip: req.ip, detail: `email=${email}` });
    return res.status(429).json({
      error: 'otp_limit_reached',
      message: 'Has solicitado demasiados códigos. Espera un rato e inténtalo de nuevo.'
    });
  }
  logAuthRequest(email, 'recovery');

  const licenses = getActiveLicensesByEmail(email);
  if (licenses.length === 0) {
    // Trabajo dummy: la rama con cuenta envía un email (llamada HTTPS a
    // Resend); sin delay esta rama respondería mucho más rápido y delataría
    // por timing qué emails tienen licencia (#7).
    await new Promise(r => setTimeout(r, RECOVERY_DUMMY_DELAY_MS));
    audit('RECOVERY_OTP_REQUEST_INVALID', { ip: req.ip, detail: `email=${email}` });
    return res.json(genericResponse);
  }

  const { code, expires_at } = createOtp(email);

  try {
    await sendRecoveryOtpEmail({ to: email, code, expires_at });
  } catch (e) {
    console.error('[EMAIL ERROR]', e.message);
  }

  audit('RECOVERY_OTP_REQUESTED', { license_id: licenses[0].id, ip: req.ip });
  res.json(genericResponse);
});

/* ──────────────────────────────────────────────────────────
   POST /api/auth/verify-recovery-otp
   Body: { email, code }. Si el OTP es válido, devuelve las claves
   activas del email + un recovery_token (15 min) para la acción
   final (reenviar claves y/o cambiar contraseña).
────────────────────────────────────────────────────────── */
router.post('/verify-recovery-otp', (req, res) => {
  const email = (req.body?.email || '').trim().toLowerCase();
  const code = String(req.body?.code || '').trim();

  if (!email || !EMAIL_REGEX.test(email) || !/^\d{6}$/.test(code)) {
    return res.status(400).json({ error: 'invalid_input', message: 'Email o código inválidos.' });
  }

  const result = verifyOtp(email, code);
  if (!result.ok) {
    audit('RECOVERY_OTP_FAILED', { ip: req.ip, detail: `email=${email} reason=${result.reason}` });
    if (result.reason === 'burned') {
      return res.status(429).json({
        error: 'code_burned',
        message: 'Demasiados intentos fallidos. Solicita un nuevo código.'
      });
    }
    // 'no_code' y 'mismatch' dan la misma respuesta (no pistas al atacante)
    return res.status(400).json({
      error: 'invalid_code',
      message: 'El código no es válido o ha expirado.'
    });
  }

  const licenses = getActiveLicensesByEmail(email);
  if (licenses.length === 0) {
    // OTP válido pero la licencia se desactivó entre medias — caso rarísimo
    return res.status(403).json({ error: 'license_inactive', message: 'Licencia no disponible.' });
  }

  // Anclado a la primera licencia activa (ver nota multi-licencia arriba)
  const { token: recovery_token } = createResetToken(licenses[0].id, 'recovery', 15);

  audit('RECOVERY_OTP_VERIFIED', { license_id: licenses[0].id, ip: req.ip });
  res.json({
    success: true,
    recovery_token,
    keys: licenses.map(l => ({ key: l.key, plan: l.plan }))
  });
});

/* ──────────────────────────────────────────────────────────
   POST /api/auth/resend-recovered-keys
   Body: { recovery_token }. Reenvía las claves por email SIN
   consumir el token (el usuario puede querer además cambiar la
   contraseña después). Solo funciona mientras el token vive.
────────────────────────────────────────────────────────── */
router.post('/resend-recovered-keys', async (req, res) => {
  const token = (req.body?.recovery_token || '').trim();
  if (!token) return res.status(400).json({ error: 'missing_token' });

  const row = peekResetToken(token, 'recovery');
  if (!row) {
    return res.status(400).json({
      error: 'invalid_or_expired_token',
      message: 'La sesión de recuperación ha expirado. Vuelve a empezar.'
    });
  }

  const license = getLicenseById(row.license_id);
  if (!license || license.status !== 'active') {
    return res.status(403).json({ error: 'license_inactive', message: 'Licencia no disponible.' });
  }

  const licenses = getActiveLicensesByEmail(license.email);
  try {
    await sendRecoveredKeysEmail({ to: license.email, keys: licenses.map(l => l.key) });
  } catch (e) {
    console.error('[EMAIL ERROR]', e.message);
  }

  audit('RECOVERY_KEYS_RESENT', { license_id: license.id, ip: req.ip });
  res.json({ success: true, message: 'Te hemos enviado las claves por email.' });
});

/* ──────────────────────────────────────────────────────────
   POST /api/auth/confirm-recovery
   Body: { recovery_token, license_key, new_password, device_name? }.
   Consume el recovery_token y setea la nueva contraseña SOLO en la
   licencia indicada (que debe estar activa y pertenecer al email
   verificado con el OTP). Devuelve sesión iniciada en esa licencia.
────────────────────────────────────────────────────────── */
router.post('/confirm-recovery', (req, res) => {
  const token = (req.body?.recovery_token || '').trim();
  const license_key = (req.body?.license_key || '').trim().toUpperCase();
  const new_password = req.body?.new_password;
  const device_name = sanitizeFreeText(req.body?.device_name || '').slice(0, 120);

  if (!token) return res.status(400).json({ error: 'missing_token' });
  if (!license_key || !KEY_REGEX.test(license_key)) {
    return res.status(400).json({ error: 'invalid_input', message: 'Clave de licencia inválida.' });
  }
  const pwdCheck = validatePassword(new_password);
  if (!pwdCheck.ok) return res.status(pwdCheck.status).json(pwdCheck.body);

  const consumed = consumeResetToken(token, 'recovery');
  if (!consumed) {
    return res.status(400).json({
      error: 'invalid_or_expired_token',
      message: 'La sesión de recuperación ha expirado o ya se ha usado. Vuelve a empezar.'
    });
  }

  const anchor = getLicenseById(consumed.license_id);
  if (!anchor || anchor.status !== 'active') {
    return res.status(403).json({ error: 'license_inactive', message: 'Licencia no disponible.' });
  }

  // La clave elegida debe ser una de las licencias activas del email verificado
  const target = getActiveLicensesByEmail(anchor.email).find(l => l.key === license_key);
  if (!target) {
    return res.status(400).json({
      error: 'license_key_mismatch',
      message: 'La clave indicada no pertenece a este email.'
    });
  }

  setPasswordHash(target.id, hashPassword(new_password), device_name || null);
  markPasswordReset(target.id);

  // Sesión para la licencia elegida (la que devuelve el login al usuario)
  const { token: sessionToken, expires_at } = createSession(target.id, req.ip);

  audit('PASSWORD_RESET_VIA_RECOVERY', { license_id: target.id, ip: req.ip });

  const updatedLicense = getLicenseById(target.id);
  res.json({ success: true, token: sessionToken, expires_at, license: publicLicenseView(updatedLicense) });
});

module.exports = router;
