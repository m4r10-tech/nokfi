/**
 * Facturas electrónicas ESTRUCTURADAS → libro, sin IA (sesión 4).
 *
 * Con la factura electrónica B2B obligatoria (Ley Crea y Crece, RD 238/2026)
 * cada vez más facturas llegan en XML. Leerlas es EXACTO y gratis: no hace
 * falta IA ni se gasta cuota. Formatos:
 *   - Facturae 3.2.x (España; .xml o firmada .xsig)
 *   - UBL 2.1 Invoice / CreditNote (Peppol, EN 16931)
 *   - UN/CEFACT CII (Factur-X / ZUGFeRD / XRechnung), también EMBEBIDO en PDF
 *
 * Devuelve la misma forma que la extracción por IA (normalizeInvoices del
 * backend) para reutilizar la tabla de revisión.
 */

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const num = (v) => { const n = Number(String(v ?? '').trim().replace(',', '.')); return Number.isFinite(n) ? n : 0; };

// Búsqueda por nombre local, sin depender de prefijos de namespace.
const all = (node, name) => (node ? Array.from(node.getElementsByTagNameNS('*', name)) : []);
const first = (node, name) => all(node, name)[0] || null;
const text = (node, name) => (first(node, name)?.textContent || '').trim();
const path = (node, ...names) => names.reduce((n, name) => (n ? first(n, name) : null), node);

function isoDate(s) {
  const v = String(s || '').trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 10);
  if (/^\d{8}$/.test(v)) return `${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6, 8)}`; // CII formato 102
  return '';
}

function cleanNif(s) {
  return String(s || '').toUpperCase().replace(/[\s-]/g, '').replace(/^ES(?=[0-9A-Z]{9}$)/, '');
}

function withCheck(inv) {
  const out = {
    is_invoice: true, due_date: '', concept: '', category: '', irpf_rate: 0, irpf_amount: 0, vat_rate: 0,
    ...inv,
    base: r2(inv.base), vat_amount: r2(inv.vat_amount), irpf_amount: r2(inv.irpf_amount || 0), total: r2(inv.total)
  };
  out.check_ok = Math.abs(out.base + out.vat_amount - out.irpf_amount - out.total) <= 0.05;
  out.source_format = inv.source_format;
  return out;
}

/* ── Facturae 3.2.x ── */
function facturaeParty(party) {
  const nif = text(path(party, 'TaxIdentification'), 'TaxIdentificationNumber');
  const legal = first(party, 'LegalEntity');
  let name = legal ? text(legal, 'CorporateName') : '';
  if (!name) {
    const ind = first(party, 'Individual');
    name = [text(ind, 'Name'), text(ind, 'FirstSurname'), text(ind, 'SecondSurname')].filter(Boolean).join(' ');
  }
  return { name, nif: cleanNif(nif) };
}

function parseFacturae(doc, fileName) {
  const seller = facturaeParty(path(doc, 'Parties', 'SellerParty'));
  const buyer = facturaeParty(path(doc, 'Parties', 'BuyerParty'));
  return all(doc, 'Invoice').map((inv, i) => {
    const header = first(inv, 'InvoiceHeader');
    const number = [text(header, 'InvoiceSeriesCode'), text(header, 'InvoiceNumber')].filter(Boolean).join('-');
    const totals = first(inv, 'InvoiceTotals');
    const outTaxes = all(first(inv, 'TaxesOutputs'), 'Tax');
    const vatRate = outTaxes.length ? num(text(outTaxes[0], 'TaxRate')) : 0;
    const withheld = all(first(inv, 'TaxesWithheld'), 'Tax');
    const irpfRate = withheld.length ? num(text(withheld[0], 'TaxRate')) : 0;
    const lines = all(first(inv, 'Items'), 'InvoiceLine').map(l => text(l, 'ItemDescription')).filter(Boolean);
    return withCheck({
      file_name: all(doc, 'Invoice').length > 1 ? `${fileName} (${i + 1})` : fileName,
      source_format: 'Facturae',
      issuer_name: seller.name, issuer_nif: seller.nif, recipient_name: buyer.name, recipient_nif: buyer.nif,
      invoice_number: number,
      invoice_date: isoDate(text(first(inv, 'InvoiceIssueData'), 'IssueDate')),
      due_date: isoDate(text(first(inv, 'PaymentDetails'), 'InstallmentDueDate')),
      concept: lines.slice(0, 3).join('; ').slice(0, 200),
      base: num(text(totals, 'TotalGrossAmountBeforeTaxes')),
      vat_rate: vatRate,
      vat_amount: num(text(totals, 'TotalTaxOutputs')),
      irpf_rate: irpfRate,
      irpf_amount: num(text(totals, 'TotalTaxesWithheld')),
      total: num(text(totals, 'InvoiceTotal'))
    });
  });
}

/* ── UBL 2.1 ── */
function ublParty(partyWrap) {
  const party = first(partyWrap, 'Party');
  const nif = text(first(party, 'PartyTaxScheme'), 'CompanyID') || text(first(party, 'PartyLegalEntity'), 'CompanyID') || text(first(party, 'PartyIdentification'), 'ID');
  const name = text(first(party, 'PartyLegalEntity'), 'RegistrationName') || text(first(party, 'PartyName'), 'Name');
  return { name, nif: cleanNif(nif) };
}

function parseUbl(doc, fileName) {
  const root = doc.documentElement;
  const credit = root.localName === 'CreditNote';
  const sign = credit ? -1 : 1;
  const direct = (name) => Array.from(root.childNodes).find(n => n.localName === name);
  const seller = ublParty(first(root, 'AccountingSupplierParty'));
  const buyer = ublParty(first(root, 'AccountingCustomerParty'));
  const monetary = first(root, 'LegalMonetaryTotal');
  const taxTotal = direct('TaxTotal') || first(root, 'TaxTotal');
  const withholding = first(root, 'WithholdingTaxTotal');
  const lines = all(root, credit ? 'CreditNoteLine' : 'InvoiceLine').map(l => text(first(l, 'Item'), 'Name')).filter(Boolean);
  const vatAmount = num(taxTotal ? (Array.from(taxTotal.childNodes).find(n => n.localName === 'TaxAmount')?.textContent) : 0);
  return [withCheck({
    file_name: fileName, source_format: 'UBL',
    issuer_name: seller.name, issuer_nif: seller.nif, recipient_name: buyer.name, recipient_nif: buyer.nif,
    invoice_number: direct('ID')?.textContent?.trim() || '',
    invoice_date: isoDate(direct('IssueDate')?.textContent),
    due_date: isoDate(direct('DueDate')?.textContent || text(first(root, 'PaymentMeans'), 'PaymentDueDate')),
    concept: lines.slice(0, 3).join('; ').slice(0, 200),
    base: sign * num(text(monetary, 'TaxExclusiveAmount')),
    vat_rate: num(text(first(taxTotal, 'TaxCategory'), 'Percent')),
    vat_amount: sign * vatAmount,
    irpf_rate: withholding ? num(text(first(withholding, 'TaxCategory'), 'Percent')) : 0,
    irpf_amount: withholding ? sign * num(Array.from(withholding.childNodes).find(n => n.localName === 'TaxAmount')?.textContent) : 0,
    total: sign * num(text(monetary, 'PayableAmount') || text(monetary, 'TaxInclusiveAmount'))
  })];
}

/* ── UN/CEFACT CII (Factur-X / ZUGFeRD / XRechnung) ── */
function ciiParty(p) {
  const nif = all(p, 'SpecifiedTaxRegistration').map(r => text(r, 'ID')).find(Boolean) || '';
  return { name: text(p, 'Name'), nif: cleanNif(nif) };
}

function parseCii(doc, fileName) {
  const docNode = first(doc, 'ExchangedDocument');
  const agreement = first(doc, 'ApplicableHeaderTradeAgreement');
  const settlement = first(doc, 'ApplicableHeaderTradeSettlement');
  const sum = first(settlement, 'SpecifiedTradeSettlementHeaderMonetarySummation');
  const tax = first(settlement, 'ApplicableTradeTax');
  const seller = ciiParty(first(agreement, 'SellerTradeParty'));
  const buyer = ciiParty(first(agreement, 'BuyerTradeParty'));
  const base = num(text(sum, 'TaxBasisTotalAmount'));
  const vat = num(text(sum, 'TaxTotalAmount'));
  const total = num(text(sum, 'DuePayableAmount') || text(sum, 'GrandTotalAmount'));
  const credit = text(docNode, 'TypeCode') === '381';
  const s = credit ? -1 : 1;
  return [withCheck({
    file_name: fileName, source_format: 'Factur-X',
    issuer_name: seller.name, issuer_nif: seller.nif, recipient_name: buyer.name, recipient_nif: buyer.nif,
    invoice_number: text(docNode, 'ID'),
    invoice_date: isoDate(text(first(docNode, 'IssueDateTime'), 'DateTimeString')),
    due_date: isoDate(text(first(first(settlement, 'SpecifiedTradePaymentTerms'), 'DueDateDateTime'), 'DateTimeString')),
    concept: all(doc, 'SpecifiedTradeProduct').map(p => text(p, 'Name')).filter(Boolean).slice(0, 3).join('; ').slice(0, 200),
    base: s * base, vat_rate: num(text(tax, 'RateApplicablePercent')), vat_amount: s * vat,
    // Retención (IRPF) si la hubiera: diferencia entre base+IVA y lo que hay que pagar.
    irpf_amount: s * r2(Math.max(0, base + vat - total)),
    total: s * total
  })];
}

/** Texto XML → facturas (o null si no es un formato soportado). */
export function parseEInvoiceXml(xml, fileName, parser = typeof DOMParser !== 'undefined' ? new DOMParser() : null) {
  if (!parser) return null;
  const doc = parser.parseFromString(String(xml).replace(/^﻿/, ''), 'application/xml');
  if (!doc || doc.getElementsByTagName('parsererror').length) return null;
  const root = doc.documentElement?.localName;
  if (root === 'Facturae' || first(doc, 'Facturae')) return parseFacturae(first(doc, 'Facturae') || doc, fileName);
  if (root === 'Invoice' || root === 'CreditNote') return parseUbl(doc, fileName);
  if (root === 'CrossIndustryInvoice') return parseCii(doc, fileName);
  return null;
}

const EMBEDDED_NAMES = /^(factur-x|zugferd-invoice|xrechnung|order-x)\.xml$/i;

/** PDF con XML embebido (Factur-X / ZUGFeRD) → facturas, o null. */
export async function parseEmbeddedPdfInvoice(file) {
  await import('./pdfExtract'); // configura el worker de pdf.js
  const pdfjs = await import('pdfjs-dist');
  const pdf = await pdfjs.getDocument({ data: await file.arrayBuffer(), isEvalSupported: false }).promise;
  const attachments = await pdf.getAttachments();
  if (!attachments) return null;
  const hit = Object.values(attachments).find(a => EMBEDDED_NAMES.test(a.filename || '')) || Object.values(attachments).find(a => /\.xml$/i.test(a.filename || ''));
  if (!hit) return null;
  return parseEInvoiceXml(new TextDecoder('utf-8').decode(hit.content), file.name);
}
