/**
 * services/verifactu/index.js — sesión 11 (tanda 4): envío de los registros
 * VERI*FACTU al servicio web de la AEAT (SOAP 1.1, RegFactuSistemaFacturacion)
 * y QR de cotejo para el PDF.
 *
 * Cola: cada 30 s se envían, por cuenta, hasta 1000 registros pendientes en
 * orden de cadena; después se respeta el TiempoEsperaEnvio que devuelve la
 * AEAT (60 s por defecto). Un fallo de red o un SoapFault reintenta con
 * espera creciente (1 min … 12 h) y la siguiente remisión va marcada como
 * Incidencia. Un registro "duplicado" (código 3000) cuenta como aceptado.
 *
 * Nada sale de Nokfi si VERIFACTU_ENV=off, si la cuenta no está en
 * VERIFACTU_LICENSES o si falta el certificado o el NIF del productor.
 */

'use strict';

const fs = require('fs');
const http = require('http');
const https = require('https');
const { DOMParser } = require('@xmldom/xmldom');
const C = require('./config');
const R = require('./record');
const V = require('../../db/verifactu');
const { addEvent } = require('../../db/invoicing');

const BACKOFF_S = [60, 300, 1800, 7200, 21600, 43200];
const DEFAULT_WAIT_S = 60;
const TIMEOUT_MS = 30000;
const DUPLICATE = '3000';

const nowS = () => Math.floor(Date.now() / 1000);

/* ── Transporte ── */
function post(url, body) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const opts = {
      method: 'POST',
      headers: { 'Content-Type': 'text/xml; charset=utf-8', SOAPAction: '""', 'Content-Length': Buffer.byteLength(body) },
      timeout: TIMEOUT_MS
    };
    if (u.protocol === 'https:' && process.env.VERIFACTU_CERT_PATH) {
      opts.pfx = fs.readFileSync(process.env.VERIFACTU_CERT_PATH);
      opts.passphrase = process.env.VERIFACTU_CERT_PASSWORD || '';
    }
    const req = (u.protocol === 'http:' ? http : https).request(u, opts, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString('utf8') }));
    });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', reject);
    req.end(body);
  });
}

/* ── Respuesta ── */
const byName = (node, name) => Array.from(node.getElementsByTagNameNS('*', name));
const text = (node, name) => byName(node, name)[0]?.textContent?.trim() || '';

/**
 * XML de respuesta → { fault } | { estadoEnvio, espera, csv, lineas: [{ numero, tipo, estado, codigo, descripcion }] }.
 */
function parseResponse(xml) {
  let doc;
  try { doc = new DOMParser({ onError: () => {} }).parseFromString(xml, 'text/xml'); } catch { return { fault: 'respuesta ilegible' }; }
  if (!doc?.documentElement) return { fault: 'respuesta vacía' };
  const fault = byName(doc, 'Fault')[0];
  if (fault) return { fault: text(fault, 'faultstring') || 'SoapFault' };
  const root = byName(doc, 'RespuestaRegFactuSistemaFacturacion')[0];
  if (!root) return { fault: 'respuesta sin RespuestaRegFactuSistemaFacturacion' };
  const espera = Number(byName(root, 'TiempoEsperaEnvio')[0]?.textContent);
  return {
    estadoEnvio: text(root, 'EstadoEnvio'),
    espera: Number.isFinite(espera) && espera > 0 ? espera : DEFAULT_WAIT_S,
    csv: text(root, 'CSV'),
    lineas: byName(root, 'RespuestaLinea').map(l => ({
      numero: text(l, 'NumSerieFactura'),
      tipo: text(l, 'TipoOperacion'),
      estado: text(l, 'EstadoRegistro'),
      codigo: text(l, 'CodigoErrorRegistro'),
      descripcion: text(l, 'DescripcionErrorRegistro')
    }))
  };
}

const STATUS = { Correcto: 'accepted', AceptadoConErrores: 'accepted_errors', Incorrecto: 'rejected' };
const EVENT = { accepted: 'verifactu_accepted', accepted_errors: 'verifactu_errors', rejected: 'verifactu_rejected' };

/* ── Envío de una cuenta ── */
let running = false;

/** Envía el siguiente lote de una cuenta. Devuelve { sent, ... } para tests y registros. */
async function sendBatch(license_id) {
  const now = nowS();
  const batch = V.pendingBatch(license_id, now);
  if (!batch.length) return { sent: 0 };
  const records = batch.map(r => ({ type: r.type, data: JSON.parse(r.data_json) }));
  const env = C.env();
  const body = R.soapEnvelope({
    obligado: { name: batch[0].issuer_name || '', nif: batch[0].issuer_nif },
    records,
    sistema: C.system(license_id),
    incidencia: batch.some(r => r.attempts > 0)
  });

  const retry = (msg) => {
    for (const r of batch) V.markRetry(r.id, now + BACKOFF_S[Math.min(r.attempts, BACKOFF_S.length - 1)], msg);
    console.error(`[VERIFACTU] licencia ${license_id}: ${msg} (${batch.length} registros, se reintentará)`);
    return { sent: 0, error: msg };
  };

  let res;
  try { res = await post(C.soapUrl(), body); } catch (e) { return retry(`red: ${e.message}`); }
  const out = parseResponse(res.body);
  if (out.fault) return retry(`HTTP ${res.status}: ${out.fault}`.slice(0, 500));
  V.setFlow(license_id, now + out.espera);

  // Cada línea de respuesta corresponde a un registro (número de factura + alta/anulación).
  const counts = { accepted: 0, accepted_errors: 0, rejected: 0 };
  for (const r of batch) {
    const tipo = r.type === 'alta' ? 'Alta' : 'Anulacion';
    const line = out.lineas.find(l => l.numero === r.number && l.tipo === tipo);
    if (!line) { V.markRetry(r.id, now + BACKOFF_S[0], 'sin respuesta para el registro'); continue; }
    const status = line.codigo === DUPLICATE ? 'accepted' : STATUS[line.estado] || 'rejected';
    V.markResult(r.id, { status, error_code: line.codigo, error_message: line.descripcion, csv: out.csv, env });
    counts[status]++;
    addEvent(license_id, r.invoice_id, EVENT[status], [r.type, line.codigo, line.descripcion].filter(Boolean).join(' · '));
  }
  return { sent: batch.length, estado: out.estadoEnvio, ...counts };
}

/** Pasada de la cola (todas las cuentas habilitadas con registros pendientes). */
async function processDue() {
  if (running) return { skipped: true };
  if (!C.sendReady().ok) return { skipped: true };
  running = true;
  try {
    const results = [];
    for (const license_id of V.licensesWithDue(nowS())) {
      if (!C.licenseEnabled(license_id)) continue;
      results.push({ license_id, ...(await sendBatch(license_id)) });
    }
    return { results };
  } finally {
    running = false;
  }
}

/* ── Estado para la app ── */
function status(license_id) {
  const env = C.env();
  const enabled = C.licenseEnabled(license_id);
  const ready = C.sendReady();
  return {
    env,
    enabled,
    sending: enabled && ready.ok,
    reason: !enabled ? 'disabled' : ready.ok ? null : ready.reason,
    summary: V.summary(license_id)
  };
}

/**
 * Subsana un registro de alta rechazado o aceptado con errores: genera un
 * nuevo registro (Subsanacion=S; RechazoPrevio=X si fue rechazado) con los
 * mismos datos de la factura, al final de la cadena.
 */
function resubmit(license_id, record_id) {
  const { getDB } = require('../../db/database');
  const D = require('../../db/invoicing');
  const rec = V.getRecord(license_id, record_id);
  if (!rec) return { status: 404, body: { error: 'not_found' } };
  if (rec.type !== 'alta' || !['rejected', 'accepted_errors'].includes(rec.status) || rec.fixed_by) {
    return { status: 409, body: { error: 'not_fixable', message: 'Solo se subsana un registro de alta rechazado o aceptado con errores.' } };
  }
  const inv = D.getInvoice(license_id, rec.invoice_id);
  if (!inv || inv.status !== 'issued') return { status: 409, body: { error: 'invoice_cancelled', message: 'La factura está anulada.' } };
  let id;
  getDB().transaction(() => {
    id = V.createAlta(license_id, inv.id, inv, {
      original: inv.rectifies_id ? D.getInvoice(license_id, inv.rectifies_id) : null,
      subsanacion: true,
      rechazoPrevio: rec.status === 'rejected'
    });
    V.setFixedBy(rec.id, id);
    addEvent(license_id, inv.id, 'verifactu_resubmitted', `#${rec.id} → #${id}`);
  })();
  return { status: 201, body: { record: V.getRecord(license_id, id) } };
}

/* ── QR del PDF ── */
/**
 * { qr: PNG, qrLegend } para una factura que se remite a la AEAT; {} si no
 * (envío desactivado, factura de prueba o sin registro de alta).
 */
async function pdfOptions(license_id, inv) {
  const base = C.qrBase();
  if (!base || !C.licenseEnabled(license_id) || !inv.livemode) return {};
  const alta = V.recordsForInvoice(license_id, inv.id).find(r => r.type === 'alta');
  if (!alta) return {};
  const d = JSON.parse(V.getRecord(license_id, alta.id).data_json);
  const url = R.qrUrl(base, d);
  // 30-40 mm (art. 21 de la Orden), corrección de errores M (ISO/IEC 18004).
  const png = await require('qrcode').toBuffer(url, { errorCorrectionLevel: 'M', type: 'png', margin: 0, width: 480 });
  return { qr: png, qrLegend: 'VERI*FACTU', qrUrl: url };
}

function startScheduler() {
  if (process.env.NODE_ENV === 'test') return;
  if (C.env() === 'off') return;
  console.log(`[VERIFACTU] entorno ${C.env()} · envío ${C.sendReady().ok ? 'activo' : `no disponible (${C.sendReady().reason})`}`);
  setInterval(() => { processDue().catch(e => console.error('[VERIFACTU] cola:', e.message)); }, 30 * 1000).unref();
}

module.exports = { parseResponse, sendBatch, processDue, status, resubmit, pdfOptions, startScheduler, BACKOFF_S };
