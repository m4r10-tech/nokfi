/**
 * services/invoicing/xml/ubl.js — sesión 11 (tanda 3): factura en UBL 2.5
 * (sintaxis de la Solución Pública de Facturación Electrónica de la AEAT)
 * con el modelo semántico EN 16931.
 *
 * - Factura y rectificativa que suma → Invoice (380 / 384).
 * - Rectificativa que resta → CreditNote (381) con los importes en positivo.
 * - Retención IRPF → WithholdingTaxTotal; el importe a pagar ya la descuenta.
 * - Recargo de equivalencia → un TaxSubtotal más (esquema "RE") dentro del TaxTotal.
 * Pendiente de revisar cuando la AEAT publique la especificación (CIUS) de la SPFE.
 */

'use strict';

const { el, doc, amt, dec } = require('./builder');
const C = require('./common');
const M = require('../model');

const NS = {
  Invoice: 'urn:oasis:names:specification:ubl:schema:xsd:Invoice-2',
  CreditNote: 'urn:oasis:names:specification:ubl:schema:xsd:CreditNote-2',
  cac: 'urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2',
  cbc: 'urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2'
};
const UBL_VERSION = '2.5';

function party(p, isSupplier) {
  const vat = C.vatId(p);
  return el('cac:Party', null, [
    vat ? el('cbc:EndpointID', { schemeID: p.country === 'ES' ? '9920' : undefined }, vat) : null,
    el('cac:PartyName', null, [el('cbc:Name', null, p.name)]),
    el('cac:PostalAddress', null, [
      el('cbc:StreetName', null, p.address),
      el('cbc:CityName', null, p.city),
      el('cbc:PostalZone', null, p.postal_code),
      el('cbc:CountrySubentity', null, p.province),
      el('cac:Country', null, [el('cbc:IdentificationCode', null, p.country || 'ES')])
    ]),
    vat ? el('cac:PartyTaxScheme', null, [el('cbc:CompanyID', null, vat), el('cac:TaxScheme', null, [el('cbc:ID', null, 'VAT')])]) : null,
    el('cac:PartyLegalEntity', null, [el('cbc:RegistrationName', null, p.name), p.tax_id ? el('cbc:CompanyID', null, p.tax_id) : null]),
    isSupplier && (p.email || p.phone) ? el('cac:Contact', null, [el('cbc:Telephone', null, p.phone), el('cbc:ElectronicMail', null, p.email)]) : null
  ]);
}

function taxCategory(tag, rate, inv, scheme = 'VAT') {
  const cat = C.vatCategory(rate, inv.exemption);
  return el(tag, null, [
    el('cbc:ID', null, cat),
    el('cbc:Percent', null, dec(rate, 2)),
    cat !== 'S' && tag === 'cac:TaxCategory' && inv.exemption ? el('cbc:TaxExemptionReasonCode', null, `ES:${inv.exemption}`) : null,
    cat !== 'S' && tag === 'cac:TaxCategory' && inv.exemption ? el('cbc:TaxExemptionReason', null, C.EXEMPTION_TEXT[inv.exemption]) : null,
    el('cac:TaxScheme', null, [el('cbc:ID', null, scheme)])
  ]);
}

/** Factura (modelo interno) → XML UBL 2.5. */
function toUbl(inv) {
  const k = C.documentKind(inv);
  const s = k.sign;
  const root = k.credit ? 'CreditNote' : 'Invoice';
  const cur = { currencyID: inv.currency || 'EUR' };
  const lineTag = k.credit ? 'cac:CreditNoteLine' : 'cac:InvoiceLine';
  const qtyTag = k.credit ? 'cbc:CreditedQuantity' : 'cbc:InvoicedQuantity';
  const notes = [inv.notes, inv.rectification_reason ? `Motivo de la rectificación: ${inv.rectification_reason}` : '',
    inv.kind === 'F2' ? 'Factura simplificada' : ''].filter(Boolean);
  const payable = inv.total * s;
  const lineTotal = M.r2(inv.lines.reduce((t, l) => t + l.amount, 0)) * s;

  const vatSubtotals = inv.taxes.map(g => el('cac:TaxSubtotal', null, [
    el('cbc:TaxableAmount', cur, amt(g.base * s)),
    el('cbc:TaxAmount', cur, amt(g.vat_amount * s)),
    taxCategory('cac:TaxCategory', g.vat_rate, inv)
  ]));
  const reSubtotals = inv.taxes.filter(g => g.re_amount).map(g => el('cac:TaxSubtotal', null, [
    el('cbc:TaxableAmount', cur, amt(g.base * s)),
    el('cbc:TaxAmount', cur, amt(g.re_amount * s)),
    el('cac:TaxCategory', null, [el('cbc:ID', null, 'S'), el('cbc:Percent', null, dec(g.re_rate, 2)), el('cac:TaxScheme', null, [el('cbc:ID', null, 'RE')])])
  ]));

  const body = [
    el('cbc:UBLVersionID', null, UBL_VERSION),
    el('cbc:CustomizationID', null, C.CUSTOMIZATION_ID),
    el('cbc:ID', null, inv.number),
    el('cbc:IssueDate', null, inv.issue_date),
    !k.credit && inv.due_date && !inv.kind.startsWith('R') ? el('cbc:DueDate', null, inv.due_date) : null,
    el(k.credit ? 'cbc:CreditNoteTypeCode' : 'cbc:InvoiceTypeCode', null, k.type),
    ...notes.map(n => el('cbc:Note', null, n)),
    inv.operation_date ? el('cbc:TaxPointDate', null, inv.operation_date) : null,
    el('cbc:DocumentCurrencyCode', null, inv.currency || 'EUR'),
    inv.rectifies_number ? el('cac:BillingReference', null, [el('cac:InvoiceDocumentReference', null, [
      el('cbc:ID', null, inv.rectifies_number), inv.rectifies_date ? el('cbc:IssueDate', null, inv.rectifies_date) : null
    ])]) : null,
    el('cac:AccountingSupplierParty', null, [party(inv.issuer, true)]),
    inv.customer ? el('cac:AccountingCustomerParty', null, [party(inv.customer, false)]) : null,
    !inv.kind.startsWith('R') ? el('cac:PaymentMeans', null, [
      el('cbc:PaymentMeansCode', null, C.PAYMENT_MEANS[inv.payment_method] || 'ZZZ'),
      k.credit && inv.due_date ? el('cbc:PaymentDueDate', null, inv.due_date) : null,
      inv.iban ? el('cac:PayeeFinancialAccount', null, [el('cbc:ID', null, inv.iban)]) : null
    ]) : null,
    el('cac:TaxTotal', null, [el('cbc:TaxAmount', cur, amt((inv.vat_amount + inv.re_amount) * s)), ...vatSubtotals, ...reSubtotals]),
    inv.irpf_amount ? el('cac:WithholdingTaxTotal', null, [
      el('cbc:TaxAmount', cur, amt(inv.irpf_amount * s)),
      el('cac:TaxSubtotal', null, [
        el('cbc:TaxableAmount', cur, amt(inv.base * s)),
        el('cbc:TaxAmount', cur, amt(inv.irpf_amount * s)),
        el('cac:TaxCategory', null, [el('cbc:ID', null, 'S'), el('cbc:Percent', null, dec(inv.irpf_rate, 2)), el('cac:TaxScheme', null, [el('cbc:ID', null, 'IRPF')])])
      ])
    ]) : null,
    el('cac:LegalMonetaryTotal', null, [
      el('cbc:LineExtensionAmount', cur, amt(lineTotal)),
      el('cbc:TaxExclusiveAmount', cur, amt(inv.base * s)),
      el('cbc:TaxInclusiveAmount', cur, amt((inv.base + inv.vat_amount + inv.re_amount) * s)),
      el('cbc:PayableAmount', cur, amt(payable))
    ]),
    ...inv.lines.map(l => {
      const { gross, allowance } = C.lineParts(l);
      return el(lineTag, null, [
        el('cbc:ID', null, String(l.position)),
        el(qtyTag, { unitCode: C.unitCode(l.unit) }, dec(l.quantity * s, 3)),
        el('cbc:LineExtensionAmount', cur, amt(l.amount * s)),
        allowance ? el('cac:AllowanceCharge', null, [
          el('cbc:ChargeIndicator', null, 'false'),
          el('cbc:AllowanceChargeReason', null, 'Descuento'),
          el('cbc:MultiplierFactorNumeric', null, dec(l.discount_pct, 2)),
          el('cbc:Amount', cur, amt(allowance * s)),
          el('cbc:BaseAmount', cur, amt(gross * s))
        ]) : null,
        el('cac:Item', null, [
          l.description.length > 200 ? el('cbc:Description', null, l.description) : null,
          el('cbc:Name', null, l.description.slice(0, 200)),
          taxCategory('cac:ClassifiedTaxCategory', l.vat_rate, inv)
        ]),
        el('cac:Price', null, [el('cbc:PriceAmount', cur, dec(l.unit_price, 4))])
      ]);
    })
  ];

  return doc(el(root, { xmlns: NS[root], 'xmlns:cac': NS.cac, 'xmlns:cbc': NS.cbc }, body));
}

module.exports = { toUbl, UBL_VERSION };
