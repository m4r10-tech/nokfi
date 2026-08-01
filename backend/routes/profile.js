/**
 * routes/profile.js
 *
 * Perfil de empresa del onboarding (sección 14 del proyecto). 1 fila por
 * licencia; las dos rutas van tras `requireLicense` y SÓLO usan req.license.id
 * → una licencia nunca puede leer/escribir el perfil de otra (no se acepta
 * license_id en el body).
 *
 *   GET /api/profile    → perfil de la licencia (200). Si aún no existe,
 *                         se devuelve el perfil VACÍO (200, no 404): el frontend
 *                         crea el suyo en localStorage con la misma forma; el
 *                         primer onboarding lo persiste con un PUT.
 *   PUT /api/profile     → upsert del perfil. Se valida enum contra los valores
 *                         exactos que admite el frontend (SECTORS/SIZES/EXPENSES
 *                         en OnboardingModal.jsx) y se sanea company_name como
 *                         texto libre. El cuerpo es camelCase (el shape del
 *                         hook del frontend); aquí se mapea a snake_case para
 *                         la BD y se hace MERGE parcial (un campo omitido no
 *                         se vacía: si no se envía, se preserva el valor actual).
 *
 * Privacidad: el perfil solo etiqueta al negocio del USUARIO PROPIO (nombre,
 * sector, tamaño, gastos). No lleva datos financieros sensibles. El scoping es
 * requireLicense (Bearer → req.license.id), igual que /api/analyses.
 *
 * (auth: Bearer; rate-limit general via /api/ en server.js)
 */

'use strict';

const express = require('express');
const router = express.Router();
const { requireLicense } = require('../middleware/requireLicense');
const { getCompanyProfile, upsertCompanyProfile, audit } = require('../db/database');
const { sanitizeFreeText } = require('../utils/sanitize');

// Enums espejo de OnboardingModal.jsx (frontend). Validación server-side: si el
// frontend se modifica sin tocar esto, un valor fuera de lista se ignora (no
// rompe, no persiste basura). Mantener sincronizado.
const VALID_SECTORS = ['Comercio', 'Hostelería', 'Salud', 'Legal', 'Construcción',
  'Tecnología', 'Consultoría', 'Diseño', 'Educación', 'Otro'];
const VALID_SIZES = ['solo', '2-5', '6-20', '20+'];
const VALID_EXPENSES = ['Alquiler', 'Personal', 'Proveedores', 'Marketing',
  'Suministros', 'Tecnología', 'Transporte', 'Otro'];

/** Mapea el cuerpo camelCase del frontend al shape (snake) que persiste la BD.
 *  Enum inválido → se OMITE el campo (no se setea a '') → el merge del DB
 *  layer preserva el valor actual. Solo se sobreescribe con un valor válido,
 *  o con ''/[] cuando el campo es legítimamente vacío (companyName libre,
 *  expenses vaciado). El merge parcial lo hace upsertCompanyProfile. */
function toStorageShape(body) {
  const out = {};
  if (body.companyName !== undefined) out.company_name = sanitizeFreeText(body.companyName || '').slice(0, 120);
  if (body.sector !== undefined && VALID_SECTORS.includes(body.sector)) out.sector = body.sector;
  if (body.size !== undefined && VALID_SIZES.includes(body.size)) out.size = body.size;
  if (body.mainExpenses !== undefined) {
    const arr = Array.isArray(body.mainExpenses) ? body.mainExpenses.filter(e => VALID_EXPENSES.includes(e)) : [];
    out.main_expenses = arr.slice(0, 8);
  }
  if (body.onboardingCompleted !== undefined)     out.onboarding_completed = !!body.onboardingCompleted;
  if (body.welcomeCardDismissed !== undefined)   out.welcome_card_dismissed = !!body.welcomeCardDismissed;
  return out;
}

// Perfil vacío en camelCase (lo que recibe el frontend por defecto). El GET lo
// devuelve así cuando no hay fila — el frontend no necesita un 404 especial.
const EMPTY_PROFILE_CAMEL = {
  companyName: '', sector: '', size: '', mainExpenses: [],
  onboardingCompleted: false, welcomeCardDismissed: false
};

// GET — perfil de la licencia (vacío si no existe).
router.get('/', requireLicense, (req, res) => {
  const stored = getCompanyProfile(req.license.id);
  if (!stored) return res.json({ profile: EMPTY_PROFILE_CAMEL });
  res.json({
    profile: {
      companyName: stored.company_name,
      sector: stored.sector,
      size: stored.size,
      mainExpenses: stored.main_expenses,
      onboardingCompleted: stored.onboarding_completed,
      welcomeCardDismissed: stored.welcome_card_dismissed
    }
  });
});

// PUT — upsert (merge parcial en el DB layer). Un campo omitido NO se resetea.
router.put('/', requireLicense, (req, res) => {
  const body = req.body || {};
  if (typeof body !== 'object' || Array.isArray(body)) {
    return res.status(400).json({ error: 'invalid_body', message: 'Se esperaba un objeto de perfil.' });
  }
  // Función helper para shape camel (espacio de nombres del hook del frontend).
  const incoming = toStorageShape(body);
  if (Object.keys(incoming).length === 0) {
    return res.status(400).json({ error: 'empty_profile', message: 'El perfil no contiene campos válidos.' });
  }

  // upsertCompanyProfile hace el merge con el perfil actual (preserva campos no
  // enviados). El resultado ya está saneado/validado/enum-filtrado.
  const saved = upsertCompanyProfile(req.license.id, incoming);

  audit('PROFILE_UPDATED', {
    license_id: req.license.id,
    ip: req.ip,
    detail: `onboarding=${saved.onboarding_completed ? 'yes' : 'no'}, sector=${saved.sector || '∅'}, size=${saved.size || '∅'}`
  });

  res.json({
    profile: {
      companyName: saved.company_name,
      sector: saved.sector,
      size: saved.size,
      mainExpenses: saved.main_expenses,
      onboardingCompleted: saved.onboarding_completed,
      welcomeCardDismissed: saved.welcome_card_dismissed
    }
  });
});

module.exports = router;
