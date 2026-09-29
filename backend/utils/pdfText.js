/**
 * utils/pdfText.js — texto de un PDF digital (sesión 7, API de facturas).
 *
 * Los modelos abiertos no leen PDF: se extrae la capa de texto con pdfjs-dist
 * (sin @napi-rs/canvas, ver backend/.npmrc: solo texto, ~15 MB de RAM). Se
 * importa bajo demanda, en la primera factura en PDF. Un PDF escaneado (sin
 * texto) devuelve '' y la ruta pide una imagen.
 */

'use strict';

let pdfjsPromise = null;
const loadPdfjs = () => (pdfjsPromise ||= import('pdfjs-dist/legacy/build/pdf.mjs'));

const MAX_PAGES = 5;
const MAX_CHARS = 12000;

async function pdfText(base64) {
  const pdfjs = await loadPdfjs();
  const data = new Uint8Array(Buffer.from(base64, 'base64'));
  const doc = await pdfjs.getDocument({ data, isEvalSupported: false, disableFontFace: true, verbosity: 0 }).promise;
  try {
    let out = '';
    for (let p = 1; p <= Math.min(doc.numPages, MAX_PAGES) && out.length < MAX_CHARS; p++) {
      const page = await doc.getPage(p);
      const content = await page.getTextContent();
      out += content.items.map(i => i.str).join(' ') + '\n';
    }
    return out.replace(/[ \t]+/g, ' ').trim().slice(0, MAX_CHARS);
  } finally {
    await doc.destroy();
  }
}

module.exports = { pdfText };
