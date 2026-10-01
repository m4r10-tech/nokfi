/**
 * services/verifactu/config.js — sesión 11 (tanda 4): configuración de
 * VERI*FACTU (RD 1007/2023 y Orden HAC/1177/2024).
 *
 *   VERIFACTU_ENV            off (por defecto) | test (preproducción AEAT) | prod
 *   VERIFACTU_PROD_ENABLED   1 para permitir prod (segundo interruptor: sin él, prod = off)
 *   VERIFACTU_LICENSES       licencias que envían a la AEAT: "6,12" o "*" (vacío = ninguna)
 *   VERIFACTU_CERT_PATH      certificado electrónico (.p12/.pfx) para el servicio web
 *   VERIFACTU_CERT_PASSWORD
 *   VERIFACTU_PRODUCER_NAME  productor del sistema (declaración responsable), "Nokfi" por defecto
 *   VERIFACTU_PRODUCER_NIF
 *   VERIFACTU_ENDPOINT       solo tests: sustituye la URL del servicio web
 *
 * Los registros (alta/anulación con huella encadenada) se generan SIEMPRE para
 * las facturas reales; lo que controla el interruptor es el envío a la AEAT y
 * el QR del PDF (solo lo lleva una factura que de verdad se remite).
 */

'use strict';

const fs = require('fs');

const ENDPOINTS = {
  test: {
    soap: 'https://prewww1.aeat.es/wlpl/TIKE-CONT/ws/SistemaFacturacion/VerifactuSOAP',
    qr: 'https://prewww2.aeat.es/wlpl/TIKE-CONT/ValidarQR'
  },
  prod: {
    soap: 'https://www1.agenciatributaria.gob.es/wlpl/TIKE-CONT/ws/SistemaFacturacion/VerifactuSOAP',
    qr: 'https://www2.agenciatributaria.gob.es/wlpl/TIKE-CONT/ValidarQR'
  }
};

/** Entorno efectivo: 'off' | 'test' | 'prod'. */
function env() {
  const v = String(process.env.VERIFACTU_ENV || 'off').toLowerCase();
  if (v === 'test') return 'test';
  if (v === 'prod') return process.env.VERIFACTU_PROD_ENABLED === '1' ? 'prod' : 'off';
  return 'off';
}

/** ¿Esta licencia remite sus registros a la AEAT? */
function licenseEnabled(license_id) {
  if (env() === 'off') return false;
  const list = String(process.env.VERIFACTU_LICENSES || '').split(',').map(s => s.trim()).filter(Boolean);
  return list.includes('*') || list.includes(String(license_id));
}

/** Datos del sistema informático (agrupación SistemaInformatico). */
function system(license_id) {
  return {
    NombreRazon: String(process.env.VERIFACTU_PRODUCER_NAME || 'Nokfi').slice(0, 120),
    NIF: String(process.env.VERIFACTU_PRODUCER_NIF || '').toUpperCase(),
    NombreSistemaInformatico: 'Nokfi',
    IdSistemaInformatico: 'NK',
    Version: require('../../package.json').version,
    NumeroInstalacion: `NK-${license_id}`,
    TipoUsoPosibleSoloVerifactu: 'S',
    TipoUsoPosibleMultiOT: 'S',
    IndicadorMultiplesOT: 'N'
  };
}

/** ¿Se puede enviar? { ok } o { ok: false, reason }. */
function sendReady() {
  const e = env();
  if (e === 'off') return { ok: false, reason: 'disabled' };
  if (!/^[0-9A-Z]{9}$/.test(String(process.env.VERIFACTU_PRODUCER_NIF || '').toUpperCase())) return { ok: false, reason: 'producer_nif' };
  if (process.env.VERIFACTU_ENDPOINT && process.env.NODE_ENV === 'test') return { ok: true };
  const p = process.env.VERIFACTU_CERT_PATH;
  if (!p || !fs.existsSync(p)) return { ok: false, reason: 'certificate' };
  return { ok: true };
}

function soapUrl() {
  if (process.env.VERIFACTU_ENDPOINT && process.env.NODE_ENV === 'test') return process.env.VERIFACTU_ENDPOINT;
  return ENDPOINTS[env()]?.soap || null;
}

const qrBase = () => ENDPOINTS[env()]?.qr || null;

module.exports = { ENDPOINTS, env, licenseEnabled, system, sendReady, soapUrl, qrBase };
