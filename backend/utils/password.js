/**
 * utils/password.js
 *
 * Hashing y verificación de contraseñas con `crypto.scrypt` (built-in de Node,
 * sin nuevas dependencias). Sustituye al viejo modelo de device-fingerprint:
 * el anti-sharing que aportaba el fingerprint se delega en la cuota diaria de
 * IA por licencia (backend/routes/proxy.js), y el "vínculo de posesión" pasa
 * a ser una contraseña elegida por el usuario.
 *
 * Formato almacenado (string en una sola columna `password_hash`):
 *
 *   scrypt$N$r$p$salt$derived
 *
 *   N        → parámetro de coste CPU/memoria (potencia de 2)
 *   r        → tamaño de bloque
 *   p        → factor de paralelización
 *   salt     → sal en base64
 *   derived  → clave derivada en base64
 *
 * Persistir los parámetros junto al hash permite cambiarlos en el futuro sin
 * romper los hashes antiguos (cada verificación lee sus propios parámetros).
 */

'use strict';

const crypto = require('crypto');

const SCRYPT_N = 16384; // 2^14 — equilibrio razonable entre coste y latencia (~50-100ms por hash)
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEYLEN = 32;       // 256 bits de salida
const SALTLEN = 16;      // 128 bits de sal

/**
 * Hashea una contraseña en texto plano y devuelve el string almacenable
 * `scrypt$N$r$p$salt$derived`. Es sincrónico vía scryptSync porque los volúmenes
 * de activación/cambio de contraseña son muy bajos (peticiones esporádicas, no
 * por-análisis) y así evitamos callbacks en todo el call site.
 */
function hashPassword(plain) {
  if (typeof plain !== 'string' || plain.length === 0) {
    throw new Error('hashPassword: la contraseña no puede estar vacía');
  }
  const salt = crypto.randomBytes(SALTLEN);
  const derived = crypto.scryptSync(plain, salt, KEYLEN, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P });
  return [
    'scrypt', SCRYPT_N, SCRYPT_R, SCRYPT_P,
    salt.toString('base64'),
    derived.toString('base64')
  ].join('$');
}

/**
 * Verifica una contraseña en texto plano contra un hash almacenado.
 * Devuelve true/false. Usa timingSafeEqual sobre la clave derivada para no
 * filtrar información vía timing.
 */
function verifyPassword(plain, stored) {
  if (typeof stored !== 'string' || !stored.startsWith('scrypt$')) return false;
  const parts = stored.split('$');
  // Formato esperado: ['scrypt', N, r, p, salt, derived]
  if (parts.length !== 6) return false;

  const N = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  const salt = Buffer.from(parts[4], 'base64');
  const expected = Buffer.from(parts[5], 'base64');
  if (!Number.isFinite(N) || !Number.isFinite(r) || !Number.isFinite(p)) return false;

  try {
    const derived = crypto.scryptSync(plain, salt, expected.length, { N, r, p });
    return derived.length === expected.length && crypto.timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}

/** ¿La licencia ya tiene contraseña seteada? (NULL = nunca activada con el modelo nuevo) */
function isPasswordSet(license) {
  return !!license && typeof license.password_hash === 'string' && license.password_hash.length > 0;
}

module.exports = {
  hashPassword,
  verifyPassword,
  isPasswordSet
};
