import { FileReadError } from './fileErrors';

/**
 * Lectura LOCAL de archivos (sesión 4). Todo ocurre en el navegador: los
 * archivos no se suben. Lo que va a la IA es el texto/filas extraídos (o,
 * para facturas en imagen, una copia reducida de la imagen — V1).
 * xlsx y pdfjs se cargan bajo demanda (C7: la landing no los necesita).
 */

export const TABULAR_EXT = ['.xlsx', '.xls', '.csv', '.ods'];
export const IMAGE_EXT = ['.jpg', '.jpeg', '.png', '.webp'];

export const extOf = (name) => {
  const i = String(name).lastIndexOf('.');
  return i >= 0 ? name.slice(i).toLowerCase() : '';
};

export async function readTabular(file) {
  try {
    const XLSX = await import('xlsx');
    const buffer = await file.arrayBuffer();
    const wb = XLSX.read(buffer, { type: 'array' });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    return XLSX.utils.sheet_to_json(sheet, { defval: '' });
  } catch {
    throw new FileReadError('ERR_XLSX_READ', file.name);
  }
}

export async function readPdf(file, opts) {
  const { extractPdfText } = await import('./pdfExtract');
  return extractPdfText(file, opts);
}

/**
 * Lee un archivo de datos (Excel/CSV/ODS/PDF). Devuelve
 * { name, type:'excel', rows } | { name, type:'pdf', text, looksScanned }.
 */
export async function readDataFile(file, { maxBytes = 5 * 1024 * 1024 } = {}) {
  if (file.size > maxBytes) throw new FileReadError('ERR_FILE_TOO_BIG', file.name);
  const ext = extOf(file.name);
  if (ext === '.pdf') {
    const { text, looksScanned } = await readPdf(file);
    return { name: file.name, type: 'pdf', text, looksScanned, size: file.size };
  }
  if (TABULAR_EXT.includes(ext)) {
    const rows = await readTabular(file);
    return { name: file.name, type: 'excel', rows, size: file.size };
  }
  if (['.txt', '.md'].includes(ext)) {
    try {
      return { name: file.name, type: 'pdf', text: (await file.text()).slice(0, 60000), size: file.size };
    } catch { throw new FileReadError('ERR_FILE_READ', file.name); }
  }
  throw new FileReadError('ERR_FILE_TYPE', file.name);
}

/** Texto plano de un archivo leído (para lotes de carpeta, F3). */
export function fileAsText(f, maxChars = 12000) {
  if (f.type === 'excel') {
    const cols = f.rows.length ? Object.keys(f.rows[0]) : [];
    const lines = [cols.join(' | '), ...f.rows.slice(0, 200).map(r => cols.map(c => r[c]).join(' | '))];
    return lines.join('\n').slice(0, maxChars);
  }
  return String(f.text || '').slice(0, maxChars);
}

/** Imagen → JPEG reducido en base64 (sin prefijo) + miniatura data: (CSP img-src data:). */
export function imageToJpeg(file, { maxDim = 1600, quality = 0.82 } = {}) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new FileReadError('ERR_IMAGE_READ', file.name));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new FileReadError('ERR_IMAGE_READ', file.name));
      img.onload = () => {
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        const w = Math.round(img.width * scale), h = Math.round(img.height * scale);
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        const dataUrl = canvas.toDataURL('image/jpeg', quality);
        resolve({ mime: 'image/jpeg', data: dataUrl.split(',')[1], preview: dataUrl });
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

export function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new FileReadError('ERR_FILE_READ', file.name));
    reader.onload = () => resolve(String(reader.result).split(',')[1]);
    reader.readAsDataURL(file);
  });
}

/** "1.234,56 €" / "1,234.56" / 12 → número (o NaN). */
export function parseAmount(v) {
  if (typeof v === 'number') return v;
  let s = String(v ?? '').replace(/[€$\s]/g, '').trim();
  if (!s) return NaN;
  if (/,\d{1,2}$/.test(s)) s = s.replace(/\./g, '').replace(',', '.');
  else s = s.replace(/,/g, '');
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

/** Heurística de columnas: primera de texto (etiqueta) y primera numérica (valor). */
export function detectColumns(rows) {
  if (!rows?.length) return {};
  const keys = Object.keys(rows[0]);
  const sample = rows.slice(0, 20);
  const isNum = (k) => sample.filter(r => r[k] !== '' && r[k] != null).every(r => Number.isFinite(parseAmount(r[k])))
    && sample.some(r => r[k] !== '' && r[k] != null);
  const numberKey = keys.find(isNum);
  const labelKey = keys.find(k => k !== numberKey && !isNum(k)) || keys.find(k => k !== numberKey);
  return { labelKey, numberKey };
}

/** Suma por etiqueta (para gráficas y para comparar periodos, C3). */
export function sumByLabel(rows, labelKey, numberKey) {
  const map = new Map();
  for (const r of rows) {
    const label = String(r[labelKey] ?? '').trim() || '—';
    const n = parseAmount(r[numberKey]);
    if (!Number.isFinite(n)) continue;
    map.set(label, (map.get(label) || 0) + n);
  }
  return map;
}
