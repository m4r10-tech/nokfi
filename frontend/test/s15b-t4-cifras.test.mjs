/**
 * S15b · T4 · lote 11 (cifras, libro y facturas): lógica pura del frontend.
 * Uso: node test/s15b-t4-cifras.test.mjs
 *   xlsx/ods del libro con fecha de verdad e importes con 2 decimales
 *   signo menos coherente (−), trimestres de lo importado fuera del periodo,
 *   IRPF 1 %/2 % y sociedades sin retención en sus ingresos, textos en 6 idiomas
 */
import { build } from 'esbuild';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.join(root, 'package.json'));
const out = path.join(os.tmpdir(), `s15b-t4-cifras-${process.pid}.test.cjs`);
const entry = `
export { sheetBytes, toCsv } from './src/middleware/exports/office.js';
export { signedEur, periodsOutside } from './src/pages/finance/Ledger.jsx';
export { showIrpf } from './src/components/finance/EntryForm.jsx';
export { IRPF_RATES, irpfHintKey } from './src/components/finance/invoiceUtils.js';
export { translate, loadLanguage } from './src/i18n/index.js';
`;
await build({
  stdin: { contents: entry, resolveDir: root, loader: 'js' }, bundle: true, format: 'cjs', platform: 'node',
  // xlsx y jszip van dentro del bundle (CommonJS: el archivo sale en el tmp del sistema, sin node_modules al lado).
  external: ['docx', 'pptxgenjs', 'jspdf', 'jspdf-autotable', 'pdfjs-dist'], outfile: out, logLevel: 'error',
  loader: { '.jsx': 'jsx', '.js': 'jsx' }, jsx: 'automatic', define: { 'import.meta.env': '{}' }
});
const mod = require(out);
const XLSX = require('xlsx');
const JSZip = require('jszip');

let fail = 0;
const check = (label, ok) => { if (ok) console.log('✅', label); else { fail++; console.log('❌', label); } };

// ── Hojas del libro: fecha como fecha, importes con 2 decimales ──
const ledgerModel = {
  title: 'Libro', subtitle: '', blocks: [],
  tables: [{
    name: 'Libro', columns: [
      { key: 'invoice_date', label: 'Fecha', type: 'date' }, { key: 'party_name', label: 'Cliente' },
      { key: 'base', label: 'Base', type: 'money' }, { key: 'vat_rate', label: 'IVA %' }, { key: 'total', label: 'Total', type: 'money' }
    ],
    rows: [{ invoice_date: '2026-09-10', party_name: '=Cliente', base: 10.5, vat_rate: 21, total: -39.1 }]
  }]
};
const labels = { section: 's', item: 'i', detail: 'd', extra: 'e', sheet: 'Nokfi' };
{
  const bytes = await mod.sheetBytes(ledgerModel, 'xlsx', labels);
  const wb = XLSX.read(bytes, { cellDates: true, cellNF: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const a2 = ws.A2, c2 = ws.C2, e2 = ws.E2, d2 = ws.D2;
  const day = a2 && a2.v instanceof Date ? `${a2.v.getFullYear()}-${a2.v.getMonth() + 1}-${a2.v.getDate()}` : '';
  check('xlsx: la fecha es una fecha (no el texto «2026-09-10») y cae el 10-9-2026', a2?.t === 'd' && day === '2026-9-10' && /d.*m.*y/i.test(a2.z || ''));
  check('xlsx: importes numéricos con formato de 2 decimales', c2?.t === 'n' && c2.v === 10.5 && /0\.00/.test(c2.z || '') && e2?.v === -39.1 && /0\.00/.test(e2.z || ''));
  check('xlsx: el tipo de IVA sigue como número sin formato forzado y el texto peligroso neutralizado', d2?.v === 21 && ws.B2?.v === "'=Cliente");
}
{
  const bytes = await mod.sheetBytes(ledgerModel, 'ods', labels);
  const zip = await JSZip.loadAsync(bytes);
  const xml = await zip.file('content.xml').async('string');
  const names = Object.keys(zip.files);
  check('ods: la fecha es una celda de fecha del 10-9-2026', /office:value-type="date" office:date-value="2026-09-10T00:00:00/.test(xml) && xml.includes('10/09/2026'));
  check('ods: importes con estilo de 2 decimales (10,50 / -39,10)', /<number:number-style style:name="NKMONEY"><number:number number:decimal-places="2"/.test(xml)
    && /office:value="10.5" table:style-name="cekm"><text:p>10.50</.test(xml) && /office:value="-39.1" table:style-name="cekm"/.test(xml));
  check('ods: el tipo de IVA no lleva el estilo de importe y no queda ninguna marca invisible', /office:value="21"><text:p>21</.test(xml) && !xml.includes('⁣'));
  // ODF: el primer registro del ZIP es «mimetype» guardado sin comprimir (método 0 en la cabecera local).
  const raw = Buffer.from(bytes);
  check('ods: el archivo sigue siendo un ODF válido (mimetype primero y sin comprimir)', names[0] === 'mimetype' && raw.readUInt16LE(8) === 0
    && raw.toString('latin1', 30, 38) === 'mimetype' && raw.toString('latin1', 38, 84) === 'application/vnd.oasis.opendocument.spreadsheet');
  const back = XLSX.read(bytes, { cellDates: true });
  const s = back.Sheets[back.SheetNames[0]];
  check('ods: se vuelve a leer con la fecha y los importes como números', s.A2?.t === 'd' && s.C2?.v === 10.5 && s.E2?.v === -39.1);
}

// ── Signo menos y periodos ──
check('signo menos tipográfico (−) en los importes negativos del libro', mod.signedEur(-6.79, 'es') === '\u22126,79\u00a0€' && mod.signedEur(6.79, 'es') === '6,79\u00a0€'
  && mod.signedEur(-1327.69, 'en') === '\u2212€1,327.69' && !mod.signedEur(-1, 'fr').includes('-'));
for (const l of ['fr', 'de', 'it', 'pl']) await mod.loadLanguage(l);
const tl = (lang) => (k, v) => mod.translate(lang, k, v);
{
  const out = mod.periodsOutside([{ invoice_date: '2026-09-10' }, { invoice_date: '2026-09-30' }, { invoice_date: '2026-11-02' }, { invoice_date: '2026-06-01' }],
    { from: '2026-10-01', to: '2026-12-31' }, tl('es'));
  check('importar facturas de otro trimestre: dice en cuáles quedan (3T 2026 ×2, 2T 2026 ×1)', out.size === 2 && out.get('3T 2026') === 2 && out.get('2T 2026') === 1);
  check('… y en inglés con Q3/Q2', [...mod.periodsOutside([{ invoice_date: '2026-09-10' }], { from: '2026-10-01', to: '2026-12-31' }, tl('en')).keys()][0] === 'Q3 2026');
  check('nada fuera del periodo → sin aviso', mod.periodsOutside([{ invoice_date: '2026-10-10' }], { from: '2026-10-01', to: '2026-12-31' }, tl('es')).size === 0);
  const msg = mod.translate('es', 'finance.import.savedElsewhere', { n: 2, periods: '3T 2026' });
  check('aviso de lo importado en otro periodo (es, plural y singular)', msg.includes('3T 2026') && msg.startsWith('2 apuntes')
    && mod.translate('es', 'finance.import.savedElsewhere', { n: 1, periods: '3T 2026' }).startsWith('1 apunte es'));
}

// ── IRPF del apunte manual ──
check('apunte manual con los mismos tipos de IRPF que la factura (1 % y 2 % incluidos)', [0, 1, 2, 7, 15, 19].every(v => mod.IRPF_RATES.includes(v)));
check('sociedad: sin retención en sus ingresos (gastos sí, y un apunte que ya la tiene se sigue viendo)',
  !mod.showIrpf({ type: 'income', irpf_rate: 0, irpf_amount: '' }, 'sociedad') && mod.showIrpf({ type: 'expense', irpf_rate: 0 }, 'sociedad')
  && mod.showIrpf({ type: 'income', irpf_rate: 19, irpf_amount: 190 }, 'sociedad') && mod.showIrpf({ type: 'income', irpf_rate: 0 }, 'autonomo')
  && mod.showIrpf({ type: 'income', irpf_rate: 0 }, ''));
check('facturas de una sociedad: pista de retención propia (no la de profesionales)', mod.irpfHintKey('sociedad') === 'invoices.irpfHintCompany' && mod.irpfHintKey('autonomo') === 'invoices.irpfHint');

// ── Textos en los 6 idiomas ──
const LANGS = ['es', 'en', 'fr', 'de', 'it', 'pl'];
const KEYS = ['finance.emptyPeriodTitle', 'finance.emptyPeriodDesc', 'finance.exportEmpty', 'finance.exportNoneFiltered', 'finance.filteredTotals', 'finance.companyNoIrpf',
  'finance.import.checkingFree', 'finance.import.savedElsewhere', 'finance.taxes.irpfExplain', 'invoices.irpfHintCompany'];
check('claves nuevas en los 6 idiomas', LANGS.every(l => KEYS.every(k => mod.translate(l, k) !== k)));
check('onboarding.remindersHint sin «130» (vale también para una sociedad) en los 6 idiomas', LANGS.every(l => !/130/.test(mod.translate(l, 'onboarding.remindersHint')) && /303/.test(mod.translate(l, 'onboarding.remindersHint'))));
check('el 130 explica el 5 % de difícil justificación', LANGS.every(l => /5 %/.test(mod.translate(l, 'finance.taxes.irpfExplain')) && /110\.3\.c/.test(mod.translate(l, 'finance.taxes.irpfExplain'))));
check('lectura de facturas electrónicas: «no gasta créditos» (no «análisis»)', ['xmlFree', 'willReadFree', 'xmlInBatch'].every(k => /crédito/.test(mod.translate('es', `finance.import.${k}`, { n: 2 })))
  && !/análisis/.test(mod.translate('es', 'finance.import.willReadFree', { n: 1 })) && /credit/.test(mod.translate('en', 'finance.import.xmlInBatch', { n: 2 })));
check('pl: «Zużyje to 1 kredyt» también con 2-4 y 5+ facturas', /kredyt/.test(mod.translate('pl', 'finance.import.willRead', { n: 3 })) && /kredyt/.test(mod.translate('pl', 'finance.import.willRead', { n: 7 })));

process.exit(fail ? 1 : 0);
