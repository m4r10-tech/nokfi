/**
 * services/invoicing/xml/cii.js — sesión 11 (tanda 3): factura en UN/CEFACT
 * CII (Cross Industry Invoice) con el perfil EN 16931 de Factur-X 1.0 /
 * ZUGFeRD 2.x. Es el XML que va dentro del PDF/A-3 de Factur-X.
 *
 * - Rectificativa que resta → 381 (nota de crédito) con los importes en positivo.
 * - Retención IRPF: EN 16931 no la recoge; el importe a pagar ya la descuenta
 *   y se explica en una nota.
 * - Recargo de equivalencia: no tiene representación en CII → error.
 */

'use strict';

const { el, doc, amt, dec, EMPTY } = require('./builder');
const C = require('./common');
const M = require('../model');

const NS = {
  rsm: 'urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100',
  ram: 'urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100',
  qdt: 'urn:un:unece:uncefact:data:standard:QualifiedDataType:100',
  udt: 'urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100'
};
const GUIDELINE = 'urn:cen.eu:en16931:2017';

const date102 = (iso) => iso.replace(/-/g, '');

function party(tag, p) {
  const vat = C.vatId(p);
  return el(tag, null, [
    el('ram:Name', null, p.name),
    p.tax_id ? el('ram:SpecifiedLegalOrganization', null, [el('ram:ID', null, p.tax_id)]) : null,
    el('ram:PostalTradeAddress', null, [
      el('ram:PostcodeCode', null, p.postal_code),
      el('ram:LineOne', null, p.address),
      el('ram:CityName', null, p.city),
      el('ram:CountryID', null, p.country || 'ES'),
      el('ram:CountrySubDivisionName', null, p.province)
    ]),
    p.email ? el('ram:URIUniversalCommunication', null, [el('ram:URIID', { schemeID: 'EM' }, p.email)]) : null,
    vat ? el('ram:SpecifiedTaxRegistration', null, [el('ram:ID', { schemeID: 'VA' }, vat)]) : null
  ]);
}

/** Factura → XML CII (Factur-X EN 16931), o { error, field }. */
function toCii(inv) {
  if (inv.re_amount) return { error: 'format_unsupported', field: 'equivalence_surcharge' };
  const k = C.documentKind(inv);
  const s = k.sign;
  const cur = inv.currency || 'EUR';
  const notes = [
    inv.notes,
    inv.rectification_reason ? `Motivo de la rectificación: ${inv.rectification_reason}` : '',
    inv.irpf_amount ? `Retención IRPF ${dec(inv.irpf_rate, 2)} %: ${amt(inv.irpf_amount)} ${cur}. Importe a pagar: ${amt(inv.total)} ${cur}.` : '',
    inv.kind === 'F2' ? 'Factura simplificada' : ''
  ].filter(Boolean);
  const lineTotal = M.r2(inv.lines.reduce((t, l) => t + l.amount, 0)) * s;

  const tax = (g) => {
    const cat = C.vatCategory(g.vat_rate, inv.exemption);
    return el('ram:ApplicableTradeTax', null, [
      el('ram:CalculatedAmount', null, amt(g.vat_amount * s)),
      el('ram:TypeCode', null, 'VAT'),
      cat !== 'S' ? el('ram:ExemptionReason', null, C.EXEMPTION_TEXT[inv.exemption]) : null,
      el('ram:BasisAmount', null, amt(g.base * s)),
      el('ram:CategoryCode', null, cat),
      el('ram:RateApplicablePercent', null, dec(g.vat_rate, 2))
    ]);
  };

  const lines = inv.lines.map(l => {
    const { gross, allowance } = C.lineParts(l);
    const cat = C.vatCategory(l.vat_rate, inv.exemption);
    return el('ram:IncludedSupplyChainTradeLineItem', null, [
      el('ram:AssociatedDocumentLineDocument', null, [el('ram:LineID', null, String(l.position))]),
      el('ram:SpecifiedTradeProduct', null, [el('ram:Name', null, l.description)]),
      el('ram:SpecifiedLineTradeAgreement', null, [el('ram:NetPriceProductTradePrice', null, [el('ram:ChargeAmount', null, dec(l.unit_price, 4))])]),
      el('ram:SpecifiedLineTradeDelivery', null, [el('ram:BilledQuantity', { unitCode: C.unitCode(l.unit) }, dec(l.quantity * s, 3))]),
      el('ram:SpecifiedLineTradeSettlement', null, [
        el('ram:ApplicableTradeTax', null, [el('ram:TypeCode', null, 'VAT'), el('ram:CategoryCode', null, cat), el('ram:RateApplicablePercent', null, dec(l.vat_rate, 2))]),
        allowance ? el('ram:SpecifiedTradeAllowanceCharge', null, [
          el('ram:ChargeIndicator', null, [el('udt:Indicator', null, 'false')]),
          el('ram:CalculationPercent', null, dec(l.discount_pct, 2)),
          el('ram:BasisAmount', null, amt(gross * s)),
          el('ram:ActualAmount', null, amt(allowance * s)),
          el('ram:Reason', null, 'Descuento')
        ]) : null,
        el('ram:SpecifiedTradeSettlementLineMonetarySummation', null, [el('ram:LineTotalAmount', null, amt(l.amount * s))])
      ])
    ]);
  });

  return {
    xml: doc(el('rsm:CrossIndustryInvoice', { 'xmlns:rsm': NS.rsm, 'xmlns:ram': NS.ram, 'xmlns:qdt': NS.qdt, 'xmlns:udt': NS.udt }, [
      el('rsm:ExchangedDocumentContext', null, [el('ram:GuidelineSpecifiedDocumentContextParameter', null, [el('ram:ID', null, GUIDELINE)])]),
      el('rsm:ExchangedDocument', null, [
        el('ram:ID', null, inv.number),
        el('ram:TypeCode', null, k.type),
        el('ram:IssueDateTime', null, [el('udt:DateTimeString', { format: '102' }, date102(inv.issue_date))]),
        ...notes.map(n => el('ram:IncludedNote', null, [el('ram:Content', null, n)]))
      ]),
      el('rsm:SupplyChainTradeTransaction', null, [
        ...lines,
        el('ram:ApplicableHeaderTradeAgreement', null, [
          party('ram:SellerTradeParty', inv.issuer),
          inv.customer ? party('ram:BuyerTradeParty', inv.customer) : el('ram:BuyerTradeParty', null, [el('ram:Name', null, 'Consumidor final')])
        ]),
        el('ram:ApplicableHeaderTradeDelivery', null, inv.operation_date
          ? [el('ram:ActualDeliverySupplyChainEvent', null, [el('ram:OccurrenceDateTime', null, [el('udt:DateTimeString', { format: '102' }, date102(inv.operation_date))])])]
          : EMPTY),
        el('ram:ApplicableHeaderTradeSettlement', null, [
          el('ram:InvoiceCurrencyCode', null, cur),
          !inv.kind.startsWith('R') ? el('ram:SpecifiedTradeSettlementPaymentMeans', null, [
            el('ram:TypeCode', null, C.PAYMENT_MEANS[inv.payment_method] || 'ZZZ'),
            inv.iban && inv.payment_method === 'transfer' ? el('ram:PayeePartyCreditorFinancialAccount', null, [el('ram:IBANID', null, inv.iban)]) : null
          ]) : null,
          ...inv.taxes.map(tax),
          inv.due_date && !inv.kind.startsWith('R') ? el('ram:SpecifiedTradePaymentTerms', null, [el('ram:DueDateDateTime', null, [el('udt:DateTimeString', { format: '102' }, date102(inv.due_date))])]) : null,
          el('ram:SpecifiedTradeSettlementHeaderMonetarySummation', null, [
            el('ram:LineTotalAmount', null, amt(lineTotal)),
            el('ram:TaxBasisTotalAmount', null, amt(inv.base * s)),
            el('ram:TaxTotalAmount', { currencyID: cur }, amt(inv.vat_amount * s)),
            el('ram:GrandTotalAmount', null, amt((inv.base + inv.vat_amount) * s)),
            el('ram:DuePayableAmount', null, amt(inv.total * s))
          ]),
          inv.rectifies_number ? el('ram:InvoiceReferencedDocument', null, [
            el('ram:IssuerAssignedID', null, inv.rectifies_number),
            inv.rectifies_date ? el('ram:FormattedIssueDateTime', null, [el('qdt:DateTimeString', { format: '102' }, date102(inv.rectifies_date))]) : null
          ]) : null
        ])
      ])
    ]))
  };
}

module.exports = { toCii, GUIDELINE };
