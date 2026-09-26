// Lista claves t('…') usadas en src/ que no existen en es.js (ayuda de desarrollo).
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '../src');
const es = (await import(pathToFileURL(path.join(root, 'i18n/es.js')).href)).default;
const files = [];
const walk = (d) => readdirSync(d).forEach(f => { const p = path.join(d, f); statSync(p).isDirectory() ? walk(p) : /\.(jsx?|mjs)$/.test(f) && files.push(p); });
walk(root);
const used = new Set();
for (const f of files) for (const m of readFileSync(f, 'utf8').matchAll(/\bt\(\s*['`]([a-zA-Z0-9_.]+)['`]/g)) used.add(m[1]);
const get = (k) => k.split('.').reduce((o, p) => (o == null ? undefined : o[p]), es);
const missing = [...used].filter(k => get(k) === undefined).sort();
console.log(missing.join('\n'));
console.log(`\n${missing.length} claves que faltan`);
