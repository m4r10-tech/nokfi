/**
 * middleware/fingerprint.js
 *
 * Genera el device fingerprint que el backend espera (sección 7 del
 * contrato de API): un hash SHA-256 en hex de exactamente 64 caracteres,
 * combinando varias señales del navegador. Se cachea en memoria durante
 * la sesión de la pestaña — se regenera de forma determinista (mismas
 * señales → mismo hash), no hace falta persistirlo en localStorage.
 */

let cachedFingerprint = null;

async function sha256Hex(message) {
  const data = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

function getCanvasFingerprint() {
  try {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    ctx.textBaseline = 'top';
    ctx.font = '14px "Plus Jakarta Sans", sans-serif';
    ctx.fillText('nokfi-fingerprint-lock', 2, 2);
    return canvas.toDataURL();
  } catch {
    return 'canvas-unavailable';
  }
}

export async function getDeviceFingerprint() {
  if (cachedFingerprint) return cachedFingerprint;

  const signals = [
    navigator.userAgent,
    `${screen.width}x${screen.height}`,
    Intl.DateTimeFormat().resolvedOptions().timeZone,
    navigator.language,
    getCanvasFingerprint(),
    String(navigator.hardwareConcurrency || 'unknown')
  ].join('::');

  cachedFingerprint = await sha256Hex(signals);
  return cachedFingerprint;
}
