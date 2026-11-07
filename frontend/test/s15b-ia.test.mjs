/**
 * S15b · lote 5 (IA y diagnóstico): lógica pura del frontend.
 * Uso: node test/s15b-ia.test.mjs
 *   D7  la marca «[enlace: cobros]» / «/enlace: cobros» que copia la IA sale como botón, no como texto
 */
import { build } from 'esbuild';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'node_modules/.cache/s15b-ia.test.mjs');
await build({
  stdin: { contents: "export { extractToolLinks } from './src/utils/nokfiLinks.js';", resolveDir: root, loader: 'js' },
  bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'error'
});
const { extractToolLinks } = await import(pathToFileURL(out).href);

let fail = 0;
const check = (label, ok) => { if (ok) console.log('✅', label); else { fail++; console.log('❌', label); } };

const a = extractToolLinks('Transportes López te debe 2.904,00 €.\n/enlace: cobros');
check('D7: «/enlace: cobros» en su línea → botón de Cobros y la línea desaparece',
  a.links.length === 1 && a.links[0] === '/app/finanzas/cobros' && a.text === 'Transportes López te debe 2.904,00 €.');
const b = extractToolLinks('Aparta 31,98 € para el 303 [enlace: impuestos] antes del 1 de febrero.');
check('D7: «[enlace: impuestos]» dentro de una frase → botón de Impuestos y sin la marca en el texto',
  b.links[0] === '/app/finanzas/impuestos' && !/enlace/.test(b.text) && b.text.includes('antes del 1 de febrero'));
const c = extractToolLinks('Mira tu previsión (link: previsión).');
check('D7: también «link:» y con tilde («previsión»)', c.links[0] === '/app/finanzas/prevision' && !/link/.test(c.text));
const d = extractToolLinks('Te deben 2.420,00 €.\n/app/finanzas/cobros');
check('D7: la ruta normal sigue funcionando igual', d.links[0] === '/app/finanzas/cobros' && d.text === 'Te deben 2.420,00 €.');
const e = extractToolLinks('Un enlace: no es una pantalla de Nokfi.');
check('D7: «enlace:» con otra palabra no se toca', e.links.length === 0 && e.text === 'Un enlace: no es una pantalla de Nokfi.');

console.log(fail ? `\n❌ ${fail} fallos` : '\n✅ todo bien');
process.exit(fail ? 1 : 0);
