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
 *   4. La licencia está 'active' (no suspendida ni revokada)
 *   5. La contraseña no se reseteó mientras esta sesión estaba viva:
 *      aunque las sesiones no se revocan en un change-password (para no
 *      cerrar la pestaña desde la que el usuario cambia la clave), sí
 *      invalidamos TODAS las sesiones previas en un reset por EMAIL
 *      (clearPasswordAndSessions). Aquí no hay nada extra que comprobar:
 *      el token de la sesión es el secreto; sin él, no hay acceso.
 *
 * (Fase 2: el viejo check de device-fingerprint vs session.fingerprint ya
 *  no aplica — el fingerprint se eliminó de la BD.)
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
      ip: req.ip,
      detail: `status=${license.status}`
    });
    const message =
      license.status === 'revoked'   ? 'Esta licencia ha sido revocada. Contacta con soporte si crees que es un error.'
      : license.status === 'expired' ? 'Tu suscripción ha finalizado. Reactiva tu plan para volver a usar Nokfi.'
      : license.status === 'suspended' ? 'Esta licencia está suspendida temporalmente. Contacta con soporte.'
      : 'Esta licencia no está activa. Contacta con soporte.';
    return res.status(403).json({ error: 'license_inactive', message });
  }

  req.session = session;
  req.license = license;
  next();
}

module.exports = { requireLicense };
