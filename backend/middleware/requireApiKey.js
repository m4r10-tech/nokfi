/**
 * middleware/requireApiKey.js — F4: autenticación de la API pública v1.
 *
 *   Authorization: Bearer nk_live_…   (el nodo HTTP Request de n8n lo trae de serie)
 *
 * Comprueba: clave existente y no revocada → licencia activa → plan Pro o
 * Max (DECIDIDO: Mini no tiene API; si una licencia baja a Mini, sus claves
 * dejan de funcionar con un 401 claro, NO se borran) → límite por clave.
 *
 * Sesión 9: las claves de prueba (nk_test_…) valen en TODOS los planes, Mini
 * incluido: devuelven respuestas de ejemplo y no gastan cuota. req.livemode
 * dice en qué modo va la petición.
 */

'use strict';

const { getLicenseById, audit } = require('../db/database');
const { findApiKey, touchApiKey, logApiCall } = require('../db/apikeys');

const API_PLANS = ['pro', 'max'];
const perMinute = () => Number(process.env.API_RATE_PER_MINUTE) || 30;
const hits = new Map();

function rateOk(keyId) {
  const now = Date.now();
  const list = (hits.get(keyId) || []).filter(ts => now - ts < 60000);
  if (list.length >= perMinute()) { hits.set(keyId, list); return false; }
  list.push(now);
  hits.set(keyId, list);
  return true;
}
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of hits) if (!v.some(ts => now - ts < 60000)) hits.delete(k);
}, 5 * 60 * 1000).unref();

function requireApiKey(req, res, next) {
  const h = req.headers.authorization || '';
  const plain = h.startsWith('Bearer ') ? h.slice(7).trim() : '';
  const key = findApiKey(plain);
  if (!key) return res.status(401).json({ error: 'invalid_api_key', message: 'Clave de API no válida.' });
  if (key.revoked_at) return res.status(401).json({ error: 'api_key_revoked', message: 'Esta clave de API ha sido revocada.' });
  const license = getLicenseById(key.license_id);
  if (!license || license.status !== 'active') {
    return res.status(403).json({ error: 'license_inactive', message: 'La licencia asociada no está activa.' });
  }
  const livemode = key.mode !== 'test';
  if (livemode && !API_PLANS.includes(license.plan)) {
    return res.status(401).json({ error: 'api_plan_required', message: 'La API está disponible en los planes Pro y Max. Mejora tu plan para volver a usar esta clave.' });
  }
  if (!rateOk(key.id)) {
    return res.status(429).json({ error: 'rate_limited', message: `Máximo ${perMinute()} peticiones por minuto y clave.` });
  }
  touchApiKey(key.id);
  // Sesión 7: registro de la llamada al terminar (estado y código de error, sin contenido).
  const started = Date.now();
  let errorCode = '';
  const json = res.json.bind(res);
  res.json = (body) => { if (body && typeof body === 'object' && typeof body.error === 'string') errorCode = body.error; return json(body); };
  res.on('finish', () => {
    try { logApiCall({ license_id: license.id, key_id: key.id, method: req.method, path: req.baseUrl + req.path, status: res.statusCode, error_code: errorCode, ms: Date.now() - started, livemode }); }
    catch (e) { console.error('[API] no se pudo registrar la llamada:', e.message); }
  });
  req.license = license;
  req.apiKey = { id: key.id, name: key.name, mode: livemode ? 'live' : 'test' };
  req.livemode = livemode;
  if (!livemode) res.set('Nokfi-Mode', 'test');
  if (req.method !== 'GET') audit('API_REQUEST', { license_id: license.id, ip: req.ip, detail: `key=${key.id}${livemode ? '' : ' test'} ${req.method} ${req.path}` });
  next();
}

module.exports = { requireApiKey, API_PLANS };
