/**
 * Facturas electrónicas en el navegador (sesión 4). El lector vive en
 * shared/einvoice.mjs (sesión 11), compartido con la API, el MCP y n8n.
 */

import { parseEInvoiceXml, pickEmbeddedXml } from '../../../shared/einvoice.mjs';

export { parseEInvoiceXml };

/** PDF con XML embebido (Factur-X / ZUGFeRD) → facturas, o null. */
export async function parseEmbeddedPdfInvoice(file) {
  await import('./pdfExtract'); // configura el worker de pdf.js
  const pdfjs = await import('pdfjs-dist');
  const pdf = await pdfjs.getDocument({ data: await file.arrayBuffer(), isEvalSupported: false }).promise;
  const xml = pickEmbeddedXml(await pdf.getAttachments());
  if (!xml) return null;
  return parseEInvoiceXml(new TextDecoder('utf-8').decode(xml), file.name);
}
