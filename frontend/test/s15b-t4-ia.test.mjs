/**
 * S15b · T4 · lote 12 (IA y diagnóstico): lógica pura del frontend.
 * Uso: node test/s15b-t4-ia.test.mjs
 *   8  el historial muestra igual las cifras clave de análisis antiguos con formatos irregulares
 */
import { build } from 'esbuild';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'node_modules/.cache/s15b-t4-ia.test.mjs');
await build({
  stdin: { contents: "export { keyFigureValue } from './src/utils/keyFigure.js';", resolveDir: root, loader: 'js' },
  bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'error'
});
const { keyFigureValue: kv } = await import(pathToFileURL(out).href);

let fail = 0;
const check = (label, ok) => { if (ok) console.log('✅', label); else { fail++; console.log('❌', label, ok); } };
const sp = (s) => String(s).replace(/[  ]/g, ' ');

check('8: «2.301,58» sin € (Saldo inicial) → «2.301,58 €»', sp(kv('2.301,58', 'Saldo inicial', 'es')) === '2.301,58 €');
check('8: el número pelado «2301.58» → «2.301,58 €» (como los nuevos)', sp(kv('2301.58', 'Saldo inicial', 'es')) === '2.301,58 €');
check('8: «9.043,96 €» queda igual', sp(kv('9.043,96 €', 'Saldo final', 'es')) === '9.043,96 €');
check('8: «€2301.58» y «2301,58 EUR» → «2.301,58 €»', sp(kv('€2301.58', '', 'es')) === '2.301,58 €' && sp(kv('2301,58 EUR', '', 'es')) === '2.301,58 €');
check('8: en inglés «2.301,58» → «€2,301.58»', sp(kv('2.301,58', 'Opening balance', 'en')) === '€2,301.58');
check('8: un recuento sin céntimos ni etiqueta de importes no lleva € («34»)', kv('34', 'Productos', 'es') === '34');
check('8: miles al estilo español «1.200» con etiqueta de importes → «1.200,00 €»', sp(kv('1.200', 'Ventas', 'es')) === '1.200,00 €');
check('8: lo que no es una cifra suelta se deja igual («42/100», «+12 %», «3 meses»)',
  kv('42/100', 'Nota', 'es') === '42/100' && kv('+12 %', 'Ventas', 'es') === '+12 %' && kv('3 meses', 'Colchón', 'es') === '3 meses');

console.log(fail ? `\n❌ ${fail} fallos` : '\n✅ todo bien');
process.exit(fail ? 1 : 0);
