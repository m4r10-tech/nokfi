/**
 * S15b · lote 4 (cifras e impuestos): pruebas de lo que es lógica pura del
 * frontend. Uso: node test/s15b-cifras.test.mjs
 *   L2  CSV del libro con fechas DD/MM/AAAA e importes con 2 decimales
 *   L4  XML que no es factura → ERR_NOT_EINVOICE (no ERR_FILE_READ)
 *   F9  trimestres traducidos (1T / Q1 / T1…)
 *   L3  «sin resultados» propio del libro y de VERI*FACTU (no el del historial)
 */
import { build } from 'esbuild';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'node_modules/.cache/s15b-cifras.test.mjs');
const entry = `
export { toCsv } from './src/middleware/exports/office.js';
export { fileErrorMessage, FileReadError } from './src/middleware/fileErrors.js';
export { quarterLabel } from './src/utils/money.js';
export { translate, loadLanguage } from './src/i18n/index.js';
`;
await build({
  stdin: { contents: entry, resolveDir: root, loader: 'js' }, bundle: true, format: 'esm', platform: 'node',
  external: ['docx', 'pptxgenjs', 'jszip', 'xlsx', 'jspdf', 'jspdf-autotable'], outfile: out, logLevel: 'error'
});
const { toCsv, fileErrorMessage, FileReadError, quarterLabel, translate, loadLanguage } = await import(pathToFileURL(out).href);
for (const l of ['fr', 'de', 'it', 'pl']) await loadLanguage(l);

let fail = 0;
const check = (label, ok) => { if (ok) console.log('✅', label); else { fail++; console.log('❌', label); } };

// L2
const csv = toCsv([['Fecha', 'Base', 'IVA %', 'Total'], ['2026-09-10', 200, 21, -39.1], ['2026-01-02', 10.5, 0, 1234.567]], ';', ['date', 'money', undefined, 'money']);
const lines = csv.replace('﻿', '').split('\r\n');
check('L2: CSV con fecha 10/09/2026 e importes 200,00 / -39,10', lines[1] === '10/09/2026;200,00;21;-39,10');
check('L2: redondeo a 2 decimales (1234,57) y 10,50', lines[2] === '02/01/2026;10,50;0;1234,57');
check('L2: la cabecera no se toca', lines[0] === 'Fecha;Base;IVA %;Total');
check('L2: sin tipos, el CSV sigue como antes (otras exportaciones)', toCsv([['a'], [10.5]]).endsWith('10,5'));

// L4
const t = (k) => translate('es', k);
const xmlErr = fileErrorMessage(t, new FileReadError('ERR_NOT_EINVOICE', 'malo.xml'));
check('L4: XML que no es factura → ERR_NOT_EINVOICE con mensaje propio', xmlErr.code === 'ERR_NOT_EINVOICE' && xmlErr.message.includes('malo.xml') && xmlErr.message.includes('Facturae'));
const bigErr = fileErrorMessage(t, Object.assign(new Error('big'), { code: 'ERR_FILE_TOO_BIG', fileName: 'x.pdf' }));
check('L4: un error con código conocido no se convierte en ERR_FILE_READ', bigErr.code === 'ERR_FILE_TOO_BIG');
check('L4: aviso de duplicado sin «NIF»', !/NIF/.test(translate('es', 'finance.duplicateEntry')));

// F9
const tl = (lang) => (k, v) => translate(lang, k, v);
check('F9: 3T 2026 (es), Q3 2026 (en), T3 2026 (fr)', quarterLabel(tl('es'), 3, 2026) === '3T 2026' && quarterLabel(tl('en'), 3, 2026) === 'Q3 2026' && quarterLabel(tl('fr'), 3, 2026) === 'T3 2026');
check('F9: los 6 idiomas tienen finance.quarterShort', ['es', 'en', 'fr', 'de', 'it', 'pl'].every(l => translate(l, 'finance.quarterShort') !== 'finance.quarterShort'));

// L3
check('L3: el libro tiene su propio «sin resultados» (apunte, no análisis)', /apunte/.test(translate('es', 'finance.noResults')) && !/análisis/.test(translate('es', 'finance.noResults')));
check('L3: VERI*FACTU tiene su propio «sin resultados»', /registro/.test(translate('es', 'verifactu.noResults')));

process.exit(fail ? 1 : 0);
