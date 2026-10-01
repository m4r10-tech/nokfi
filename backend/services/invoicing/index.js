/**
 * services/invoicing/index.js — sesión 11: lógica de emisión compartida por
 * la app (routes/invoicing.js) y, en la 11b, por la API v1, el MCP y n8n.
 * Cada función devuelve { status, body }, como routes/v1.js.
 */

'use strict';

const D = require('../../db/invoicing');
const M = require('./model');

const MESSAGES = {
  issuer_incomplete: 'Faltan datos del emisor para poder facturar (razón social, NIF, dirección, código postal y ciudad).',
  customer_tax_id_required: `Para una factura completa hace falta el NIF del cliente. Sin NIF solo se puede emitir una factura simplificada de hasta ${M.SIMPLIFIED_MAX} € IVA incluido.`,
  customer_not_found: 'No existe ese cliente.',
  original_not_found: 'No existe la factura que quieres rectificar.',
  original_cancelled: 'No se puede rectificar una factura anulada.',
  already_cancelled: 'La factura ya está anulada.',
  has_rectifications: 'La factura tiene rectificativas: no se puede anular.',
  invoice_cancelled: 'La factura está anulada.',
  status_unchanged: 'La factura ya tiene ese estado.',
  status_conflict: 'Ese cambio de estado no es posible: primero revierte el estado anterior.',
  customer_incomplete: 'Faltan datos del cliente para este formato (NIF y dirección completa).',
  format_unsupported: 'Este formato no admite el recargo de equivalencia: usa UBL o Facturae.'
};

const fail = (status, error, extra = {}) => ({ status, body: { error, message: MESSAGES[error] || 'Dato no válido.', ...extra } });

/** Emite una factura (o una rectificativa si body.rectifies_id). */
function issue({ license, body = {}, source = 'web', livemode = true, ip = null }) {
  const profile = D.getBillingProfile(license.id);
  const issuer = D.issuerFromProfile(profile);

  let original = null;
  if (body.rectifies_id !== undefined && body.rectifies_id !== null && body.rectifies_id !== '') {
    original = D.getInvoice(license.id, Number(body.rectifies_id));
    if (!original) return fail(404, 'original_not_found');
    if (original.status !== 'issued') return fail(409, 'original_cancelled');
  }

  const c = D.resolveCustomer(license.id, body);
  if (c.error) return fail(404, c.error);
  // Una rectificativa sin cliente explícito va al cliente de la original.
  const customer = c.customer || (original ? original.customer : null);
  const surcharge = body.equivalence_surcharge !== undefined ? !!body.equivalence_surcharge : !!c.surcharge;

  const built = M.buildInvoice({ ...body, equivalence_surcharge: surcharge }, {
    issuer, customer, original,
    paymentTermsDays: profile.payment_terms_days,
    issuerIban: profile.iban,
    defaultLang: profile.invoice_lang
  });
  if (built.error) {
    const { error, ...extra } = built;
    return fail(error === 'invalid_input' ? 400 : 422, error, extra);
  }

  let customerId = c.customer_id || (original && !c.customer ? original.customer_id : null);
  if (c.save && livemode) customerId = D.rememberCustomer(license.id, customer, surcharge) || customerId;

  const out = D.issueInvoice(license.id, built.invoice, { customer_id: customerId, source, livemode, ip });
  if (out.error) {
    const { error, ...extra } = out;
    return fail(400, error, extra);
  }
  return { status: 201, body: out.invoice };
}

function cancel({ license, id, reason, ip = null }) {
  const out = D.cancelInvoice(license.id, Number(id), reason, ip);
  if (!out) return fail(404, 'not_found');
  if (out.error) return fail(409, out.error);
  return { status: 200, body: out.invoice };
}

function setStatus({ license, id, body = {}, ip = null }) {
  const out = D.setCustomerStatus(license.id, Number(id), { status: body.status, reason: body.reason, date: body.date }, ip);
  if (!out) return fail(404, 'not_found');
  if (out.error) {
    const { error, ...extra } = out;
    return fail(error === 'invalid_input' ? 400 : 409, error, extra);
  }
  return { status: 200, body: out.invoice };
}

/** Opciones del PDF: pie del emisor y, si la factura se remite a la AEAT, el QR de VERI*FACTU. */
async function pdfOptions(license, inv) {
  const footer = D.getBillingProfile(license.id).footer;
  return { footer, ...(await require('../verifactu').pdfOptions(license.id, inv)) };
}

const pdfName = (inv) => `factura_${inv.number.replace(/[^\w.-]+/g, '_')}.pdf`;

/** PDF de la factura → { status, file? }. */
async function pdf({ license, id }) {
  const inv = D.getInvoice(license.id, Number(id));
  if (!inv) return fail(404, 'not_found');
  const body = await require('./pdf').renderInvoicePdf(inv, await pdfOptions(license, inv));
  return { status: 200, file: { body, contentType: 'application/pdf', filename: pdfName(inv) }, invoice: inv };
}

/** Factura en formato electrónico → { status, body?, file? }. */
async function einvoice({ license, id, format }) {
  const inv = D.getInvoice(license.id, Number(id));
  if (!inv) return fail(404, 'not_found');
  const { renderEInvoice } = require('./xml');
  const r = await renderEInvoice(inv, String(format || 'ubl').toLowerCase(), await pdfOptions(license, inv));
  if (r.error) {
    const { error, ...extra } = r;
    return fail(error === 'invalid_input' ? 400 : 422, error, extra);
  }
  D.addEvent(license.id, inv.id, 'exported', String(format || 'ubl'));
  return { status: 200, file: r };
}

module.exports = { issue, cancel, setStatus, einvoice, pdf, pdfOptions, pdfName, MESSAGES };
