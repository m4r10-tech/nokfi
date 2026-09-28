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

/**
 * CSV: se decodifica a mano. SheetJS asume Windows-1252 al leer bytes, así
 * que un CSV en UTF-8 salía con tildes rotas ("bÃ¡sica"). Se prueba UTF-8
 * estricto y, si no es válido, Windows-1252 (lo que exporta Excel en España).
 */
function decodeCsv(buffer) {
  try { return new TextDecoder('utf-8', { fatal: true }).decode(buffer).replace(/^\uFEFF/, ''); }
  catch { return new TextDecoder('windows-1252').decode(buffer); }
}

/** Date de SheetJS (medianoche local, a veces con segundos de desfase) → 'YYYY-MM-DD'. */
function dateToIso(d) {
  const r = new Date(d.getTime() + 60000); // absorbe el desfase de segundos de SheetJS
  return `${r.getFullYear()}-${String(r.getMonth() + 1).padStart(2, '0')}-${String(r.getDate()).padStart(2, '0')}`;
}

/**
 * Celda de CSV (texto) → valor. SheetJS, al interpretar un CSV, convierte
 * "2026-07-20" en el número de serie 46223 y "1.100,50" en 1,1005; por eso
 * los CSV se leen como texto (raw) y aquí se interpretan: las fechas
 * "dd/mm/aaaa" pasan a ISO y los importes a número con parseAmount.
 */
function csvCell(v) {
  const s = String(v ?? '').trim();
  if (!s) return '';
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const d = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (d) return `${d[3]}-${d[2].padStart(2, '0')}-${d[1].padStart(2, '0')}`;
  if (/^[-+(]?[\d.,\s]+\)?\s*€?$/.test(s) && /\d/.test(s)) {
    const n = parseAmount(s.replace(/^\((.*)\)$/, '-$1'));
    if (Number.isFinite(n)) return n;
  }
  return s;
}

export async function readTabular(file) {
  try {
    const XLSX = await import('xlsx');
    const buffer = await file.arrayBuffer();
    if (extOf(file.name) === '.csv') {
      const wb = XLSX.read(decodeCsv(buffer), { type: 'string', raw: true });
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '', raw: true });
      return rows.map(r => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, csvCell(v)])));
    }
    // Excel/ODS: las celdas con formato de fecha llegan como Date → ISO.
    const wb = XLSX.read(buffer, { type: 'array', cellDates: true });
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' });
    return rows.map(r => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v instanceof Date && !isNaN(v) ? dateToIso(v) : v])));
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
  else if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, ''); // "1.100" = mil cien
  else s = s.replace(/,/g, '');
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

/**
 * Heurística de columnas: la etiqueta es la primera de texto; el valor es la
 * columna numérica que parece DINERO (importe, total, ventas, €…) y, si
 * ninguna lo parece, la de mayor suma (antes se cogía la primera numérica y
 * salían "unidades" en vez de "importe").
 */
const MONEY_COL = /importe|total|venta|ingreso|factur|euro|€|precio|saldo|coste|gasto|amount|revenue|price|sales|montant|prix|umsatz|betrag|preis|importo|prezzo|kwota|cena|wartość|przych/i;

export function detectColumns(rows) {
  if (!rows?.length) return {};
  const keys = Object.keys(rows[0]);
  const sample = rows.slice(0, 20);
  const isNum = (k) => sample.filter(r => r[k] !== '' && r[k] != null).every(r => Number.isFinite(parseAmount(r[k])))
    && sample.some(r => r[k] !== '' && r[k] != null);
  const numeric = keys.filter(isNum);
  const sumOf = (k) => rows.reduce((acc, r) => acc + (Number.isFinite(parseAmount(r[k])) ? Math.abs(parseAmount(r[k])) : 0), 0);
  const numberKey = numeric.find(k => MONEY_COL.test(k)) || numeric.sort((a, b) => sumOf(b) - sumOf(a))[0];
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

/* ── Vista rápida del Excel (sesión 6) ──
 * Solo se pinta si hay una columna de FECHA y una de IMPORTE. Nunca se suma
 * un saldo acumulado: de un saldo se usa el último valor de cada fecha.
 * Con columnas de entrada y salida se usa el neto (entrada − salida).
 */
const DATE_HEADER = /fecha|date|data|datum|d[ií]a|jour|giorno|tag|dzie/i;
const BALANCE_COL = /saldo|balance|acumulado|solde|kontostand|stan konta/i;
const IN_COL = /entrada|ingreso|cobro|haber|abono|income|inflow|credit|recette|entrata|einnahme|wp[łl]yw|przych/i;
const OUT_COL = /salida|gasto|pago|debe|cargo|expense|outflow|debit|d[ée]pense|uscita|ausgabe|wydat|rozch/i;
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

export function detectQuickView(rows) {
  if (!rows?.length) return null;
  const keys = Object.keys(rows[0]);
  const sample = rows.slice(0, 50);
  const filled = (k) => sample.filter(r => r[k] !== '' && r[k] != null);
  const dateKey = keys.find(k => { const v = filled(k); return v.length && v.filter(r => ISO_DAY.test(String(r[k]))).length >= v.length * 0.8; })
    || null;
  if (!dateKey) return null;
  const isNum = (k) => { const v = filled(k); return v.length > 0 && v.every(r => Number.isFinite(parseAmount(r[k]))); };
  const numeric = keys.filter(k => k !== dateKey && isNum(k) && !DATE_HEADER.test(k));
  const money = numeric.filter(k => MONEY_COL.test(k) || IN_COL.test(k) || OUT_COL.test(k));
  const balanceKey = money.find(k => BALANCE_COL.test(k)) || null;
  const flows = money.filter(k => k !== balanceKey);
  const inKey = flows.find(k => IN_COL.test(k)), outKey = flows.find(k => OUT_COL.test(k) && k !== inKey);
  const amountKey = inKey && outKey ? null : (flows.find(k => /importe|total|amount|betrag|importo|kwota|montant/i.test(k)) || flows[0] || null);
  if (!amountKey && !(inKey && outKey) && !balanceKey) return null;
  return { dateKey, amountKey, inKey: inKey && outKey ? inKey : null, outKey: inKey && outKey ? outKey : null, balanceKey };
}

/** Serie por fecha (día, o mes si hay muchos días) + KPIs. */
export function quickViewData(rows, cols) {
  const val = (r, k) => { const n = parseAmount(r[k]); return Number.isFinite(n) ? n : null; };
  const amountOf = (r) => (cols.inKey ? (val(r, cols.inKey) || 0) - Math.abs(val(r, cols.outKey) || 0) : cols.amountKey ? val(r, cols.amountKey) : null);
  const dated = rows.filter(r => ISO_DAY.test(String(r[cols.dateKey])));
  if (!dated.length) return null;
  const days = new Set(dated.map(r => r[cols.dateKey]));
  const byMonth = days.size > 60;
  const bucketOf = (r) => (byMonth ? String(r[cols.dateKey]).slice(0, 7) : r[cols.dateKey]);
  const buckets = new Map();
  const amounts = [];
  let totalIn = 0, totalOut = 0;
  for (const r of dated) {
    if (cols.inKey) { totalIn += val(r, cols.inKey) || 0; totalOut += Math.abs(val(r, cols.outKey) || 0); }
    const b = bucketOf(r);
    const o = buckets.get(b) || { date: b, amount: 0, balance: null };
    const a = amountOf(r);
    if (a !== null) { o.amount += a; amounts.push(a); }
    if (cols.balanceKey) { const s = val(r, cols.balanceKey); if (s !== null) o.balance = s; } // último valor de la fecha
    buckets.set(b, o);
  }
  const series = [...buckets.values()].sort((a, b) => a.date.localeCompare(b.date)).map(o => ({ ...o, amount: Math.round(o.amount * 100) / 100 }));
  const total = amounts.reduce((s, x) => s + x, 0);
  const balances = series.filter(s => s.balance !== null);
  return {
    series, byMonth,
    hasAmount: amounts.length > 0,
    total: Math.round(total * 100) / 100,
    totalIn: Math.round(totalIn * 100) / 100, totalOut: Math.round(totalOut * 100) / 100,
    average: amounts.length ? Math.round((total / amounts.length) * 100) / 100 : null,
    balanceEnd: balances.length ? balances[balances.length - 1].balance : null,
    balanceMin: balances.length ? balances.reduce((m, s) => (s.balance < m.balance ? s : m)) : null,
    from: series[0].date, to: series[series.length - 1].date
  };
}
