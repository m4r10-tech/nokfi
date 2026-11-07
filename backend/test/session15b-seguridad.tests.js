/**
 * test/session15b-seguridad.tests.js — S15b, lote 3 (seguridad de la app).
 *
 *   S3  cambiar / restablecer / recuperar la contraseña cierra las demás sesiones
 */

'use strict';


module.exports = async function session15bSeguridadTests({ post, get, call, check: checkFn, getDB }) {
  const check = (label, ok) => checkFn(label, () => ok);
  const db = require('../db/database');
  const { createLicense, createSession, createResetToken } = db;

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
};
