/**
 * services/invoicing/xml/facturae.js — sesión 11 (tanda 3): factura en
 * Facturae 3.2.2 (formato español; obligatorio con las Administraciones y
 * admitido en B2B). Sin firmar: la firma XAdES necesita el certificado del
 * emisor (pendiente de decidir quién firma; ver docs/sesion11-plan-legal.md).
 *
 * Requiere un cliente con NIF y dirección completa (BuyerParty es obligatorio).
 */

'use strict';

const { el, doc, amt, dec } = require('./builder');
const C = require('./common');

const NS = 'http://www.facturae.gob.es/formato/Versiones/Facturaev3_2_2.xml';

// Provincia por los dos primeros dígitos del código postal (INE).
const PROVINCES = ['', 'Álava', 'Albacete', 'Alicante', 'Almería', 'Ávila', 'Badajoz', 'Illes Balears', 'Barcelona', 'Burgos', 'Cáceres',
  'Cádiz', 'Castellón', 'Ciudad Real', 'Córdoba', 'A Coruña', 'Cuenca', 'Girona', 'Granada', 'Guadalajara', 'Gipuzkoa', 'Huelva', 'Huesca',
  'Jaén', 'León', 'Lleida', 'La Rioja', 'Lugo', 'Madrid', 'Málaga', 'Murcia', 'Navarra', 'Ourense', 'Asturias', 'Palencia', 'Las Palmas',
  'Pontevedra', 'Salamanca', 'S.C. Tenerife', 'Cantabria', 'Segovia', 'Sevilla', 'Soria', 'Tarragona', 'Teruel', 'Toledo', 'Valencia',
  'Valladolid', 'Bizkaia', 'Zamora', 'Zaragoza', 'Ceuta', 'Melilla'];
const provinceOf = (postalCode) => PROVINCES[Number(String(postalCode).slice(0, 2))] || '';

// ISO 3166 alfa-2 → alfa-3 (UE, EEE y socios habituales).
const ISO3 = {
  ES: 'ESP', PT: 'PRT', FR: 'FRA', IT: 'ITA', DE: 'DEU', PL: 'POL', NL: 'NLD', BE: 'BEL', LU: 'LUX', IE: 'IRL', AT: 'AUT', DK: 'DNK',
  SE: 'SWE', FI: 'FIN', GR: 'GRC', CZ: 'CZE', SK: 'SVK', SI: 'SVN', HU: 'HUN', RO: 'ROU', BG: 'BGR', HR: 'HRV', EE: 'EST', LV: 'LVA',
  LT: 'LTU', CY: 'CYP', MT: 'MLT', GB: 'GBR', CH: 'CHE', NO: 'NOR', IS: 'ISL', LI: 'LIE', AD: 'AND', MC: 'MCO', MA: 'MAR', US: 'USA',
  CA: 'CAN', MX: 'MEX', AR: 'ARG', CO: 'COL', CL: 'CHL', PE: 'PER', BR: 'BRA', UY: 'URY', VE: 'VEN', EC: 'ECU', CN: 'CHN', JP: 'JPN', IN: 'IND', AU: 'AUS'
};
const EU = new Set(['PT', 'FR', 'IT', 'DE', 'PL', 'NL', 'BE', 'LU', 'IE', 'AT', 'DK', 'SE', 'FI', 'GR', 'CZ', 'SK', 'SI', 'HU', 'RO', 'BG', 'HR', 'EE', 'LV', 'LT', 'CY', 'MT']);

// Motivo de rectificación (ReasonCode) según el tipo R1-R5.
const REASONS = {
  '16': 'Base imponible',
  '83': 'Base imponible modificada por descuentos y bonificaciones',
  '85': 'Base imponible modificada cuotas repercutidas no satisfechas. Auto de declaración de concurso'
};
const REASON_BY_KIND = { R1: '83', R2: '85', R3: '16', R4: '16', R5: '16' };

// Medio de pago (Facturae): 04 transferencia, 02 recibo domiciliado, 19 tarjeta, 01 contado, 13 especiales.
const PAYMENT_MEANS = { transfer: '04', direct_debit: '02', card: '19', cash: '01', other: '13' };

const cut = (s, n) => String(s || '').slice(0, n);

/** Lo que le falta a una parte para Facturae (vacío = vale). */
function partyMissing(p) {
  const miss = [];
  if (!p?.name) miss.push('name');
  if (!p?.tax_id) miss.push('tax_id');
  if (!p?.address) miss.push('address');
  if (!p?.city) miss.push('city');
  if (p?.country === 'ES' ? !/^\d{5}$/.test(p?.postal_code || '') : !p?.postal_code) miss.push('postal_code');
  if (p && !ISO3[p.country || 'ES']) miss.push('country');
  return miss;
}

function party(p) {
  const country = p.country || 'ES';
  const residence = country === 'ES' ? 'R' : EU.has(country) ? 'U' : 'E';
  // Persona física: NIF que empieza por número o NIE (X, Y, Z); el resto, jurídica.
  const physical = country === 'ES' && /^[0-9XYZKLM]/.test(p.tax_id);
  const words = p.name.trim().split(/\s+/);
  const address = country === 'ES'
    ? el('AddressInSpain', null, [el('Address', null, cut(p.address, 80)), el('PostCode', null, p.postal_code), el('Town', null, cut(p.city, 50)),
      el('Province', null, cut(p.province || provinceOf(p.postal_code) || p.city, 20)), el('CountryCode', null, 'ESP')])
    : el('OverseasAddress', null, [el('Address', null, cut(p.address, 80)), el('PostCodeAndTown', null, cut(`${p.postal_code} ${p.city}`, 50)),
      el('Province', null, cut(p.province || p.city, 20)), el('CountryCode', null, ISO3[country])]);
  const contact = p.email || p.phone ? el('ContactDetails', null, [el('Telephone', null, cut(p.phone, 15)), el('ElectronicMail', null, cut(p.email, 60))]) : null;
  const who = physical && words.length >= 2
    ? el('Individual', null, [el('Name', null, cut(words[0], 40)), el('FirstSurname', null, cut(words[1], 40)), words.length > 2 ? el('SecondSurname', null, cut(words.slice(2).join(' '), 40)) : null, address, contact])
    : el('LegalEntity', null, [el('CorporateName', null, cut(p.name, 80)), address, contact]);
  return [
    el('TaxIdentification', null, [el('PersonTypeCode', null, physical ? 'F' : 'J'), el('ResidenceTypeCode', null, residence), el('TaxIdentificationNumber', null, cut(country === 'ES' ? p.tax_id : C.vatId(p), 30))]),
    who
  ];
}

/** Factura → Facturae 3.2.2, o { error, fields } si faltan datos. */
function toFacturae(inv) {
  const issuerMiss = partyMissing(inv.issuer);
  if (issuerMiss.length) return { error: 'issuer_incomplete', fields: issuerMiss };
  const customerMiss = partyMissing(inv.customer);
  if (customerMiss.length) return { error: 'customer_incomplete', fields: customerMiss };

  const [seriesYear, seq] = inv.number.split('-');
  const rect = inv.kind.startsWith('R');
  const reason = REASON_BY_KIND[inv.kind] || '16';
  const taxPeriod = { start: `${(inv.rectifies_date || inv.issue_date).slice(0, 7)}-01` };
  const end = new Date(Date.UTC(Number(taxPeriod.start.slice(0, 4)), Number(taxPeriod.start.slice(5, 7)), 0)).toISOString().slice(0, 10);
  const [origSeries, origSeq] = String(inv.rectifies_number || '').split('-');
  const notes = [inv.notes, inv.exemption ? C.EXEMPTION_TEXT[inv.exemption] : ''].filter(Boolean).join('\n');
  const due = inv.due_date || inv.issue_date;

  const taxOut = (g) => [
    el('TaxTypeCode', null, '01'),
    el('TaxRate', null, amt(g.vat_rate)),
    el('TaxableBase', null, [el('TotalAmount', null, amt(g.base))]),
    el('TaxAmount', null, [el('TotalAmount', null, amt(g.vat_amount))]),
    g.re_rate ? el('EquivalenceSurcharge', null, amt(g.re_rate)) : null,
    g.re_rate ? el('EquivalenceSurchargeAmount', null, [el('TotalAmount', null, amt(g.re_amount))]) : null
  ];

  const invoice = el('Invoice', null, [
    el('InvoiceHeader', null, [
      el('InvoiceNumber', null, seq),
      el('InvoiceSeriesCode', null, seriesYear),
      el('InvoiceDocumentType', null, inv.kind === 'F2' || inv.kind === 'R5' ? 'FA' : 'FC'),
      el('InvoiceClass', null, rect ? 'OR' : 'OO'),
      rect ? el('Corrective', null, [
        el('InvoiceNumber', null, origSeq),
        el('InvoiceSeriesCode', null, origSeries),
        el('ReasonCode', null, reason),
        el('ReasonDescription', null, REASONS[reason]),
        el('TaxPeriod', null, [el('StartDate', null, taxPeriod.start), el('EndDate', null, end)]),
        el('CorrectionMethod', null, '02'),
        el('CorrectionMethodDescription', null, 'Rectificación por diferencias'),
        el('AdditionalReasonDescription', null, cut(inv.rectification_reason, 2500)),
        inv.rectifies_date ? el('InvoiceIssueDate', null, inv.rectifies_date) : null
      ]) : null
    ]),
    el('InvoiceIssueData', null, [
      el('IssueDate', null, inv.issue_date),
      inv.operation_date ? el('OperationDate', null, inv.operation_date) : null,
      el('InvoiceCurrencyCode', null, 'EUR'),
      el('TaxCurrencyCode', null, 'EUR'),
      el('LanguageName', null, ['es', 'en', 'fr', 'it', 'de', 'pl'].includes(inv.lang) ? inv.lang : 'es')
    ]),
    el('TaxesOutputs', null, inv.taxes.map(g => el('Tax', null, taxOut(g)))),
    inv.irpf_amount ? el('TaxesWithheld', null, [el('Tax', null, [
      el('TaxTypeCode', null, '04'), el('TaxRate', null, amt(inv.irpf_rate)),
      el('TaxableBase', null, [el('TotalAmount', null, amt(inv.base))]), el('TaxAmount', null, [el('TotalAmount', null, amt(inv.irpf_amount))])
    ])]) : null,
    el('InvoiceTotals', null, [
      el('TotalGrossAmount', null, amt(inv.base)),
      el('TotalGrossAmountBeforeTaxes', null, amt(inv.base)),
      el('TotalTaxOutputs', null, amt(inv.vat_amount + inv.re_amount)),
      el('TotalTaxesWithheld', null, amt(inv.irpf_amount)),
      // InvoiceTotal = base + cuotas − retenciones (definición del XSD); sin anticipos ni subvenciones.
      el('InvoiceTotal', null, amt(inv.total)),
      el('TotalOutstandingAmount', null, amt(inv.total)),
      el('TotalExecutableAmount', null, amt(inv.total))
    ]),
    el('Items', null, inv.lines.map(l => {
      const { gross: lineGross, allowance } = C.lineParts(l);
      const g = inv.taxes.find(x => x.vat_rate === l.vat_rate) || { re_rate: 0 };
      const zero = Number(l.vat_rate) === 0 && inv.exemption;
      return el('InvoiceLine', null, [
        el('SequenceNumber', null, String(l.position)),
        el('ItemDescription', null, cut(l.description, 2500)),
        el('Quantity', null, dec(l.quantity, 3)),
        el('UnitPriceWithoutTax', null, dec(l.unit_price, 8)),
        el('TotalCost', null, dec(lineGross, 8)),
        allowance ? el('DiscountsAndRebates', null, [el('Discount', null, [
          el('DiscountReason', null, 'Descuento'), el('DiscountRate', null, dec(l.discount_pct, 4)), el('DiscountAmount', null, dec(allowance, 8))
        ])]) : null,
        el('GrossAmount', null, dec(l.amount, 8)),
        inv.irpf_amount ? el('TaxesWithheld', null, [el('Tax', null, [
          el('TaxTypeCode', null, '04'), el('TaxRate', null, amt(inv.irpf_rate)),
          el('TaxableBase', null, [el('TotalAmount', null, amt(l.amount))]), el('TaxAmount', null, [el('TotalAmount', null, amt(l.amount * inv.irpf_rate / 100))])
        ])]) : null,
        el('TaxesOutputs', null, [el('Tax', null, [
          el('TaxTypeCode', null, '01'), el('TaxRate', null, amt(l.vat_rate)),
          el('TaxableBase', null, [el('TotalAmount', null, amt(l.amount))]),
          el('TaxAmount', null, [el('TotalAmount', null, amt(l.amount * l.vat_rate / 100))]),
          g.re_rate ? el('EquivalenceSurcharge', null, amt(l.re_rate)) : null,
          g.re_rate ? el('EquivalenceSurchargeAmount', null, [el('TotalAmount', null, amt(l.amount * l.re_rate / 100))]) : null
        ])]),
        zero ? el('SpecialTaxableEvent', null, [
          el('SpecialTaxableEventCode', null, inv.exemption.startsWith('N') ? '02' : '01'),
          el('SpecialTaxableEventReason', null, C.EXEMPTION_TEXT[inv.exemption])
        ]) : null
      ]);
    })),
    !rect ? el('PaymentDetails', null, [el('Installment', null, [
      el('InstallmentDueDate', null, due),
      el('InstallmentAmount', null, amt(inv.total)),
      el('PaymentMeans', null, PAYMENT_MEANS[inv.payment_method] || '13'),
      inv.iban && inv.payment_method === 'transfer' ? el('AccountToBeCredited', null, [el('IBAN', null, inv.iban)]) : null,
      inv.iban && inv.payment_method === 'direct_debit' ? el('AccountToBeDebited', null, [el('IBAN', null, inv.iban)]) : null
    ])]) : null,
    notes ? el('AdditionalData', null, [el('InvoiceAdditionalInformation', null, cut(notes, 2500))]) : null
  ]);

  const totalInvoice = amt(inv.total);
  return {
    xml: doc(el('fe:Facturae', { 'xmlns:fe': NS }, [
      el('FileHeader', null, [
        el('SchemaVersion', null, '3.2.2'),
        el('Modality', null, 'I'),
        el('InvoiceIssuerType', null, 'EM'),
        el('Batch', null, [
          el('BatchIdentifier', null, cut(`${inv.issuer.tax_id}${inv.number}`, 70)),
          el('InvoicesCount', null, '1'),
          el('TotalInvoicesAmount', null, [el('TotalAmount', null, totalInvoice)]),
          el('TotalOutstandingAmount', null, [el('TotalAmount', null, totalInvoice)]),
          el('TotalExecutableAmount', null, [el('TotalAmount', null, amt(inv.total))]),
          el('InvoiceCurrencyCode', null, 'EUR')
        ])
      ]),
      el('Parties', null, [el('SellerParty', null, party(inv.issuer)), el('BuyerParty', null, party(inv.customer))]),
      el('Invoices', null, [invoice])
    ]))
  };
}

module.exports = { toFacturae, partyMissing, provinceOf };
