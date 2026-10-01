/**
 * services/invoicing/pdf.js — sesión 11 (tanda 2): PDF de una factura emitida.
 *
 * Se genera en el servidor (pdfkit + Noto Sans, la misma tipografía que los
 * PDF de la app) para que la app, el email y la API den el mismo documento.
 * Lleva todo lo que exige el art. 6 del RD 1619/2012: número y serie, fechas,
 * datos del emisor y del cliente, descripción, base, tipo y cuota por tipo,
 * y la referencia a la factura rectificada cuando corresponde.
 *
 * opts.qr (PNG) y opts.qrLegend quedan preparados para VERI*FACTU (11b).
 */

'use strict';

const path = require('path');
const PDFDocument = require('pdfkit');

const FONT_REGULAR = path.join(__dirname, '../../assets/fonts/NotoSans-Regular.ttf');
const FONT_BOLD = path.join(__dirname, '../../assets/fonts/NotoSans-Bold.ttf');

const GREEN = '#0E9F6E';
const INK = '#1F2328';
const MUTED = '#6B7280';
const LINE = '#E5E7EB';

const LOCALES = { es: 'es-ES', en: 'en-GB', fr: 'fr-FR', it: 'it-IT', de: 'de-DE', pl: 'pl-PL' };

const L = {
  es: {
    F1: 'FACTURA', F2: 'FACTURA SIMPLIFICADA', R: 'FACTURA RECTIFICATIVA', number: 'Número', date: 'Fecha', operation: 'Fecha de la operación',
    due: 'Vencimiento', customer: 'Cliente', nif: 'NIF', description: 'Descripción', qty: 'Cant.', price: 'Precio', disc: 'Dto.', vat: 'IVA', amount: 'Importe',
    base: 'Base imponible', vatAmount: 'Cuota IVA', re: 'Recargo de equivalencia', irpf: 'Retención IRPF', total: 'TOTAL', breakdown: 'Desglose de impuestos',
    rate: 'Tipo', payment: 'Forma de pago', iban: 'IBAN', notes: 'Observaciones', rectifies: 'Rectifica la factura', reason: 'Motivo',
    cancelled: 'ANULADA', page: 'Página', footer: 'Factura emitida con Nokfi',
    methods: { transfer: 'Transferencia bancaria', direct_debit: 'Domiciliación bancaria', card: 'Tarjeta', cash: 'Efectivo', other: 'Otro' },
    exemptions: { E1: 'Operación exenta (art. 20 LIVA)', E2: 'Exportación exenta (art. 21 LIVA)', E3: 'Operación exenta (art. 22 LIVA)', E4: 'Operación exenta (arts. 23 y 24 LIVA)', E5: 'Entrega intracomunitaria exenta (art. 25 LIVA)', E6: 'Operación exenta', N1: 'Operación no sujeta (arts. 7 y 14 LIVA)', N2: 'Operación no sujeta por reglas de localización', S2: 'Inversión del sujeto pasivo (art. 84.Uno.2.º LIVA)' }
  },
  en: {
    F1: 'INVOICE', F2: 'SIMPLIFIED INVOICE', R: 'CORRECTIVE INVOICE', number: 'Number', date: 'Date', operation: 'Date of supply',
    due: 'Due date', customer: 'Customer', nif: 'Tax ID', description: 'Description', qty: 'Qty', price: 'Price', disc: 'Disc.', vat: 'VAT', amount: 'Amount',
    base: 'Taxable amount', vatAmount: 'VAT', re: 'Equivalence surcharge', irpf: 'Income tax withholding', total: 'TOTAL', breakdown: 'Tax breakdown',
    rate: 'Rate', payment: 'Payment method', iban: 'IBAN', notes: 'Notes', rectifies: 'Corrects invoice', reason: 'Reason',
    cancelled: 'CANCELLED', page: 'Page', footer: 'Invoice issued with Nokfi',
    methods: { transfer: 'Bank transfer', direct_debit: 'Direct debit', card: 'Card', cash: 'Cash', other: 'Other' },
    exemptions: { E1: 'VAT exempt (art. 20 Spanish VAT Act)', E2: 'Exempt export (art. 21 Spanish VAT Act)', E3: 'VAT exempt (art. 22 Spanish VAT Act)', E4: 'VAT exempt (arts. 23-24 Spanish VAT Act)', E5: 'Exempt intra-EU supply (art. 25 Spanish VAT Act)', E6: 'VAT exempt', N1: 'Not subject to VAT (arts. 7 and 14 Spanish VAT Act)', N2: 'Not subject to Spanish VAT (place of supply rules)', S2: 'Reverse charge' }
  },
  fr: {
    F1: 'FACTURE', F2: 'FACTURE SIMPLIFIÉE', R: 'FACTURE RECTIFICATIVE', number: 'Numéro', date: 'Date', operation: "Date de l'opération",
    due: 'Échéance', customer: 'Client', nif: 'N° fiscal', description: 'Description', qty: 'Qté', price: 'Prix', disc: 'Rem.', vat: 'TVA', amount: 'Montant',
    base: 'Base imposable', vatAmount: 'TVA', re: "Supplément d'équivalence", irpf: "Retenue à la source (IRPF)", total: 'TOTAL', breakdown: 'Détail des taxes',
    rate: 'Taux', payment: 'Mode de paiement', iban: 'IBAN', notes: 'Observations', rectifies: 'Rectifie la facture', reason: 'Motif',
    cancelled: 'ANNULÉE', page: 'Page', footer: 'Facture émise avec Nokfi',
    methods: { transfer: 'Virement bancaire', direct_debit: 'Prélèvement', card: 'Carte', cash: 'Espèces', other: 'Autre' },
    exemptions: { E1: 'Opération exonérée (art. 20 LIVA)', E2: 'Exportation exonérée (art. 21 LIVA)', E3: 'Opération exonérée (art. 22 LIVA)', E4: 'Opération exonérée (art. 23 et 24 LIVA)', E5: 'Livraison intracommunautaire exonérée (art. 25 LIVA)', E6: 'Opération exonérée', N1: 'Opération non soumise (art. 7 et 14 LIVA)', N2: 'Opération non soumise (règles de localisation)', S2: 'Autoliquidation' }
  },
  it: {
    F1: 'FATTURA', F2: 'FATTURA SEMPLIFICATA', R: 'FATTURA RETTIFICATIVA', number: 'Numero', date: 'Data', operation: "Data dell'operazione",
    due: 'Scadenza', customer: 'Cliente', nif: 'Cod. fiscale', description: 'Descrizione', qty: 'Q.tà', price: 'Prezzo', disc: 'Sc.', vat: 'IVA', amount: 'Importo',
    base: 'Imponibile', vatAmount: 'IVA', re: 'Sovrattassa di equivalenza', irpf: "Ritenuta d'acconto (IRPF)", total: 'TOTALE', breakdown: 'Riepilogo imposte',
    rate: 'Aliquota', payment: 'Pagamento', iban: 'IBAN', notes: 'Note', rectifies: 'Rettifica la fattura', reason: 'Motivo',
    cancelled: 'ANNULLATA', page: 'Pagina', footer: 'Fattura emessa con Nokfi',
    methods: { transfer: 'Bonifico bancario', direct_debit: 'Addebito diretto', card: 'Carta', cash: 'Contanti', other: 'Altro' },
    exemptions: { E1: 'Operazione esente (art. 20 LIVA)', E2: 'Esportazione esente (art. 21 LIVA)', E3: 'Operazione esente (art. 22 LIVA)', E4: 'Operazione esente (artt. 23 e 24 LIVA)', E5: 'Cessione intracomunitaria esente (art. 25 LIVA)', E6: 'Operazione esente', N1: 'Operazione non soggetta (artt. 7 e 14 LIVA)', N2: 'Operazione non soggetta (regole di territorialità)', S2: 'Inversione contabile' }
  },
  de: {
    F1: 'RECHNUNG', F2: 'VEREINFACHTE RECHNUNG', R: 'RECHNUNGSKORREKTUR', number: 'Nummer', date: 'Datum', operation: 'Leistungsdatum',
    due: 'Fällig am', customer: 'Kunde', nif: 'Steuernr.', description: 'Beschreibung', qty: 'Menge', price: 'Preis', disc: 'Rab.', vat: 'MwSt.', amount: 'Betrag',
    base: 'Nettobetrag', vatAmount: 'MwSt.', re: 'Ausgleichszuschlag', irpf: 'Quellensteuer (IRPF)', total: 'GESAMT', breakdown: 'Steueraufstellung',
    rate: 'Satz', payment: 'Zahlungsart', iban: 'IBAN', notes: 'Hinweise', rectifies: 'Korrigiert Rechnung', reason: 'Grund',
    cancelled: 'STORNIERT', page: 'Seite', footer: 'Rechnung erstellt mit Nokfi',
    methods: { transfer: 'Überweisung', direct_debit: 'Lastschrift', card: 'Karte', cash: 'Bar', other: 'Sonstige' },
    exemptions: { E1: 'Steuerbefreit (Art. 20 span. UStG)', E2: 'Steuerfreie Ausfuhr (Art. 21 span. UStG)', E3: 'Steuerbefreit (Art. 22 span. UStG)', E4: 'Steuerbefreit (Art. 23 und 24 span. UStG)', E5: 'Steuerfreie innergemeinschaftliche Lieferung (Art. 25 span. UStG)', E6: 'Steuerbefreit', N1: 'Nicht steuerbar (Art. 7 und 14 span. UStG)', N2: 'Nicht steuerbar (Ortsregeln)', S2: 'Steuerschuldnerschaft des Leistungsempfängers' }
  },
  pl: {
    F1: 'FAKTURA', F2: 'FAKTURA UPROSZCZONA', R: 'FAKTURA KORYGUJĄCA', number: 'Numer', date: 'Data', operation: 'Data sprzedaży',
    due: 'Termin płatności', customer: 'Nabywca', nif: 'NIP', description: 'Opis', qty: 'Ilość', price: 'Cena', disc: 'Rab.', vat: 'VAT', amount: 'Kwota',
    base: 'Wartość netto', vatAmount: 'VAT', re: 'Dopłata wyrównawcza', irpf: 'Zaliczka na podatek (IRPF)', total: 'RAZEM', breakdown: 'Zestawienie podatków',
    rate: 'Stawka', payment: 'Forma płatności', iban: 'IBAN', notes: 'Uwagi', rectifies: 'Koryguje fakturę', reason: 'Przyczyna',
    cancelled: 'ANULOWANA', page: 'Strona', footer: 'Faktura wystawiona w Nokfi',
    methods: { transfer: 'Przelew', direct_debit: 'Polecenie zapłaty', card: 'Karta', cash: 'Gotówka', other: 'Inna' },
    exemptions: { E1: 'Zwolnione (art. 20 hiszp. ustawy o VAT)', E2: 'Eksport zwolniony (art. 21)', E3: 'Zwolnione (art. 22)', E4: 'Zwolnione (art. 23 i 24)', E5: 'Zwolniona dostawa wewnątrzwspólnotowa (art. 25)', E6: 'Zwolnione', N1: 'Niepodlegające (art. 7 i 14)', N2: 'Niepodlegające (miejsce świadczenia)', S2: 'Odwrotne obciążenie' }
  }
};

function labels(lang) { return L[lang] || L.es; }

/** Formatos con espacios normales (Intl usa espacios finos que no todas las fuentes traen). */
function formatters(lang) {
  const loc = LOCALES[lang] || 'es-ES';
  const clean = (s) => s.replace(/[  ]/g, ' ');
  const money = new Intl.NumberFormat(loc, { style: 'currency', currency: 'EUR' });
  const qty = new Intl.NumberFormat(loc, { maximumFractionDigits: 3 });
  const price = new Intl.NumberFormat(loc, { minimumFractionDigits: 2, maximumFractionDigits: 4 });
  const pct = new Intl.NumberFormat(loc, { maximumFractionDigits: 2 });
  const date = new Intl.DateTimeFormat(loc, { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' });
  return {
    eur: (n) => clean(money.format(n || 0)),
    qty: (n) => clean(qty.format(n)),
    price: (n) => clean(price.format(n)),
    pct: (n) => `${clean(pct.format(n))} %`,
    date: (s) => (s ? date.format(new Date(`${s}T00:00:00Z`)) : '')
  };
}

const groupIban = (s) => String(s || '').replace(/(.{4})/g, '$1 ').trim();

function partyLines(p, t) {
  const out = [];
  if (p.tax_id) out.push(`${t.nif}: ${p.tax_id}`);
  if (p.address) out.push(p.address);
  const cityLine = [p.postal_code, p.city].filter(Boolean).join(' ') + (p.province && p.province !== p.city ? ` (${p.province})` : '');
  if (cityLine.trim()) out.push(cityLine.trim());
  if (p.country && p.country !== 'ES') out.push(p.country);
  const contact = [p.email, p.phone].filter(Boolean).join(' · ');
  if (contact) out.push(contact);
  return out;
}

/**
 * Factura → PDF (Buffer).
 * opts: { qr?: Buffer (PNG), qrLegend?: string, footer?: string, attachments?: [...] }
 */
function renderInvoicePdf(inv, opts = {}) {
  const t = labels(inv.lang);
  const f = formatters(inv.lang);
  const doc = new PDFDocument({
    size: 'A4', margin: 48, bufferPages: true,
    // pdfkit copia Title/Author al XMP sin escapar: fuera &, < y >.
    info: { Title: `${t[inv.kind.startsWith('R') ? 'R' : inv.kind]} ${inv.number}`, Author: String(inv.issuer.name).replace(/[&<>]/g, ' '), Creator: 'Nokfi', Producer: 'Nokfi' },
    ...(opts.pdfOptions || {})
  });
  doc.registerFont('regular', FONT_REGULAR);
  doc.registerFont('bold', FONT_BOLD);
  const chunks = [];
  doc.on('data', (c) => chunks.push(c));
  const done = new Promise((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))));

  const W = doc.page.width;
  const left = 48;
  const right = W - 48;
  const width = right - left;
  const title = inv.kind.startsWith('R') ? t.R : t[inv.kind];

  /* ── Cabecera: emisor a la izquierda, título y datos a la derecha ── */
  let y = 48;
  doc.font('bold').fontSize(14).fillColor(INK).text(inv.issuer.name, left, y, { width: width * 0.55 });
  doc.font('regular').fontSize(9).fillColor(MUTED);
  for (const line of partyLines(inv.issuer, t)) doc.text(line, { width: width * 0.55 });
  const issuerBottom = doc.y;

  const rx = left + width * 0.58;
  const rw = width * 0.42;
  const qrSize = opts.qr ? 64 : 0;
  doc.font('bold').fontSize(16).fillColor(GREEN).text(title, rx, 48, { width: rw - qrSize - (qrSize ? 8 : 0), align: 'right' });
  doc.moveDown(0.3);
  const meta = [[t.number, inv.number], [t.date, f.date(inv.issue_date)]];
  if (inv.operation_date) meta.push([t.operation, f.date(inv.operation_date)]);
  if (inv.due_date && !inv.kind.startsWith('R')) meta.push([t.due, f.date(inv.due_date)]);
  const metaW = rw - (qrSize ? qrSize + 8 : 0);
  let my = doc.y;
  for (const [k, v] of meta) {
    doc.font('regular').fontSize(9).fillColor(MUTED).text(k, rx, my, { width: metaW * 0.5 });
    doc.font('bold').fontSize(9).fillColor(INK).text(v, rx + metaW * 0.5, my, { width: metaW * 0.5, align: 'right' });
    my += 13;
  }
  doc.y = my;
  if (opts.qr) {
    doc.image(opts.qr, right - qrSize, 48, { width: qrSize, height: qrSize });
    if (opts.qrLegend) doc.font('bold').fontSize(7).fillColor(INK).text(opts.qrLegend, right - qrSize - 10, 48 + qrSize + 2, { width: qrSize + 20, align: 'center' });
  }
  y = Math.max(issuerBottom, doc.y, 48 + qrSize + 14) + 18;

  /* ── Cliente ── */
  if (inv.customer) {
    const boxTop = y;
    doc.font('bold').fontSize(8).fillColor(MUTED).text(t.customer.toUpperCase(), left + 10, y + 8, { width: width - 20 });
    doc.font('bold').fontSize(11).fillColor(INK).text(inv.customer.name, { width: width - 20 });
    doc.font('regular').fontSize(9).fillColor(INK);
    for (const line of partyLines(inv.customer, t)) doc.text(line, { width: width - 20 });
    const boxBottom = doc.y + 8;
    doc.roundedRect(left, boxTop, width, boxBottom - boxTop, 6).lineWidth(0.8).strokeColor(LINE).stroke();
    y = boxBottom + 14;
  }

  /* ── Rectificativa: a qué factura corrige y por qué ── */
  if (inv.rectifies_number) {
    doc.font('bold').fontSize(9).fillColor(INK).text(`${t.rectifies} ${inv.rectifies_number}`, left, y, { width });
    if (inv.rectification_reason) doc.font('regular').fillColor(MUTED).text(`${t.reason}: ${inv.rectification_reason}`, { width });
    y = doc.y + 12;
  }

  /* ── Líneas ── */
  const cols = [
    { key: 'description', label: t.description, w: 0.46, align: 'left' },
    { key: 'qty', label: t.qty, w: 0.09, align: 'right' },
    { key: 'price', label: t.price, w: 0.14, align: 'right' },
    { key: 'disc', label: t.disc, w: 0.08, align: 'right' },
    { key: 'vat', label: t.vat, w: 0.08, align: 'right' },
    { key: 'amount', label: t.amount, w: 0.15, align: 'right' }
  ];
  let cx = left;
  for (const c of cols) { c.x = cx; c.width = width * c.w; cx += c.width; }
  const header = () => {
    doc.rect(left, y, width, 20).fill('#F3F4F6');
    doc.font('bold').fontSize(8).fillColor(MUTED);
    for (const c of cols) doc.text(c.label, c.x + 4, y + 6, { width: c.width - 8, align: c.align });
    y += 24;
  };
  header();
  const bottomLimit = doc.page.height - 120;
  for (const l of inv.lines) {
    const cells = {
      description: l.description,
      qty: `${f.qty(l.quantity)}${l.unit ? ` ${l.unit}` : ''}`,
      price: f.price(l.unit_price),
      disc: l.discount_pct ? f.pct(l.discount_pct) : '',
      vat: f.pct(l.vat_rate) + (l.re_rate ? `\n+${f.pct(l.re_rate)}` : ''),
      amount: f.eur(l.amount)
    };
    doc.font('regular').fontSize(9);
    const h = Math.max(...cols.map(c => doc.heightOfString(cells[c.key], { width: c.width - 8 }))) + 8;
    if (y + h > bottomLimit) { doc.addPage(); y = 48; header(); doc.font('regular').fontSize(9); }
    doc.fillColor(INK);
    for (const c of cols) doc.text(cells[c.key], c.x + 4, y + 2, { width: c.width - 8, align: c.align });
    y += h;
    doc.moveTo(left, y - 3).lineTo(right, y - 3).lineWidth(0.5).strokeColor(LINE).stroke();
  }
  y += 10;

  /* ── Desglose por tipo (izquierda) y totales (derecha) ── */
  const needed = 40 + inv.taxes.length * 14 + 90;
  if (y + needed > doc.page.height - 80) { doc.addPage(); y = 48; }
  const blockTop = y;
  const bw = width * 0.5;
  doc.font('bold').fontSize(8).fillColor(MUTED).text(t.breakdown.toUpperCase(), left, y, { width: bw });
  y = doc.y + 4;
  const tcols = inv.equivalence_surcharge
    ? [[t.base, 0.3], [t.rate, 0.15], [t.vatAmount, 0.2], [t.re, 0.35]]
    : [[t.base, 0.4], [t.rate, 0.25], [t.vatAmount, 0.35]];
  let tx = left;
  doc.font('bold').fontSize(8).fillColor(MUTED);
  for (const [lab, w] of tcols) { doc.text(lab, tx, y, { width: bw * w - 4, align: 'right' }); tx += bw * w; }
  y = doc.y + 3;
  doc.font('regular').fontSize(9).fillColor(INK);
  for (const g of inv.taxes) {
    const vals = [f.eur(g.base), f.pct(g.vat_rate), f.eur(g.vat_amount)];
    if (inv.equivalence_surcharge) vals.push(`${f.pct(g.re_rate)} · ${f.eur(g.re_amount)}`);
    tx = left;
    tcols.forEach(([, w], i) => { doc.text(vals[i], tx, y, { width: bw * w - 4, align: 'right' }); tx += bw * w; });
    y += 14;
  }
  const leftBottom = y;

  y = blockTop;
  const tl = left + width * 0.56;
  const tw = width * 0.44;
  const row = (label, value, bold = false) => {
    doc.font(bold ? 'bold' : 'regular').fontSize(bold ? 12 : 9).fillColor(bold ? INK : MUTED).text(label, tl, y, { width: tw * 0.55 });
    doc.font('bold').fontSize(bold ? 12 : 9).fillColor(INK).text(value, tl + tw * 0.55, y, { width: tw * 0.45, align: 'right' });
    y += bold ? 20 : 14;
  };
  row(t.base, f.eur(inv.base));
  row(t.vatAmount, f.eur(inv.vat_amount));
  if (inv.re_amount) row(t.re, f.eur(inv.re_amount));
  if (inv.irpf_amount) row(`${t.irpf} (${f.pct(inv.irpf_rate)})`, f.eur(-inv.irpf_amount));
  doc.moveTo(tl, y + 2).lineTo(right, y + 2).lineWidth(1).strokeColor(GREEN).stroke();
  y += 8;
  row(t.total, f.eur(inv.total), true);
  y = Math.max(y, leftBottom) + 14;

  /* ── Exención, pago y observaciones ── */
  const para = (label, text) => {
    if (!text) return;
    if (y > doc.page.height - 110) { doc.addPage(); y = 48; }
    if (label) doc.font('bold').fontSize(8).fillColor(MUTED).text(label.toUpperCase(), left, y, { width });
    doc.font('regular').fontSize(9).fillColor(INK).text(text, label ? { width } : left, label ? undefined : y, label ? undefined : { width });
    y = doc.y + 10;
  };
  if (inv.exemption) para(t.vat, t.exemptions[inv.exemption] || inv.exemption);
  if (!inv.kind.startsWith('R')) {
    const pay = [t.methods[inv.payment_method] || inv.payment_method];
    if (inv.iban) pay.push(`${t.iban}: ${groupIban(inv.iban)}`);
    if (inv.due_date) pay.push(`${t.due}: ${f.date(inv.due_date)}`);
    para(t.payment, pay.join(' · '));
  }
  para(t.notes, inv.notes);
  if (opts.footer) para('', opts.footer);

  /* ── Anulada: marca de agua ── */
  if (inv.status === 'cancelled') {
    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i++) {
      doc.switchToPage(i);
      doc.page.margins.bottom = 0;
      doc.save().rotate(-30, { origin: [W / 2, doc.page.height / 2] })
        .font('bold').fontSize(80).fillColor('#DC2626').fillOpacity(0.12)
        .text(t.cancelled, 0, doc.page.height / 2 - 50, { width: W, align: 'center', lineBreak: false }).restore();
      doc.fillOpacity(1);
    }
  }

  /* ── Pie: marca y página ── */
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    doc.page.margins.bottom = 0; // escribir en el margen sin que pdfkit abra otra página
    const fy = doc.page.height - 36;
    doc.font('regular').fontSize(7.5).fillColor(MUTED);
    doc.text(`${inv.number} · ${t.footer}`, left, fy, { width: width * 0.7, lineBreak: false });
    doc.text(`${t.page} ${i + 1}/${range.count}`, left + width * 0.7, fy, { width: width * 0.3, align: 'right', lineBreak: false });
  }

  if (typeof opts.beforeEnd === 'function') opts.beforeEnd(doc);
  doc.end();
  return done;
}

module.exports = { renderInvoicePdf, labels, formatters };
