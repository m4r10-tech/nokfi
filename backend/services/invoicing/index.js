/**
 * services/invoicing/index.js — sesión 11: lógica de emisión compartida por
 * la app (routes/invoicing.js), la API v1, el MCP y n8n (routes/v1.js).
 * Cada función devuelve { status, body }, como routes/v1.js.
 *
 * livemode: la app y las claves nk_live_ trabajan con facturas reales; las
 * claves nk_test_ con facturas de prueba (numeración TEST-…, sin libro, sin
 * VERI*FACTU). Un modo nunca ve ni toca las facturas del otro (404).
 *
 * Webhooks: invoice.issued, invoice.cancelled, invoice.rejected,
 * invoice.accepted (rechazo deshecho), invoice.paid e invoice.unpaid.
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
const notFound = () => ({ status: 404, body: { error: 'not_found', message: 'No existe esa factura.' } });

/** Factura del modo pedido (real o de prueba) o null. */
function find(license, id, livemode = true) {
  const inv = D.getInvoice(license.id, Number(id));
  return inv && inv.livemode === !!livemode ? inv : null;
}

/** Resumen de la factura para los webhooks. */
const eventData = (inv, extra = {}) => ({
  id: inv.id, number: inv.number, kind: inv.kind, status: inv.status, issue_date: inv.issue_date, due_date: inv.due_date,
  base: inv.base, vat_amount: inv.vat_amount, total: inv.total, currency: inv.currency,
  customer: inv.customer ? { name: inv.customer.name, tax_id: inv.customer.tax_id, email: inv.customer.email } : null,
  customer_status: inv.customer_status, paid: inv.paid, paid_at: inv.paid_at, rectifies_id: inv.rectifies_id, ...extra
});
const emit = (license, type, inv, extra) => require('../webhooks').emit(license.id, type, eventData(inv, extra), { livemode: inv.livemode });

/** Emite una factura (o una rectificativa si body.rectifies_id). */
function issue({ license, body = {}, source = 'web', livemode = true, ip = null }) {
  const profile = D.getBillingProfile(license.id);
  const issuer = D.issuerFromProfile(profile);

  let original = null;
  if (body.rectifies_id !== undefined && body.rectifies_id !== null && body.rectifies_id !== '') {
    original = find(license, body.rectifies_id, livemode);
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
  emit(license, 'invoice.issued', out.invoice);
  return { status: 201, body: out.invoice };
}

function cancel({ license, id, reason, ip = null, livemode = true }) {
  if (!find(license, id, livemode)) return notFound();
  const out = D.cancelInvoice(license.id, Number(id), reason, ip);
  if (out.error) return fail(409, out.error);
  emit(license, 'invoice.cancelled', out.invoice, { cancel_reason: out.invoice.cancel_reason });
  return { status: 200, body: out.invoice };
}

const STATUS_EVENT = { rejected: 'invoice.rejected', accepted: 'invoice.accepted', paid: 'invoice.paid', unpaid: 'invoice.unpaid' };

function setStatus({ license, id, body = {}, ip = null, livemode = true }) {
  if (!find(license, id, livemode)) return notFound();
  const out = D.setCustomerStatus(license.id, Number(id), { status: body.status, reason: body.reason, date: body.date }, ip);
  if (out.error) {
    const { error, ...extra } = out;
    return fail(error === 'invalid_input' ? 400 : 409, error, extra);
  }
  emit(license, STATUS_EVENT[body.status], out.invoice, body.status === 'rejected' ? { reason: out.invoice.customer_status_reason } : {});
  return { status: 200, body: out.invoice };
}

/** Una factura con sus eventos y su registro VERI*FACTU (API). */
function get({ license, id, livemode = true }) {
  const inv = find(license, id, livemode);
  if (!inv) return notFound();
  const vf = require('../../db/verifactu').recordsForInvoice(license.id, inv.id)
    .map(r => ({ id: r.id, type: r.type, status: r.status, hash: r.hash, generated_at: r.generated_at, sent_at: r.sent_at, error_code: r.error_code, error_message: r.error_message, fixed_by: r.fixed_by }));
  return { status: 200, body: { ...inv, events: D.listEvents(license.id, inv.id), verifactu: vf } };
}

/** Listado (API): query { from, to, status, q, limit }. */
function list({ license, query = {}, livemode = true }) {
  const limit = Math.min(Math.max(Number(query.limit) || 100, 1), 500);
  return { status: 200, body: { invoices: D.listInvoices(license.id, { from: query.from, to: query.to, status: query.status, q: query.q, limit, livemode }) } };
}

/** Opciones del PDF: pie del emisor y, si la factura se remite a la AEAT, el QR de VERI*FACTU. */
async function pdfOptions(license, inv) {
  const footer = D.getBillingProfile(license.id).footer;
  return { footer, ...(await require('../verifactu').pdfOptions(license.id, inv)) };
}

const pdfName = (inv) => `factura_${inv.number.replace(/[^\w.-]+/g, '_')}.pdf`;

/** PDF de la factura → { status, file? }. */
async function pdf({ license, id, livemode = true }) {
  const inv = find(license, id, livemode);
  if (!inv) return notFound();
  const body = await require('./pdf').renderInvoicePdf(inv, await pdfOptions(license, inv));
  return { status: 200, file: { body, contentType: 'application/pdf', filename: pdfName(inv) }, invoice: inv };
}

/** Factura en formato electrónico → { status, body?, file? }. */
async function einvoice({ license, id, format, livemode = true }) {
  const inv = find(license, id, livemode);
  if (!inv) return notFound();
  const { renderEInvoice } = require('./xml');
  const r = await renderEInvoice(inv, String(format || 'ubl').toLowerCase(), await pdfOptions(license, inv));
  if (r.error) {
    const { error, ...extra } = r;
    return fail(error === 'invalid_input' ? 400 : 422, error, extra);
  }
  D.addEvent(license.id, inv.id, 'exported', String(format || 'ubl'));
  return { status: 200, file: r };
}

module.exports = { issue, cancel, setStatus, get, list, einvoice, pdf, pdfOptions, pdfName, MESSAGES };
