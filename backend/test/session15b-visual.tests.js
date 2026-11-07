/**
 * test/session15b-visual.tests.js — S15b, lote 6 (visual y móvil).
 *
 *   V4  /api/auth/verify (y /logout) fuera del limitador general de /api (200/15 min en
 *       producción): con él, un 429 en verify dejaba la app en un spinner sin fin. Siguen
 *       teniendo un límite propio (sessionLimiter), así que no quedan sin límite.
 * (El resto del lote es visual: frontend/test/s15b-visual.e2e.cjs con Playwright.)
 */

'use strict';

const http = require('http');

module.exports = async function session15bVisualTests({ post, check }) {
  function req(method, path, auth) {
    return new Promise((resolve, reject) => {
      const h = { 'Content-Type': 'application/json' };
      if (auth) h.Authorization = `Bearer ${auth}`;
      const r = http.request(`http://localhost:${process.env.PORT}${path}`, { method, headers: h }, (res) => {
        let b = '';
        res.on('data', d => { b += d; });
        res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: b }));
      });
      r.on('error', reject);
      r.end();
    });
  }

  const lic = await post('/api/admin/licenses', { email: 's15b-visual@nokfi.local', plan: 'pro', password: 'Visual-Lote6!x' }, 'admin');
  const login = await post('/api/auth/login', { email: 's15b-visual@nokfi.local', license_key: lic.data.key, password: 'Visual-Lote6!x' });
  const token = login.data.token;
  check('V4 preparación: sesión de prueba', () => !!token);

  // Lo que queda en el limitador general antes y después de 5 comprobaciones de sesión.
  const before = await req('GET', '/api/profile', token);
  const verifies = [];
  for (let i = 0; i < 5; i++) verifies.push(await req('POST', '/api/auth/verify', token));
  const after = await req('GET', '/api/profile', token);
  const r1 = Number(before.headers['ratelimit-remaining']), r2 = Number(after.headers['ratelimit-remaining']);
  check('V4 el limitador general sigue activo en el resto de /api', () => Number.isFinite(r1) && Number.isFinite(r2));
  check(`V4 /api/auth/verify no gasta del limitador general (quedaban ${r1}, quedan ${r2}: solo baja la propia petición)`, () => r1 - r2 === 1);
  check('V4 /api/auth/verify responde bien', () => verifies.every(v => v.status === 200));
  const generalLimit = Number(before.headers['ratelimit-limit']);
  const verifyLimit = Number(verifies[0].headers['ratelimit-limit']);
  check(`V4 /api/auth/verify tiene su propio límite (${verifyLimit}), distinto del general (${generalLimit})`, () => Number.isFinite(verifyLimit) && verifyLimit > 0 && verifyLimit !== generalLimit);
  const vr = verifies.map(v => Number(v.headers['ratelimit-remaining']));
  check('V4 el límite propio de verify cuenta cada comprobación', () => vr.every((x, i) => i === 0 || x === vr[i - 1] - 1));
  const lo = await req('POST', '/api/auth/logout', token);
  check('V4 /api/auth/logout también va por el límite de sesión', () => Number(lo.headers['ratelimit-limit']) === verifyLimit);
};
