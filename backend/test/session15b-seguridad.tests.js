/**
 * test/session15b-seguridad.tests.js — S15b, lote 3 (seguridad de la app).
 *
 *   S3  cambiar / restablecer / recuperar la contraseña cierra las demás sesiones
 *   S6  Origin ajeno → 403 sin fila en client_errors; client_errors con límite
 *   S7  X-Frame-Options de Express igual que Nginx (DENY)
 *   S8  el log de peticiones no lleva el token de un enlace de gestoría
 */

'use strict';

const http = require('http');

module.exports = async function session15bSeguridadTests({ post, get, call, check: checkFn, getDB }) {
  const check = (label, ok) => checkFn(label, () => ok);
  const db = require('../db/database');
  const { createLicense, createSession, createResetToken } = db;
  const baseUrl = `http://localhost:${process.env.PORT}`;

  function raw(method, path, headers = {}) {
    return new Promise((resolve, reject) => {
      const req = http.request(`${baseUrl}${path}`, { method, headers }, (res) => {
        let data = ''; res.on('data', d => data += d);
        res.on('end', () => { let p; try { p = JSON.parse(data); } catch { p = data; } resolve({ status: res.statusCode, headers: res.headers, data: p }); });
      });
      req.on('error', reject); req.end();
    });
  }

  let n = 0;
  function mkLicense(plan = 'pro') {
    n++;
    return createLicense({ email: `s15b-seg-${n}@nokfi.local`, plan, password: 'SegPass!123', created_by: 'system' });
  }
  const profileStatus = async (tok) => (await get('/api/profile', tok)).status;

  // ── S3: change-password cierra las demás sesiones; la actual sigue ──
  {
    const l = mkLicense();
    const a = createSession(l.id, '127.0.0.1').token;
    const b = createSession(l.id, '127.0.0.1').token;
    const r = await post('/api/auth/change-password', { current_password: 'SegPass!123', new_password: 'SegPass!456' }, a);
    const sa = await profileStatus(a);
    const sb = await profileStatus(b);
    check('S3 change-password: 200, la sesión actual sigue y la otra da 401', r.status === 200 && sa !== 401 && sb === 401);
  }

  // ── S3: confirm-password-reset cierra todas las sesiones previas ──
  {
    const l = mkLicense();
    const old = createSession(l.id, '127.0.0.1').token;
    const { token } = createResetToken(l.id, 'password_reset');
    const r = await post('/api/auth/confirm-password-reset', { token, new_password: 'ResetPass!789' });
    const sOld = await profileStatus(old);
    const sNew = r.data?.token ? await profileStatus(r.data.token) : 0;
    check('S3 confirm-password-reset: la sesión vieja da 401 y la nueva vale', r.status === 200 && sOld === 401 && sNew !== 401);
  }

  // ── S3: confirm-recovery cierra las sesiones previas de la licencia elegida ──
  {
    const l = mkLicense();
    const old = createSession(l.id, '127.0.0.1').token;
    const { token } = createResetToken(l.id, 'recovery');
    const r = await post('/api/auth/confirm-recovery', { recovery_token: token, license_key: l.key, new_password: 'RecovPass!789' });
    const sOld = await profileStatus(old);
    const sNew = r.data?.token ? await profileStatus(r.data.token) : 0;
    check('S3 confirm-recovery: la sesión vieja da 401 y la nueva vale', r.status === 200 && sOld === 401 && sNew !== 401);
  }

  // ── S6: Origin ajeno → 403 sin traza ni fila en client_errors (también el preflight) ──
  {
    const before = getDB().prepare('SELECT COUNT(*) c FROM client_errors').get().c;
    const r1 = await raw('GET', '/api/payments/plans', { Origin: 'https://evil.example' });
    const r2 = await raw('OPTIONS', '/api/v1/openapi.json', { Origin: 'https://evil.example', 'Access-Control-Request-Method': 'GET' });
    const after = getDB().prepare('SELECT COUNT(*) c FROM client_errors').get().c;
    check('S6 Origin ajeno → 403 origin_not_allowed (GET y preflight), sin ACAO',
      r1.status === 403 && r1.data?.error === 'origin_not_allowed' && r2.status === 403 && !r1.headers['access-control-allow-origin']);
    check('S6 Origin ajeno no crea filas en client_errors', after === before);
    const ok = await raw('GET', '/api/payments/plans', { Origin: 'http://localhost:5173' });
    check('S6 Origin permitido sigue funcionando con ACAO', ok.status === 200 && ok.headers['access-control-allow-origin'] === 'http://localhost:5173');
  }

  // ── S6: client_errors con límite (por minuto entre todas las fuentes y en total) ──
  {
    const { recordError, ERRORS_MAX_PER_MIN, ERRORS_MAX_ROWS } = require('../routes/account');
    const d = getDB();
    // Tabla ya «llena» de más: al guardar el siguiente error se recorta a ERRORS_MAX_ROWS.
    const ins = d.prepare("INSERT INTO client_errors (source, message) VALUES ('client', 'relleno s15b')");
    d.transaction(() => { for (let i = 0; i < ERRORS_MAX_ROWS + 200; i++) ins.run(); })();
    recordError({ source: 'server', message: 's15b recorte' });
    const rows = d.prepare('SELECT COUNT(*) c FROM client_errors').get().c;
    const last = d.prepare('SELECT message FROM client_errors ORDER BY id DESC LIMIT 1').get();
    check(`S6 client_errors no pasa de ${ERRORS_MAX_ROWS} filas (se quitan las más antiguas)`, rows <= ERRORS_MAX_ROWS && last?.message === 's15b recorte');
    const maxBefore = d.prepare('SELECT MAX(id) m FROM client_errors').get().m;
    for (let i = 0; i < ERRORS_MAX_PER_MIN + 40; i++) recordError({ source: 'server', message: 's15b ráfaga' });
    const added = d.prepare('SELECT COUNT(*) c FROM client_errors WHERE id > ?').get(maxBefore).c;
    check(`S6 una ráfaga de errores guarda como mucho ${ERRORS_MAX_PER_MIN} por minuto`, added > 0 && added <= ERRORS_MAX_PER_MIN);
    d.prepare("DELETE FROM client_errors WHERE message IN ('relleno s15b', 's15b recorte', 's15b ráfaga')").run();
  }

  // ── S7: X-Frame-Options de Express coincide con el de Nginx (DENY) ──
  {
    const r = await raw('GET', '/api/health');
    check('S7 /api responde X-Frame-Options DENY (no SAMEORIGIN, que contradecía a Nginx)', r.headers['x-frame-options'] === 'DENY');
  }

  // ── S8: el log de morgan no lleva el token del enlace de gestoría ──
  {
    const l = mkLicense();
    const tok = createSession(l.id, '127.0.0.1').token;
    const c = await post('/api/share', { label: 'Gestoría s15b', days: 30 }, tok);
    const shareToken = c.data?.link?.token;
    const out = [];
    const orig = process.stdout.write.bind(process.stdout);
    process.stdout.write = (chunk, ...rest) => { out.push(String(chunk)); return orig(chunk, ...rest); };
    let r;
    try {
      r = await raw('GET', `/api/shared/${shareToken}?year=2026`, { Referer: `http://localhost:5173/compartido/${shareToken}` });
      await new Promise(res => setTimeout(res, 50)); // morgan escribe al cerrar la respuesta
    } finally { process.stdout.write = orig; }
    const log = out.join('');
    check('S8 el log de /api/shared/:token no contiene el token (sale como ***)',
      c.status === 201 && !!shareToken && r.status === 200 && log.includes('/api/shared/***') && !log.includes(shareToken));
  }
};
