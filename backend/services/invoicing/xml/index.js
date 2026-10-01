/**
 * services/invoicing/xml/index.js — sesión 11 (tanda 3): factura emitida →
 * factura electrónica en el formato pedido.
 *   ubl       UBL 2.5 (SPFE de la AEAT, Peppol)
 *   facturae  Facturae 3.2.2 (sin firmar)
 *   facturx   PDF/A-3 con el XML CII embebido (Factur-X / ZUGFeRD, EN 16931)
 *   cii       solo el XML CII
 */

'use strict';

const { toUbl } = require('./ubl');
const { toFacturae } = require('./facturae');
const { toCii } = require('./cii');
const { renderFacturX } = require('../facturx');

const FORMATS = ['ubl', 'facturae', 'facturx', 'cii'];

const safe = (n) => String(n).replace(/[^\w.-]+/g, '_');

/** → { body: Buffer|string, contentType, filename } o { error, field?, fields? }. */
async function renderEInvoice(inv, format, opts = {}) {
  switch (format) {
    case 'ubl':
      return { body: toUbl(inv), contentType: 'application/xml; charset=utf-8', filename: `factura_${safe(inv.number)}_ubl.xml` };
    case 'facturae': {
      const r = toFacturae(inv);
      return r.error ? r : { body: r.xml, contentType: 'application/xml; charset=utf-8', filename: `factura_${safe(inv.number)}_facturae.xml` };
    }
    case 'cii': {
      const r = toCii(inv);
      return r.error ? r : { body: r.xml, contentType: 'application/xml; charset=utf-8', filename: `factura_${safe(inv.number)}_cii.xml` };
    }
    case 'facturx': {
      const r = await renderFacturX(inv, opts);
      return r.error ? r : { body: r.pdf, contentType: 'application/pdf', filename: `factura_${safe(inv.number)}_facturx.pdf` };
    }
    default:
      return { error: 'invalid_input', field: 'format' };
  }
}

module.exports = { FORMATS, renderEInvoice };
