/**
 * test/fixtures/einvoices.js — facturas electrónicas de ejemplo (sesión 11):
 * una de cada formato que lee Nokfi, con NIF válidos y cuadradas.
 */

'use strict';

const facturae = `<?xml version="1.0" encoding="UTF-8"?>
<fe:Facturae xmlns:fe="http://www.facturae.gob.es/formato/Versiones/Facturae_3_2_2.xml">
  <FileHeader><SchemaVersion>3.2.2</SchemaVersion><Modality>I</Modality><InvoiceIssuerType>EM</InvoiceIssuerType></FileHeader>
  <Parties>
    <SellerParty><TaxIdentification><PersonTypeCode>J</PersonTypeCode><ResidenceTypeCode>R</ResidenceTypeCode><TaxIdentificationNumber>ESB12345674</TaxIdentificationNumber></TaxIdentification>
      <LegalEntity><CorporateName>Talleres Ruiz SL</CorporateName></LegalEntity></SellerParty>
    <BuyerParty><TaxIdentification><PersonTypeCode>F</PersonTypeCode><ResidenceTypeCode>R</ResidenceTypeCode><TaxIdentificationNumber>12345678Z</TaxIdentificationNumber></TaxIdentification>
      <Individual><Name>Ana</Name><FirstSurname>López</FirstSurname></Individual></BuyerParty>
  </Parties>
  <Invoices><Invoice>
    <InvoiceHeader><InvoiceNumber>017</InvoiceNumber><InvoiceSeriesCode>F2026</InvoiceSeriesCode><InvoiceDocumentType>FC</InvoiceDocumentType><InvoiceClass>OO</InvoiceClass></InvoiceHeader>
    <InvoiceIssueData><IssueDate>2026-09-14</IssueDate><InvoiceCurrencyCode>EUR</InvoiceCurrencyCode><TaxCurrencyCode>EUR</TaxCurrencyCode><LanguageName>es</LanguageName></InvoiceIssueData>
    <TaxesOutputs><Tax><TaxTypeCode>01</TaxTypeCode><TaxRate>21.00</TaxRate><TaxableBase><TotalAmount>1000.00</TotalAmount></TaxableBase><TaxAmount><TotalAmount>210.00</TotalAmount></TaxAmount></Tax></TaxesOutputs>
    <TaxesWithheld><Tax><TaxTypeCode>04</TaxTypeCode><TaxRate>15.00</TaxRate><TaxableBase><TotalAmount>1000.00</TotalAmount></TaxableBase><TaxAmount><TotalAmount>150.00</TotalAmount></TaxAmount></Tax></TaxesWithheld>
    <InvoiceTotals><TotalGrossAmount>1000.00</TotalGrossAmount><TotalGrossAmountBeforeTaxes>1000.00</TotalGrossAmountBeforeTaxes><TotalTaxOutputs>210.00</TotalTaxOutputs><TotalTaxesWithheld>150.00</TotalTaxesWithheld><InvoiceTotal>1060.00</InvoiceTotal><TotalOutstandingAmount>1060.00</TotalOutstandingAmount><TotalExecutableAmount>1060.00</TotalExecutableAmount></InvoiceTotals>
    <Items><InvoiceLine><ItemDescription>Reparación de maquinaria</ItemDescription><Quantity>1</Quantity><UnitPriceWithoutTax>1000.00</UnitPriceWithoutTax><TotalCost>1000.00</TotalCost><GrossAmount>1000.00</GrossAmount>
      <TaxesOutputs><Tax><TaxTypeCode>01</TaxTypeCode><TaxRate>21.00</TaxRate><TaxableBase><TotalAmount>1000.00</TotalAmount></TaxableBase></Tax></TaxesOutputs></InvoiceLine></Items>
    <PaymentDetails><Installment><InstallmentDueDate>2026-10-14</InstallmentDueDate><InstallmentAmount>1060.00</InstallmentAmount><PaymentMeans>04</PaymentMeans></Installment></PaymentDetails>
  </Invoice></Invoices>
</fe:Facturae>`;

const ublParties = `
  <cac:AccountingSupplierParty><cac:Party><cac:PartyName><cbc:Name>Papelería Sol</cbc:Name></cac:PartyName>
    <cac:PartyTaxScheme><cbc:CompanyID>ESB12345674</cbc:CompanyID><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:PartyTaxScheme>
    <cac:PartyLegalEntity><cbc:RegistrationName>Papelería Sol SL</cbc:RegistrationName></cac:PartyLegalEntity></cac:Party></cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty><cac:Party>
    <cac:PartyTaxScheme><cbc:CompanyID>ES12345678Z</cbc:CompanyID><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:PartyTaxScheme>
    <cac:PartyLegalEntity><cbc:RegistrationName>Ana López</cbc:RegistrationName></cac:PartyLegalEntity></cac:Party></cac:AccountingCustomerParty>`;

const ubl = `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2" xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:CustomizationID>urn:cen.eu:en16931:2017</cbc:CustomizationID>
  <cbc:ID>PS-2026-0042</cbc:ID>
  <cbc:IssueDate>2026-09-20</cbc:IssueDate>
  <cbc:DueDate>2026-10-20</cbc:DueDate>
  <cbc:InvoiceTypeCode>380</cbc:InvoiceTypeCode>
  <cbc:DocumentCurrencyCode>EUR</cbc:DocumentCurrencyCode>${ublParties}
  <cac:TaxTotal><cbc:TaxAmount currencyID="EUR">21.00</cbc:TaxAmount>
    <cac:TaxSubtotal><cbc:TaxableAmount currencyID="EUR">100.00</cbc:TaxableAmount><cbc:TaxAmount currencyID="EUR">21.00</cbc:TaxAmount>
      <cac:TaxCategory><cbc:ID>S</cbc:ID><cbc:Percent>21</cbc:Percent><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:TaxCategory></cac:TaxSubtotal></cac:TaxTotal>
  <cac:LegalMonetaryTotal><cbc:LineExtensionAmount currencyID="EUR">100.00</cbc:LineExtensionAmount><cbc:TaxExclusiveAmount currencyID="EUR">100.00</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="EUR">121.00</cbc:TaxInclusiveAmount><cbc:PayableAmount currencyID="EUR">121.00</cbc:PayableAmount></cac:LegalMonetaryTotal>
  <cac:InvoiceLine><cbc:ID>1</cbc:ID><cbc:InvoicedQuantity unitCode="C62">10</cbc:InvoicedQuantity><cbc:LineExtensionAmount currencyID="EUR">100.00</cbc:LineExtensionAmount>
    <cac:Item><cbc:Name>Paquetes de folios</cbc:Name></cac:Item><cac:Price><cbc:PriceAmount currencyID="EUR">10.00</cbc:PriceAmount></cac:Price></cac:InvoiceLine>
</Invoice>`;

const ublCredit = `<?xml version="1.0" encoding="UTF-8"?>
<CreditNote xmlns="urn:oasis:names:specification:ubl:schema:xsd:CreditNote-2" xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:ID>PS-R-2026-0003</cbc:ID>
  <cbc:IssueDate>2026-09-25</cbc:IssueDate>
  <cbc:DocumentCurrencyCode>EUR</cbc:DocumentCurrencyCode>${ublParties}
  <cac:TaxTotal><cbc:TaxAmount currencyID="EUR">2.10</cbc:TaxAmount>
    <cac:TaxSubtotal><cbc:TaxableAmount currencyID="EUR">10.00</cbc:TaxableAmount><cbc:TaxAmount currencyID="EUR">2.10</cbc:TaxAmount>
      <cac:TaxCategory><cbc:ID>S</cbc:ID><cbc:Percent>21</cbc:Percent><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:TaxCategory></cac:TaxSubtotal></cac:TaxTotal>
  <cac:LegalMonetaryTotal><cbc:TaxExclusiveAmount currencyID="EUR">10.00</cbc:TaxExclusiveAmount><cbc:PayableAmount currencyID="EUR">12.10</cbc:PayableAmount></cac:LegalMonetaryTotal>
  <cac:CreditNoteLine><cbc:ID>1</cbc:ID><cbc:CreditedQuantity unitCode="C62">1</cbc:CreditedQuantity><cbc:LineExtensionAmount currencyID="EUR">10.00</cbc:LineExtensionAmount>
    <cac:Item><cbc:Name>Devolución de un paquete</cbc:Name></cac:Item></cac:CreditNoteLine>
</CreditNote>`;

const cii = `<?xml version="1.0" encoding="UTF-8"?>
<rsm:CrossIndustryInvoice xmlns:rsm="urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100" xmlns:ram="urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100" xmlns:udt="urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100">
  <rsm:ExchangedDocumentContext><ram:GuidelineSpecifiedDocumentContextParameter><ram:ID>urn:cen.eu:en16931:2017</ram:ID></ram:GuidelineSpecifiedDocumentContextParameter></rsm:ExchangedDocumentContext>
  <rsm:ExchangedDocument><ram:ID>FX-2026-9</ram:ID><ram:TypeCode>380</ram:TypeCode><ram:IssueDateTime><udt:DateTimeString format="102">20260910</udt:DateTimeString></ram:IssueDateTime></rsm:ExchangedDocument>
  <rsm:SupplyChainTradeTransaction>
    <ram:IncludedSupplyChainTradeLineItem><ram:SpecifiedTradeProduct><ram:Name>Licencia de software</ram:Name></ram:SpecifiedTradeProduct></ram:IncludedSupplyChainTradeLineItem>
    <ram:ApplicableHeaderTradeAgreement>
      <ram:SellerTradeParty><ram:Name>Soft Norte SL</ram:Name><ram:SpecifiedTaxRegistration><ram:ID schemeID="VA">ESB12345674</ram:ID></ram:SpecifiedTaxRegistration></ram:SellerTradeParty>
      <ram:BuyerTradeParty><ram:Name>Ana López</ram:Name><ram:SpecifiedTaxRegistration><ram:ID schemeID="VA">ES12345678Z</ram:ID></ram:SpecifiedTaxRegistration></ram:BuyerTradeParty>
    </ram:ApplicableHeaderTradeAgreement>
    <ram:ApplicableHeaderTradeSettlement>
      <ram:InvoiceCurrencyCode>EUR</ram:InvoiceCurrencyCode>
      <ram:ApplicableTradeTax><ram:CalculatedAmount>42.00</ram:CalculatedAmount><ram:TypeCode>VAT</ram:TypeCode><ram:BasisAmount>200.00</ram:BasisAmount><ram:CategoryCode>S</ram:CategoryCode><ram:RateApplicablePercent>21</ram:RateApplicablePercent></ram:ApplicableTradeTax>
      <ram:SpecifiedTradePaymentTerms><ram:DueDateDateTime><udt:DateTimeString format="102">20261010</udt:DateTimeString></ram:DueDateDateTime></ram:SpecifiedTradePaymentTerms>
      <ram:SpecifiedTradeSettlementHeaderMonetarySummation><ram:LineTotalAmount>200.00</ram:LineTotalAmount><ram:TaxBasisTotalAmount>200.00</ram:TaxBasisTotalAmount>
        <ram:TaxTotalAmount currencyID="EUR">42.00</ram:TaxTotalAmount><ram:GrandTotalAmount>242.00</ram:GrandTotalAmount><ram:DuePayableAmount>242.00</ram:DuePayableAmount></ram:SpecifiedTradeSettlementHeaderMonetarySummation>
    </ram:ApplicableHeaderTradeSettlement>
  </rsm:SupplyChainTradeTransaction>
</rsm:CrossIndustryInvoice>`;

/** PDF mínimo con un archivo embebido (como un Factur-X) → base64. */
function pdfWithAttachment(fileName, content, visibleText = 'FACTURA FX-2026-9') {
  const body = Buffer.from(content, 'utf8');
  const stream = `BT /F1 12 Tf 50 750 Td (${visibleText}) Tj ET`;
  const objs = [
    `<< /Type /Catalog /Pages 2 0 R /Names << /EmbeddedFiles << /Names [(${fileName}) 6 0 R] >> >> >>`,
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Type /Filespec /F (${fileName}) /UF (${fileName}) /AFRelationship /Data /EF << /F 7 0 R >> >>`,
    null // 7: el archivo embebido (binario)
  ];
  const parts = [Buffer.from('%PDF-1.7\n', 'latin1')];
  let len = parts[0].length;
  const offs = [];
  objs.forEach((o, i) => {
    offs.push(len);
    const chunk = o === null
      ? Buffer.concat([Buffer.from(`${i + 1} 0 obj\n<< /Type /EmbeddedFile /Subtype /text#2Fxml /Length ${body.length} >>\nstream\n`, 'latin1'), body, Buffer.from('\nendstream\nendobj\n', 'latin1')])
      : Buffer.from(`${i + 1} 0 obj\n${o}\nendobj\n`, 'latin1');
    parts.push(chunk); len += chunk.length;
  });
  const xref = `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + offs.map(o => `${String(o).padStart(10, '0')} 00000 n \n`).join('')
    + `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${len}\n%%EOF\n`;
  parts.push(Buffer.from(xref, 'latin1'));
  return Buffer.concat(parts).toString('base64');
}

const b64 = (s) => Buffer.from(s, 'utf8').toString('base64');

module.exports = { facturae, ubl, ublCredit, cii, pdfWithAttachment, b64 };
