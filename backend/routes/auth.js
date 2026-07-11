/**
 * routes/auth.js
 *
 * Modelo de login: Email + Clave (XXXX-XXXX-XXXX-XXXX) + Device fingerprint.
 * Los tres deben coincidir. Ver sección 5 del proyecto.
 *
 * Endpoints:
 *   POST /api/auth/activate         → primera vinculación de dispositivo a una licencia recién comprada
 *   POST /api/auth/login            → login en un dispositivo ya vinculado
 *   POST /api/auth/verify           → comprobar si un token de sesión sigue siendo válido
 *   POST /api/auth/logout           → cerrar sesión actual
 *   POST /api/auth/request-device-reset  → solicitar token de reseteo (envía email)
 *   POST /api/auth/confirm-device-reset  → confirmar el reseteo con el token recibido por email
 */

'use strict';

const express = require('express');
const router = express.Router();

const {
  getLicenseByEmailAndKey,
  getLicenseById,
  bindDevice,
  resetDevice,
  canResetDevice,
  createSession,
  getSession,
  deleteSession,
  createResetToken,
  consumeResetToken,
  audit
} = require('../db/database');

const { isValidClientFingerprint, deriveServerFingerprint } = require('../utils/fingerprint');
const { sendDeviceResetEmail } = require('../utils/mailer');

const KEY_REGEX = /^[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{4}$/i;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * ⚠️ AUDITORÍA DE SEGURIDAD — sanitización defensiva de texto libre.
 * device_name viaja al frontend (React ya lo escapa al renderizar como
 * texto) y a emails HTML (mailer.js ya usa escapeHtml en las plantillas),
 * así que no hay ruta de XSS confirmada hoy. Aun así, por defensa en
 * profundidad, se eliminan caracteres de control invisibles y se colapsan
 * espacios — reduce la superficie si en el futuro este campo se usa en
 * un contexto nuevo que alguien olvide escapar.
 */
function sanitizeFreeText(text) {
  return String(text)
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '') // caracteres de control, conserva \n y \t normales
    .replace(/\s+/g, ' ')
    .trim();
}

/* ──────────────────────────────────────────────────────────
   Helper interno: valida y normaliza el trío email+key+fingerprint
   que llega en el body. Lanza un objeto {status, body} si algo falla.
────────────────────────────────────────────────────────── */
function validateCredentials(body) {
  const email = (body.email || '').trim().toLowerCase();
  const license_key = (body.license_key || '').trim().toUpperCase();
  const client_fingerprint = body.client_fingerprint;
  const device_name = sanitizeFreeText(body.device_name || '').slice(0, 120);

  if (!email || !EMAIL_REGEX.test(email)) {
    return { error: { status: 400, body: { error: 'invalid_email', message: 'Email no válido.' } } };
  }
  if (!license_key || !KEY_REGEX.test(license_key)) {
    return { error: { status: 400, body: { error: 'invalid_key_format', message: 'Formato de clave inválido. Usa XXXX-XXXX-XXXX-XXXX.' } } };
  }
  if (!isValidClientFingerprint(client_fingerprint)) {
    return { error: { status: 400, body: { error: 'invalid_fingerprint', message: 'No se pudo identificar el dispositivo de forma segura.' } } };
  }
  return { email, license_key, client_fingerprint, device_name };
}

/* ──────────────────────────────────────────────────────────
   POST /api/auth/activate
   Primera activación: la licencia aún no tiene dispositivo vinculado.
   Body: { email, license_key, client_fingerprint, device_name }
────────────────────────────────────────────────────────── */
router.post('/activate', (req, res) => {
  const parsed = validateCredentials(req.body || {});
  if (parsed.error) return res.status(parsed.error.status).json(parsed.error.body);

  const { email, license_key, client_fingerprint, device_name } = parsed;
  const ip = req.ip;
  const userAgent = req.headers['user-agent'] || '';
  const serverFingerprint = deriveServerFingerprint(client_fingerprint, userAgent, ip);

  const license = getLicenseByEmailAndKey(email, license_key);

  if (!license) {
    audit('ACTIVATION_FAILED_NOT_FOUND', { ip, detail: `email=${email}` });
    // Mensaje deliberadamente genérico: no revelar si el email existe pero la key no, o viceversa
    return res.status(404).json({ error: 'not_found', message: 'Email o clave de licencia incorrectos.' });
  }

  if (license.status !== 'active') {
    audit('ACTIVATION_FAILED_INACTIVE', { license_id: license.id, ip, detail: `status=${license.status}` });
    const message = license.status === 'revoked'
      ? 'Esta licencia ha sido revocada.'
      : 'Esta licencia está suspendida. Contacta con soporte.';
    return res.status(403).json({ error: 'license_inactive', message });
  }

  // Si ya tiene un dispositivo vinculado, esto NO es una activación — debe usar /login
  if (license.device_fingerprint) {
    if (license.device_fingerprint === serverFingerprint) {
      // Mismo dispositivo reintentando "activar" — lo tratamos como login válido
      const { token, expires_at } = createSession(license.id, serverFingerprint, ip);
      audit('ACTIVATION_REPEATED_SAME_DEVICE', { license_id: license.id, fingerprint: serverFingerprint, ip });
      return res.json({ success: true, token, expires_at, license: publicLicenseView(license) });
    }
    audit('ACTIVATION_FAILED_DEVICE_TAKEN', { license_id: license.id, ip });
    return res.status(403).json({
      error: 'device_already_bound',
      message: 'Esta licencia ya está activada en otro dispositivo. Si es tu equipo nuevo, solicita un reseteo de dispositivo desde "¿Ya tienes clave? Cambiar de dispositivo".'
    });
  }

  // Vinculación inicial
  bindDevice(license.id, serverFingerprint, device_name);
  const { token, expires_at } = createSession(license.id, serverFingerprint, ip);

  audit('ACTIVATION_SUCCESS', { license_id: license.id, fingerprint: serverFingerprint, ip });

  const updatedLicense = getLicenseById(license.id);
  res.status(201).json({ success: true, token, expires_at, license: publicLicenseView(updatedLicense) });
});

/* ──────────────────────────────────────────────────────────
   POST /api/auth/login
   Login en un dispositivo ya vinculado previamente.
   Body: { email, license_key, client_fingerprint }
────────────────────────────────────────────────────────── */
router.post('/login', (req, res) => {
  const parsed = validateCredentials(req.body || {});
  if (parsed.error) return res.status(parsed.error.status).json(parsed.error.body);

  const { email, license_key, client_fingerprint } = parsed;
  const ip = req.ip;
  const userAgent = req.headers['user-agent'] || '';
  const serverFingerprint = deriveServerFingerprint(client_fingerprint, userAgent, ip);

  const license = getLicenseByEmailAndKey(email, license_key);

  if (!license) {
    audit('LOGIN_FAILED_NOT_FOUND', { ip, detail: `email=${email}` });
    return res.status(404).json({ error: 'not_found', message: 'Email o clave de licencia incorrectos.' });
  }

  if (license.status !== 'active') {
    audit('LOGIN_FAILED_INACTIVE', { license_id: license.id, ip, detail: `status=${license.status}` });
    const message = license.status === 'revoked'
      ? 'Esta licencia ha sido revocada.'
      : 'Esta licencia está suspendida. Contacta con soporte.';
    return res.status(403).json({ error: 'license_inactive', message });
  }

  if (!license.device_fingerprint) {
    // Nunca se activó — debe pasar primero por /activate
    return res.status(409).json({
      error: 'not_activated',
      message: 'Esta licencia aún no ha sido activada en ningún dispositivo. Usa la opción de activación inicial.'
    });
  }

  if (license.device_fingerprint !== serverFingerprint) {
    audit('LOGIN_FAILED_DEVICE_MISMATCH', { license_id: license.id, ip });
    return res.status(401).json({
      error: 'device_mismatch',
      message: 'Este dispositivo no coincide con el registrado para tu licencia. Si has cambiado de equipo, solicita un reseteo de dispositivo.'
    });
  }

  const { token, expires_at } = createSession(license.id, serverFingerprint, ip);
  audit('LOGIN_SUCCESS', { license_id: license.id, fingerprint: serverFingerprint, ip });

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

  if (license.device_fingerprint !== session.fingerprint) {
    return res.status(401).json({ valid: false, error: 'device_mismatch' });
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
    audit('LOGOUT', { license_id: session.license_id, fingerprint: session.fingerprint, ip: req.ip });
  }

  res.json({ success: true });
});

/* ──────────────────────────────────────────────────────────
   POST /api/auth/request-device-reset
   El usuario solicita resetear su dispositivo (cambio de equipo).
   Requiere conocer email + clave (no requiere sesión activa, porque
   precisamente el usuario puede haber perdido el acceso al dispositivo).
   Body: { email, license_key }
   Efecto: genera un reset_token de un solo uso y lo envía por email.
────────────────────────────────────────────────────────── */
router.post('/request-device-reset', async (req, res) => {
  const email = (req.body?.email || '').trim().toLowerCase();
  const license_key = (req.body?.license_key || '').trim().toUpperCase();

  if (!email || !EMAIL_REGEX.test(email) || !license_key || !KEY_REGEX.test(license_key)) {
    return res.status(400).json({ error: 'invalid_input', message: 'Email o clave inválidos.' });
  }

  const license = getLicenseByEmailAndKey(email, license_key);

  // Respuesta genérica siempre, exista o no la licencia — evita enumeración de emails/claves
  const genericResponse = {
    success: true,
    message: 'Si los datos son correctos, recibirás un email con instrucciones para resetear tu dispositivo.'
  };

  if (!license || license.status !== 'active') {
    audit('DEVICE_RESET_REQUEST_INVALID', { ip: req.ip, detail: `email=${email}` });
    return res.json(genericResponse);
  }

  if (!canResetDevice(license)) {
    audit('DEVICE_RESET_REQUEST_LIMIT_REACHED', { license_id: license.id, ip: req.ip });
    // Aquí sí podemos ser específicos porque ya hemos confirmado email+key correctos
    return res.status(429).json({
      error: 'reset_limit_reached',
      message: 'Ya has reseteado tu dispositivo este año. Contacta con soporte para una excepción manual.'
    });
  }

  const { token, expires_at } = createResetToken(license.id, 'device_reset', 30);

  try {
    await sendDeviceResetEmail({ to: license.email, token, expires_at });
  } catch (e) {
    console.error('[EMAIL ERROR]', e.message);
    // No revelamos el fallo de envío al cliente por la misma razón de no-enumeración
  }

  audit('DEVICE_RESET_REQUESTED', { license_id: license.id, ip: req.ip });
  res.json(genericResponse);
});

/* ──────────────────────────────────────────────────────────
   POST /api/auth/confirm-device-reset
   El usuario llega desde el enlace del email con el token.
   Body: { token, client_fingerprint, device_name }
   Efecto: libera el dispositivo anterior y vincula el nuevo en el mismo paso,
   creando además una sesión inmediata para no obligar a un segundo login.
────────────────────────────────────────────────────────── */
router.post('/confirm-device-reset', (req, res) => {
  const token = (req.body?.token || '').trim();
  const client_fingerprint = req.body?.client_fingerprint;
  const device_name = sanitizeFreeText(req.body?.device_name || '').slice(0, 120);

  if (!token) {
    return res.status(400).json({ error: 'missing_token' });
  }
  if (!isValidClientFingerprint(client_fingerprint)) {
    return res.status(400).json({ error: 'invalid_fingerprint', message: 'No se pudo identificar el nuevo dispositivo.' });
  }

  const consumed = consumeResetToken(token, 'device_reset');
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

  const ip = req.ip;
  const userAgent = req.headers['user-agent'] || '';
  const serverFingerprint = deriveServerFingerprint(client_fingerprint, userAgent, ip);

  // Libera el dispositivo anterior (y sus sesiones) y vincula el nuevo en un único flujo
  resetDevice(license.id);
  bindDevice(license.id, serverFingerprint, device_name);

  const { token: sessionToken, expires_at } = createSession(license.id, serverFingerprint, ip);

  audit('DEVICE_RESET_CONFIRMED', { license_id: license.id, fingerprint: serverFingerprint, ip });

  const updatedLicense = getLicenseById(license.id);
  res.json({ success: true, token: sessionToken, expires_at, license: publicLicenseView(updatedLicense) });
});

/* ──────────────────────────────────────────────────────────
   Helper: vista pública de la licencia — nunca exponer
   device_fingerprint en bruto ni campos internos sensibles.
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
