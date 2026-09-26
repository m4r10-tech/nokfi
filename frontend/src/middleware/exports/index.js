import { buildModel, slug } from './model';

/**
 * F5 — punto único de exportación. `doc` = { title, fileBase?, report?, html?,
 * health?, actions?, files?, tables?, companyName? }.
 *
 * Nombre de archivo: si hay `fileBase` (p.ej. la carpeta abierta en F3,
 * "facturas2026") el archivo se llama igual (facturas2026.pdf); si no,
 * "<título>_nokfi.<ext>".
 */
export const FORMATS = [
  { id: 'pdf', ext: 'pdf' },
  { id: 'docx', ext: 'docx' },
  { id: 'xlsx', ext: 'xlsx' },
  { id: 'csv', ext: 'csv' },
  { id: 'ods', ext: 'ods' },
  { id: 'odt', ext: 'odt' },
  { id: 'pptx', ext: 'pptx' },
  { id: 'json', ext: 'json' }
];

export async function exportDoc(format, doc, { t, lang }) {
  const f = FORMATS.find(x => x.id === format);
  if (!f) throw new Error(`Formato desconocido: ${format}`);
  const base = doc.fileBase ? slug(doc.fileBase) : `${slug(doc.title)}_nokfi`;
  const filename = `${base}.${f.ext}`;
  const model = buildModel(doc, t, lang);
  const labels = {
    sheet: t('report.reportSheet'), section: t('report.colSection'), item: t('report.colItem'),
    detail: t('report.colDetail'), extra: t('report.colExtra')
  };
  switch (format) {
    case 'pdf': { const { exportPdf } = await import('./pdf'); return exportPdf(model, filename); }
    case 'docx': { const { exportDocx } = await import('./office'); return exportDocx(model, filename); }
    case 'xlsx': case 'ods': { const { exportSheet } = await import('./office'); return exportSheet(model, filename, format, labels); }
    case 'csv': { const { exportCsv } = await import('./office'); return exportCsv(model, filename, labels); }
    case 'odt': { const { exportOdt } = await import('./office'); return exportOdt(model, filename); }
    case 'pptx': { const { exportPptx } = await import('./office'); return exportPptx(model, filename); }
    case 'json': { const { exportJson } = await import('./office'); return exportJson(doc, filename); }
    default: return undefined;
  }
}
