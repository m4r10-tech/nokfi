/**
 * utils/fingerprint.js
 *
 * El frontend genera un fingerprint "crudo" combinando varias señales del
 * navegador (ver sección 5 del proyecto: User-Agent, resolución, timezone,
 * idioma, canvas fingerprint, núcleos CPU) y lo envía ya hasheado con SHA-256
 * en el cliente. Aun así, el servidor NUNCA debe confiar ciegamente en un
 * hash que llega tal cual desde el cliente sin validar su forma.
 *
 * Esta utilidad:
 *   - Valida que el fingerprint recibido tiene la forma esperada (hex de 64 chars = SHA-256)
 *   - Re-hashea en servidor combinando el valor del cliente con la IP normalizada
 *     y el User-Agent recibido en la petición, para dificultar la falsificación
 *     de un fingerprint fijo copiado de otro dispositivo sin más contexto.
 *
 * Esto NO sustituye la lógica de fingerprint del cliente — la complementa.
 * El fingerprint final que se guarda en `licenses.device_fingerprint` es el
 * resultado de `deriveServerFingerprint()`, no el valor crudo del cliente.
 */

'use strict';

const crypto = require('crypto');

const CLIENT_FP_REGEX = /^[a-f0-9]{64}$/i;

/** Valida que el fingerprint del cliente tiene forma de hash SHA-256 hexadecimal */
function isValidClientFingerprint(value) {
  return typeof value === 'string' && CLIENT_FP_REGEX.test(value);
}

/**
 * Deriva el fingerprint final que se almacena y compara en servidor.
 * Combina: fingerprint del cliente + User-Agent (servidor) + primeros octetos de la IP.
 *
 * No se usa la IP completa porque cambia con redes móviles/IPs dinámicas y
 * generaría falsos negativos legítimos; los primeros octetos aportan una señal
 * adicional sin ser tan estrictos como para bloquear a usuarios con IP dinámica.
 */
function deriveServerFingerprint(clientFingerprint, userAgent, ip) {
  const normalizedUA = (userAgent || '').trim().toLowerCase();
  const ipPrefix = normalizeIpPrefix(ip);

  return crypto
    .createHash('sha256')
    .update(`${clientFingerprint}::${normalizedUA}::${ipPrefix}`)
    .digest('hex');
}

/** Toma solo el primer bloque de la IP (IPv4: primer octeto, IPv6: primer grupo) */
function normalizeIpPrefix(ip) {
  if (!ip) return 'unknown';
  const clean = ip.replace('::ffff:', ''); // IPv4-mapped IPv6
  if (clean.includes('.')) {
    return clean.split('.')[0]; // primer octeto IPv4
  }
  if (clean.includes(':')) {
    return clean.split(':')[0]; // primer grupo IPv6
  }
  return clean;
}

module.exports = {
  isValidClientFingerprint,
  deriveServerFingerprint
};
