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
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;

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
