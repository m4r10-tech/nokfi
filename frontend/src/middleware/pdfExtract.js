import * as pdfjsLib from 'pdfjs-dist';
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.mjs?url';
import { FileReadError } from './fileErrors';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

const SCANNED_THRESHOLD_CHARS = 100; // sección 20 del proyecto, Capa 2
const PDF_LOAD_TIMEOUT_MS = 30000;

/**
 * Extrae el texto de un PDF en el navegador, sin tocar el servidor
 * (Capa 1 del sistema de PDFs — sección 20 del proyecto).
 * Si el texto extraído es muy corto, se marca `looksScanned: true` para
 * que el componente muestre el aviso de la Capa 2.
 *
 * Sesión 4 (§2.3): los fallos lanzan FileReadError con un código técnico
 * (ERR_PDF_TIMEOUT, ERR_PDF_PASSWORD, ERR_PDF_INVALID, ERR_PDF_READ) que la UI
 * muestra en pequeño → soporte distingue causas sin abrir DevTools.
 */
export async function extractPdfText(file, { maxPages = 20 } = {}) {
  const buffer = await file.arrayBuffer();
  // Sesión 3 (bug subida PDFs): bajo CSP estricta el worker podía no arrancar
  // y getDocument() se colgaba sin rechazar → isEvalSupported:false + timeout.
  let pdf;
  try {
    pdf = await Promise.race([
      pdfjsLib.getDocument({ data: buffer, isEvalSupported: false }).promise,
      new Promise((_, reject) =>
        setTimeout(() => reject(new FileReadError('ERR_PDF_TIMEOUT', file.name)), PDF_LOAD_TIMEOUT_MS))
    ]);
  } catch (e) {
    if (e instanceof FileReadError) throw e;
    if (e?.name === 'PasswordException') throw new FileReadError('ERR_PDF_PASSWORD', file.name);
    if (e?.name === 'InvalidPDFException') throw new FileReadError('ERR_PDF_INVALID', file.name);
    throw new FileReadError('ERR_PDF_READ', file.name);
  }

  let fullText = '';
  const pages = Math.min(pdf.numPages, maxPages); // límite razonable de páginas a procesar
  for (let i = 1; i <= pages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    fullText += content.items.map(item => item.str).join(' ') + '\n';
  }

  return {
    text: fullText.trim(),
    looksScanned: fullText.trim().length < SCANNED_THRESHOLD_CHARS
  };
}

/**
 * Renderiza la primera página de un PDF (escaneado) a JPEG en base64. Los
 * modelos abiertos sin entrenamiento (Groq/Cloudflare) leen imágenes pero no
 * PDF: así una factura escaneada se puede leer igual. Todo en el navegador.
 */
export async function renderPdfFirstPage(file, { maxDim = 1600, quality = 0.82 } = {}) {
  let pdf;
  try {
    pdf = await pdfjsLib.getDocument({ data: await file.arrayBuffer(), isEvalSupported: false }).promise;
  } catch (e) {
    if (e?.name === 'PasswordException') throw new FileReadError('ERR_PDF_PASSWORD', file.name);
    throw new FileReadError('ERR_PDF_READ', file.name);
  }
  const page = await pdf.getPage(1);
  const base = page.getViewport({ scale: 1 });
  const scale = Math.min(3, maxDim / Math.max(base.width, base.height));
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(viewport.width); canvas.height = Math.round(viewport.height);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: ctx, viewport }).promise;
  const dataUrl = canvas.toDataURL('image/jpeg', quality);
  return { mime: 'image/jpeg', data: dataUrl.split(',')[1] };
}
