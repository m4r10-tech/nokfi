/**
 * middleware/requireLicense.js
 *
 * Protege rutas que requieren una sesión activa y válida.
 * Inyecta en `req`:
 *   req.session  → fila de la tabla sessions
 *   req.license  → fila de la tabla licenses asociada
 *
 * Verifica, en este orden:
 *   1. Existe token Bearer
 *   2. La sesión existe y no ha expirado
 *   3. La licencia asociada existe
 *   4. La licencia está 'active' (no suspendida ni revocada)
 *   5. El fingerprint de la sesión coincide con el fingerprint vinculado a la licencia
 *      (defensa en profundidad: aunque alguien robe el token, sin el dispositivo
 *       correcto la sesión ya no debería ser válida si hubo un reseteo de por medio)
 */

'use strict';

const { getSession, getLicenseById, audit } = require('../db/database');

function requireLicense(req, res, next) {
  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;

  if (!token) {
    return res.status(401).json({ error: 'auth_required', message: 'Se requiere autenticación.' });
  }

  const session = getSession(token);
  if (!session) {
    return res.status(401).json({
      error: 'session_invalid',
      message: 'Tu sesión no es válida o ha expirado. Vuelve a iniciar sesión.'
    });
  }

  const license = getLicenseById(session.license_id);
  if (!license) {
    return res.status(401).json({ error: 'license_not_found', message: 'Licencia no encontrada.' });
  }

  if (license.status !== 'active') {
    audit('BLOCKED_INACTIVE_LICENSE', {
      license_id: license.id,
      fingerprint: session.fingerprint,
      ip: req.ip,
      detail: `status=${license.status}`
    });
    const message = license.status === 'revoked'
      ? 'Esta licencia ha sido revocada. Contacta con soporte si crees que es un error.'
      : 'Esta licencia está suspendida temporalmente. Contacta con soporte.';
    return res.status(403).json({ error: 'license_inactive', message });
  }

  // Defensa en profundidad: el fingerprint de la sesión debe seguir coincidiendo
  // con el vinculado actualmente a la licencia (por si hubo un reseteo de dispositivo
  // que invalidó el vínculo pero, por cualquier fallo, la sesión sobreviviera)
  if (license.device_fingerprint && license.device_fingerprint !== session.fingerprint) {
    audit('BLOCKED_FINGERPRINT_MISMATCH', {
      license_id: license.id,
      fingerprint: session.fingerprint,
      ip: req.ip
    });
    return res.status(401).json({
      error: 'device_mismatch',
      message: 'Este dispositivo ya no coincide con el registrado para tu licencia.'
    });
  }

  req.session = session;
  req.license = license;
  next();
}

module.exports = { requireLicense };
