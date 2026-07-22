/**
 * routes/admin.js
 *
 * Panel de administración interno (sección 8 del proyecto).
 * Toda esta sub-app requiere ADMIN_SECRET en el header Authorization.
 *
 * Endpoints:
 *   GET    /api/admin/stats                          → métricas de negocio (sección 16)
 *   GET    /api/admin/licenses                        → listar todas las licencias
 *   GET    /api/admin/licenses/:id                     → detalle de una licencia
 *   POST   /api/admin/licenses                         → crear licencia manualmente
 *   PUT    /api/admin/licenses/:id                      → editar (status, plan, notes)
 *   DELETE /api/admin/licenses/:id                      → eliminar permanentemente
 *   POST   /api/admin/licenses/:id/reset-password        → forzar reset de contraseña (limpia sesiones)
 *   POST   /api/admin/licenses/:id/set-password          → asignar contraseña a una licencia (D3=b)
 *   GET    /api/admin/audit-log                         → últimos eventos de auditoría
 *
 * Modelo de planes (Fase 3): mini / pro / max (suscripción mensual). Las
 * licencias lifetime legacy migradas se marcan billing_model='legacy'. status
 * admite además 'expired' (suscripción cancelada/borrada en Stripe).
 */

'use strict';

const express = require('express');
const router = express.Router();

const {
  getAllLicenses,
  getLicenseById,
  createLicense,
  updateLicense,
  deleteLicense,
  clearPasswordAndSessions,
  setPasswordHash,
  deleteSessionsForLicense,
  getStats,
  getDB,
  audit
} = require('../db/database');

const { hashPassword } = require('../utils/password');
const { sendLicenseKeyEmail, sendLicenseRevokedEmail } = require('../utils/mailer');

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 8;

/** Ver razón en routes/auth.js — misma sanitización defensiva de texto libre */
function sanitizeFreeText(text) {
  return String(text)
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/* ── Middleware de autenticación admin — aplica a TODAS las rutas de este router ── */

/**
 * ⚠️ AUDITORÍA DE SEGURIDAD — validación de fortaleza del ADMIN_SECRET.
 * Antes solo se comprobaba que la variable existiera, no que fuera fuerte.
 * Un secret corto o predecible (ej. "admin123") habría dejado el panel
 * admin completo —crear licencias, ver ingresos, revocar accesos—
 * protegido por una contraseña trivial. Ahora se exige una longitud
 * mínima acorde a lo que genera el propio .env.example (64 caracteres
 * hex = 32 bytes aleatorios), y se rechaza el arranque si no se cumple
 * en producción — mejor fallar en el despliegue que servir inseguro.
 */
const MIN_ADMIN_SECRET_LENGTH = 32;

(function validateAdminSecretStrength() {
  const secret = process.env.ADMIN_SECRET;
  if (!secret) return; // ya se gestiona como error en requireAdmin() más abajo
  if (secret.length < MIN_ADMIN_SECRET_LENGTH) {
    const msg = `ADMIN_SECRET es demasiado corto (${secret.length} caracteres, mínimo ${MIN_ADMIN_SECRET_LENGTH}). Genera uno fuerte con: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`;
    if (process.env.NODE_ENV === 'production') {
      console.error('❌', msg);
      process.exit(1);
    } else {
      console.warn('⚠️ ', msg, '(permitido en desarrollo, pero corrígelo antes de producción)');
    }
  }
})();

function requireAdmin(req, res, next) {
  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
  const secret = process.env.ADMIN_SECRET;

  if (!secret) {
    console.error('⚠️  ADMIN_SECRET no está definido en .env — panel admin inaccesible por seguridad');
    return res.status(500).json({ error: 'admin_not_configured' });
  }

  if (!token) {
    return res.status(401).json({ error: 'auth_required' });
  }

  // Comparación en tiempo constante para evitar timing attacks sobre el secreto
  const a = Buffer.from(token);
  const b = Buffer.from(secret);
  const valid = a.length === b.length && require('crypto').timingSafeEqual(a, b);

  if (!valid) {
    audit('ADMIN_AUTH_FAILED', { ip: req.ip });
    return res.status(401).json({ error: 'invalid_credentials' });
  }

  next();
}

router.use(requireAdmin);

/* ──────────────────────────────────────────────────────────
   GET /api/admin/stats?period=30
────────────────────────────────────────────────────────── */
router.get('/stats', (req, res) => {
  const period = Number(req.query.period) || 30;
  try {
    res.json(getStats(period));
  } catch (e) {
    console.error('[ADMIN STATS]', e.message);
    res.status(500).json({ error: 'internal_error' });
  }
});

/* ──────────────────────────────────────────────────────────
   GET /api/admin/licenses
────────────────────────────────────────────────────────── */
router.get('/licenses', (req, res) => {
  try {
    res.json(getAllLicenses());
  } catch (e) {
    console.error('[ADMIN LICENSES]', e.message);
    res.status(500).json({ error: 'internal_error' });
  }
});

/* ──────────────────────────────────────────────────────────
   GET /api/admin/licenses/:id
────────────────────────────────────────────────────────── */
router.get('/licenses/:id', (req, res) => {
  const license = getLicenseById(parseInt(req.params.id, 10));
  if (!license) return res.status(404).json({ error: 'not_found' });
  res.json(license);
});

/* ──────────────────────────────────────────────────────────
   POST /api/admin/licenses
   Body: { email, plan }
   Creación manual — por ejemplo, para cortesías o reposiciones tras soporte.
   No envía email automáticamente; el admin decide si comunicarla a mano o
   usando el flag `notify: true`.
────────────────────────────────────────────────────────── */
/* Planes válidos (Fase 3): mini / pro / max (suscripción mensual). La
   convención "basic" del modelo viejo sobrevive sólo como dato histórico ya
   migrado a max/legacy — nunca se acepta en escritura. VALID_PLANS y coercePlan
   vienen de config/plans.js (fuente única; antes era un literal duplicado). */
const { VALID_PLANS, coercePlan } = require('../config/plans');
const VALID_STATUSES = ['active', 'suspended', 'revoked', 'expired'];

router.post('/licenses', async (req, res) => {
  const email = (req.body?.email || '').trim().toLowerCase();
  const plan = coercePlan(req.body?.plan);
  const notes = sanitizeFreeText(req.body?.notes || '').slice(0, 500);
  const notify = req.body?.notify === true;
  const password = req.body?.password;

  if (!email || !EMAIL_REGEX.test(email)) {
    return res.status(400).json({ error: 'invalid_email' });
  }
  // Contraseña opcional al crear; si llega, ya debe ser válida (no la validamos suave
  // porque aquí decide el admin, no un usuario final, pero respetamos el mínimo).
  if (password !== undefined && password !== null && (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH)) {
    return res.status(400).json({ error: 'weak_password' });
  }

  try {
    // Licencia creada a mano por el admin → billing_model='legacy' (no hay
    // suscripción real de Stripe detrás, sin cobro recurrente ni expiración).
    const license = createLicense({
      email, plan, notes,
      password: password || null,
      billing_model: 'legacy',
      created_by: 'admin_manual'
    });
    audit('LICENSE_CREATED_MANUAL', { license_id: license.id, ip: req.ip, detail: `email=${email}` });

    if (notify) {
      sendLicenseKeyEmail({ to: email, licenseKey: license.key, plan }).catch(e =>
        console.error('[EMAIL] Fallo enviando clave manual:', e.message)
      );
    }

    res.status(201).json(license);
  } catch (e) {
    console.error('[ADMIN CREATE LICENSE]', e.message);
    res.status(500).json({ error: 'internal_error' });
  }
});

/* ──────────────────────────────────────────────────────────
   PUT /api/admin/licenses/:id
   Body: { status?, plan?, notes?, email? }
────────────────────────────────────────────────────────── */
router.put('/licenses/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const license = getLicenseById(id);
  if (!license) return res.status(404).json({ error: 'not_found' });

  const { status, plan, email } = req.body || {};
  const notes = req.body?.notes !== undefined ? sanitizeFreeText(req.body.notes).slice(0, 500) : undefined;

  if (status && !VALID_STATUSES.includes(status)) {
    return res.status(400).json({ error: 'invalid_status' });
  }
  if (plan && !VALID_PLANS.includes(plan)) {
    return res.status(400).json({ error: 'invalid_plan' });
  }
  if (email && !EMAIL_REGEX.test(email)) {
    return res.status(400).json({ error: 'invalid_email' });
  }

  try {
    const updated = updateLicense(id, { status, plan, notes, email: email ? email.trim().toLowerCase() : undefined });

    // Si se revoca manualmente, limpiar sesiones activas igual que en un chargeback
    if (status === 'revoked' && license.status !== 'revoked') {
      deleteSessionsForLicense(id);
      sendLicenseRevokedEmail({ to: license.email, reason: 'decisión administrativa' }).catch(e =>
        console.error('[EMAIL] Fallo enviando aviso de revocación manual:', e.message)
      );
    }

    audit('LICENSE_UPDATED', { license_id: id, ip: req.ip, detail: JSON.stringify({ status, plan }) });
    res.json(updated);
  } catch (e) {
    console.error('[ADMIN UPDATE LICENSE]', e.message);
    res.status(500).json({ error: 'internal_error' });
  }
});

/* ──────────────────────────────────────────────────────────
   DELETE /api/admin/licenses/:id
────────────────────────────────────────────────────────── */
router.delete('/licenses/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const license = getLicenseById(id);
  if (!license) return res.status(404).json({ error: 'not_found' });

  try {
    deleteLicense(id);
    audit('LICENSE_DELETED', { license_id: id, ip: req.ip, detail: `email=${license.email}` });
    res.json({ success: true });
  } catch (e) {
    console.error('[ADMIN DELETE LICENSE]', e.message);
    res.status(500).json({ error: 'internal_error' });
  }
});

/* ──────────────────────────────────────────────────────────
   POST /api/admin/licenses/:id/reset-password
   Reseteo forzado por soporte, sin el límite de 1/año que aplica al usuario.
   Limpia la contraseña Y todas las sesiones activas — el usuario deberá
   activar de nuevo (elegir contraseña) o usar el flujo de reset por email.
────────────────────────────────────────────────────────── */
router.post('/licenses/:id/reset-password', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const license = getLicenseById(id);
  if (!license) return res.status(404).json({ error: 'not_found' });

  try {
    const updated = clearPasswordAndSessions(id);
    audit('PASSWORD_RESET_BY_ADMIN', { license_id: id, ip: req.ip });
    res.json(updated);
  } catch (e) {
    console.error('[ADMIN RESET PASSWORD]', e.message);
    res.status(500).json({ error: 'internal_error' });
  }
});

/* ──────────────────────────────────────────────────────────
   POST /api/admin/licenses/:id/set-password
   Body: { password }
   El admin asigna una contraseña a una licencia que no la tiene (mecanismo D3=b
   para licencias migradas del modelo viejo sin contraseña). El usuario entra con
   ella y la cambia en Configuración.
────────────────────────────────────────────────────────── */
router.post('/licenses/:id/set-password', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const license = getLicenseById(id);
  if (!license) return res.status(404).json({ error: 'not_found' });
  const password = req.body?.password;

  if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
    return res.status(400).json({ error: 'weak_password', message: `Mínimo ${MIN_PASSWORD_LENGTH} caracteres.` });
  }

  try {
    setPasswordHash(id, hashPassword(password));
    const updated = getLicenseById(id);
    audit('PASSWORD_SET_BY_ADMIN', { license_id: id, ip: req.ip });
    // No reseteamos sesiones: el admin solo está dando acceso inicial, no revocándolo.
    res.json(updated);
  } catch (e) {
    console.error('[ADMIN SET PASSWORD]', e.message);
    res.status(500).json({ error: 'internal_error' });
  }
});

/* ──────────────────────────────────────────────────────────
   GET /api/admin/audit-log?limit=50
────────────────────────────────────────────────────────── */
router.get('/audit-log', (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  try {
    const rows = getDB()
      .prepare('SELECT * FROM audit_log ORDER BY ts DESC LIMIT ?')
      .all(limit);
    res.json(rows);
  } catch (e) {
    console.error('[ADMIN AUDIT LOG]', e.message);
    res.status(500).json({ error: 'internal_error' });
  }
});

module.exports = router;
