/**
 * services/einvoice.js — sesión 11 (tanda 1): lectura EXACTA de facturas
 * electrónicas en la API, el MCP y n8n, sin IA y sin gastar cuota.
 *
 * El lector es el mismo que usa el navegador (shared/einvoice.mjs); aquí se le
 * da el DOMParser de @xmldom/xmldom, que no resuelve entidades externas (sin
 * XXE). Formatos: Facturae 3.2.x (.xml/.xsig), UBL 2.x, CII y Factur-X /
 * ZUGFeRD embebido en PDF.
 */

'use strict';

const { DOMParser } = require('@xmldom/xmldom');

let sharedPromise = null;
const loadShared = () => (sharedPromise ||= import('../../shared/einvoice.mjs'));

let pdfjsPromise = null;
const loadPdfjs = () => (pdfjsPromise ||= import('pdfjs-dist/legacy/build/pdf.mjs'));

/** Un XML mal formado no debe colar datos a medias: cualquier aviso o error
 * de xmldom aborta (una etiqueta mal cerrada es solo un "warning" para él). */
function strictParser() {
  const fail = (msg) => { throw new Error(`xml: ${msg}`); };
  return new DOMParser({ errorHandler: { warning: fail, error: fail, fatalError: fail } });
}

/** Una factura sin número ni importes no se ha leído de verdad. */
const useful = (list) => (list?.length && list.every(i => i.invoice_number || i.total) ? list : null);

function decode(base64) {
  return Buffer.from(base64, 'base64').toString('utf8');
}

/** Texto XML → facturas, o null si no es un formato soportado. */
async function parseXml(xml, fileName) {
  const S = await loadShared();
  return S.parseEInvoiceXml(xml, fileName, strictParser());
}

/** PDF (base64) con XML embebido → facturas, o null si no lleva factura estructurada. */
async function parsePdf(base64, fileName) {
  const [S, pdfjs] = await Promise.all([loadShared(), loadPdfjs()]);
  const data = new Uint8Array(Buffer.from(base64, 'base64'));
  const doc = await pdfjs.getDocument({ data, isEvalSupported: false, disableFontFace: true, verbosity: 0 }).promise;
  try {
    const xml = S.pickEmbeddedXml(await doc.getAttachments());
    return xml ? S.parseEInvoiceXml(Buffer.from(xml).toString('utf8'), fileName, strictParser()) : null;
  } finally {
    await doc.destroy();
  }
}

const XML_MIMES = ['application/xml', 'text/xml'];

/**
 * Intenta leer un documento de la API como factura electrónica.
 * Devuelve { invoices } si lo es, { error } si es XML pero no se entiende,
 * o null para seguir por el camino de la IA.
 */
async function readStructured(f, name, mime) {
  const S = await loadShared();
  const isXmlName = /\.(xml|xsig)$/i.test(name);
  if (typeof f?.text === 'string' && f.text.trim()) {
    if (!S.looksLikeXml(f.text)) return null;
    const invoices = useful(await parseXml(f.text, name));
    return invoices ? { invoices } : { error: 'unsupported_xml' };
  }
  if (typeof f?.data !== 'string' || !f.data) return null;
  if (mime === 'application/pdf') {
    const invoices = useful(await parsePdf(f.data, name).catch(() => null));
    return invoices ? { invoices } : null;
  }
  if (XML_MIMES.includes(mime) || isXmlName) {
    const invoices = useful(await parseXml(decode(f.data), name));
    return invoices ? { invoices } : { error: 'unsupported_xml' };
  }
  return null;
}

module.exports = { readStructured, parseXml, parsePdf, XML_MIMES };
