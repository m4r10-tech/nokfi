import * as pdfjsLib from 'pdfjs-dist';
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

const SCANNED_THRESHOLD_CHARS = 100; // sección 20 del proyecto, Capa 2

/**
 * Extrae el texto de un PDF en el navegador, sin tocar el servidor
 * (Capa 1 del sistema de PDFs — sección 20 del proyecto).
 * Si el texto extraído es muy corto, se marca `looksScanned: true` para
 * que el componente muestre el aviso de la Capa 2.
 */
export async function extractPdfText(file) {
  const buffer = await file.arrayBuffer();
  // Sesión 3 (bug subida PDFs): bajo la CSP estricta de index.html el worker de
  // pdfjs podía no arrancar y getDocument() se colgaba SIN rechazar nunca — el
  // usuario veía que "no pasaba nada". Doble defensa:
  //  · isEvalSupported:false → pdfjs no usa eval (CSP-safe, evita un fallo más)
  //  · timeout propio → si el worker no responde en 30s, error claro en vez de
  //    cuelgue eterno (el caller ya tiene try/catch por archivo, sesión 2 #3).
  const PDF_LOAD_TIMEOUT_MS = 30000;
  const pdf = await Promise.race([
    pdfjsLib.getDocument({ data: buffer, isEvalSupported: false }).promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('PDF: el lector no respondió a tiempo')), PDF_LOAD_TIMEOUT_MS))
  ]);

  let fullText = '';
  const maxPages = Math.min(pdf.numPages, 20); // límite razonable de páginas a procesar
  for (let i = 1; i <= maxPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    fullText += content.items.map(item => item.str).join(' ') + '\n';
  }

  return {
    text: fullText.trim(),
    looksScanned: fullText.trim().length < SCANNED_THRESHOLD_CHARS
  };
}
