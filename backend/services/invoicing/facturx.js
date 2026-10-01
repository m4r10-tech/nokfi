/**
 * services/invoicing/facturx.js — sesión 11 (tanda 3): Factur-X / ZUGFeRD.
 * El mismo PDF de la factura, en PDF/A-3b, con el XML CII embebido como
 * "factur-x.xml" (AFRelationship Alternative) y los metadatos XMP del estándar
 * (perfil EN 16931). Una persona lo lee como un PDF; un programa lee el XML.
 */

'use strict';

const path = require('path');
const { renderInvoicePdf } = require('./pdf');
const { toCii } = require('./xml/cii');

const FX_NS = 'urn:factur-x:pdfa:CrossIndustryDocument:invoice:1p0#';
const FX_FILE = 'factur-x.xml';

const xmpProperty = (name, description) => `
              <rdf:li rdf:parseType="Resource">
                <pdfaProperty:name>${name}</pdfaProperty:name>
                <pdfaProperty:valueType>Text</pdfaProperty:valueType>
                <pdfaProperty:category>external</pdfaProperty:category>
                <pdfaProperty:description>${description}</pdfaProperty:description>
              </rdf:li>`;

const FACTURX_XMP = `
        <rdf:Description rdf:about="" xmlns:fx="${FX_NS}">
            <fx:DocumentType>INVOICE</fx:DocumentType>
            <fx:DocumentFileName>${FX_FILE}</fx:DocumentFileName>
            <fx:Version>1.0</fx:Version>
            <fx:ConformanceLevel>EN 16931</fx:ConformanceLevel>
        </rdf:Description>
        <rdf:Description rdf:about="" xmlns:pdfaExtension="http://www.aiim.org/pdfa/ns/extension/" xmlns:pdfaSchema="http://www.aiim.org/pdfa/ns/schema#" xmlns:pdfaProperty="http://www.aiim.org/pdfa/ns/property#">
          <pdfaExtension:schemas>
            <rdf:Bag>
              <rdf:li rdf:parseType="Resource">
                <pdfaSchema:schema>Factur-X PDFA Extension Schema</pdfaSchema:schema>
                <pdfaSchema:namespaceURI>${FX_NS}</pdfaSchema:namespaceURI>
                <pdfaSchema:prefix>fx</pdfaSchema:prefix>
                <pdfaSchema:property>
                  <rdf:Seq>${xmpProperty('DocumentFileName', 'The name of the embedded XML document')}${xmpProperty('DocumentType', 'The type of the hybrid document in capital letters, e.g. INVOICE or ORDER')}${xmpProperty('Version', 'The actual version of the standard applying to the embedded XML document')}${xmpProperty('ConformanceLevel', 'The conformance level of the embedded XML document')}
                  </rdf:Seq>
                </pdfaSchema:property>
              </rdf:li>
            </rdf:Bag>
          </pdfaExtension:schemas>
        </rdf:Description>`;

/** Factura → { pdf } (Factur-X) o { error, field }. */
async function renderFacturX(inv, opts = {}) {
  const cii = toCii(inv);
  if (cii.error) return cii;
  const now = new Date();
  const pdf = await renderInvoicePdf(inv, {
    ...opts,
    pdfOptions: { subset: 'PDF/A-3b', pdfVersion: '1.7', tagged: false, font: path.join(__dirname, '../../assets/fonts/NotoSans-Regular.ttf') },
    beforeEnd: (doc) => {
      doc.file(Buffer.from(cii.xml, 'utf8'), {
        name: FX_FILE, type: 'text/xml', relationship: 'Alternative', description: 'Factur-X (EN 16931)',
        creationDate: now, modifiedDate: now
      });
      doc.appendXML(FACTURX_XMP);
    }
  });
  return { pdf, xml: cii.xml };
}

module.exports = { renderFacturX, FX_FILE };
