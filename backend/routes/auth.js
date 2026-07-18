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
  audit
} = require('../db/database');

const { hashPassword, verifyPassword, isPasswordSet } = require('../utils/password');
const { sendPasswordResetEmail } = require('../utils/mailer');

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
function sanitizeFreeText(text) {
  return String(text)
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

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

  // Licencia migrada sin contraseña, o nunca activada → invita a activar
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
    audit('PASSWORD_RESET_REQUEST_LIMIT_REACHED', { license_id: license.id, ip: req.ip });
    return res.status(429).json({
      error: 'reset_limit_reached',
      message: 'Ya has restablecido tu contraseña este año. Contacta con soporte para una excepción manual.'
    });
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

  const consumed = consumeResetToken(token, 'password_reset');
  if (!consumed) {
    return res.status(400).json({
      error: 'invalid_or_expired_token',
      message: 'Este enlace ya no es válido. Puede haber expirado o haberse usado ya.'
    });
  }

  const license = getLicenseById(consumed.license_id);
  if (!license || license.status !== 'active') {
    return res.status(403).json({ error: 'license_inactive', message: 'Licencia no disponible.' });
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
   ni campos internos sensibles.
────────────────────────────────────────────────────────── */
function publicLicenseView(license) {
  return {
    key: license.key,
    email: license.email,
    plan: license.plan,
    status: license.status,
    device_name: license.device_name || null,
    created_at: license.created_at
  };
}

module.exports = router;
