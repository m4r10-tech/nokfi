/**
 * Comprueba que TODOS los diccionarios tienen exactamente las mismas claves
 * que es.js (fuente de verdad), incluidos arrays (misma longitud y forma) y
 * los marcadores {n}/{name}… de cada texto. Uso: npm run check:i18n
 */
import { readdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '../src/i18n');
const load = async (f) => (await import(pathToFileURL(path.join(dir, f)).href)).default;
const base = await load('es.js');
const files = readdirSync(dir).filter(f => /^[a-z]{2}\.js$/.test(f) && f !== 'es.js');
const vars = (s) => (String(s).match(/\{[a-z]+\}/gi) || []).sort().join(',');

let problems = 0;
function walk(a, b, p, lang) {
  if (Array.isArray(a)) {
    if (!Array.isArray(b)) { problems++; return console.log(`[${lang}] ${p}: debería ser array`); }
    if (a.length !== b.length) { problems++; console.log(`[${lang}] ${p}: ${b.length} elementos (es: ${a.length})`); }
    a.forEach((v, i) => b[i] !== undefined && walk(v, b[i], `${p}[${i}]`, lang));
    return;
  }
  if (a && typeof a === 'object') {
    if (!b || typeof b !== 'object') { problems++; return console.log(`[${lang}] ${p}: falta`); }
    for (const k of Object.keys(a)) {
      if (!(k in b)) { problems++; console.log(`[${lang}] ${p ? p + '.' : ''}${k}: falta`); }
      else walk(a[k], b[k], p ? `${p}.${k}` : k, lang);
    }
    for (const k of Object.keys(b)) if (!(k in a)) { problems++; console.log(`[${lang}] ${p ? p + '.' : ''}${k}: sobra`); }
    return;
  }
  if (typeof a === 'string' && typeof b === 'string' && vars(a) !== vars(b)) {
    problems++; console.log(`[${lang}] ${p}: marcadores ${vars(b)} ≠ es ${vars(a)}`);
  }
}
for (const f of files) walk(base, await load(f), '', f.slice(0, 2));
console.log(problems ? `❌ ${problems} diferencias` : `✅ ${files.length} idiomas con las mismas claves que es.js`);
process.exit(problems ? 1 : 0);
