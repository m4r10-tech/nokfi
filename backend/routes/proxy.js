/**
 * routes/proxy.js — endpoint HEREDADO de análisis con prompt libre.
 *
 * Sesión 4 (F2): el navegador ya no construye prompts; los análisis van por
 * POST /api/ai/analyze (routes/ai.js), que arma el prompt en el backend. Este
 * endpoint aceptaba cualquier prompt → era un "Gemini gratis" con nuestra
 * clave. Se CIERRA: responde 410 `client_outdated` para que una pestaña con
 * el bundle viejo (PWA cacheada) pida recargar en vez de fallar en silencio.
 *
 * La decisión del FREE TIER de Gemini (privacidad + cuota por proyecto) sigue
 * vigente y documentada en services/ai/gemini.js y en la política de privacidad.
 */

'use strict';

const express = require('express');
const router = express.Router();

router.post('/ai', (_req, res) => {
  res.status(410).json({
    error: 'client_outdated',
    message: 'Hay una versión nueva de Nokfi. Recarga la página para seguir analizando.'
  });
});

module.exports = router;
