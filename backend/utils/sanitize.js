/**
 * utils/sanitize.js
 *
 * `sanitizeFreeText` — sanea texto libre controlado por el usuario antes de
 * guardarlo en la BD: quita caracteres de control (incluido DEL), colapsa
 * espacios en blanco y recorta extremos. NO escapa HTML (el escapado depende
 * del sink: en el frontend se hace con DOMPurify al rendizar; ver
 * middleware/sanitize.js del frontend) — solo normaliza la cadena para
 * almacenamiento.
 *
 * Antes estaba duplicado en routes/auth.js y routes/admin.js (device_name,
 * notes). Se extrajo aquí al añadir routes/profile.js (company_name, sector) —
 * un solo punto para el saneado de texto libre en el backend.
 *
 * ⚠️ Auditoría de seguridad: es la línea de frente contra entradas maliciosas
 * que luego se muestran o exportan. Siempre `.slice()` al destino final para
 * acotar la longitud máxima de la columna (el llamador decide el límite).
 */

'use strict';

function sanitizeFreeText(text) {
  return String(text)
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

module.exports = { sanitizeFreeText };
