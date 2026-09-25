/** Da formato XXXX-XXXX-XXXX-XXXX a la clave mientras se escribe o se pega
 *  (solo hex, en mayúsculas, guiones automáticos, máx. 16 caracteres). */
export function formatLicenseKey(v) {
  const hex = v.toUpperCase().replace(/[^A-F0-9]/g, '').slice(0, 16);
  return hex.match(/.{1,4}/g)?.join('-') || '';
}

export const KEY_REGEX = /^[A-Fa-f0-9]{4}-[A-Fa-f0-9]{4}-[A-Fa-f0-9]{4}-[A-Fa-f0-9]{4}$/;
export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
