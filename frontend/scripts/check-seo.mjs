/**
 * Comprobaciones de la sesión 12 (SEO). Uso: npm run check:seo
 *  1. El calendario fiscal del frontend (página pública) y el del backend
 *     (app, API, avisos por email) dan las mismas fechas.
 *  2. Cada página pública tiene contenido en es y en (título, descripción,
 *     H1, FAQ) y las rutas no se repiten.
 *  3. S15b (U8): la imagen al compartir es cuadrada (og:image 512x512 que
 *     existe en public/ con esas medidas, twitter:card=summary) en index.html
 *     y, si hay build, en todas las páginas prerenderizadas de dist/.
 *  4. /llms.txt (resumen para los asistentes de IA): si hay build, existe en
 *     dist/, es texto (no la SPA) y enlaza todas las páginas públicas. La
 *     clave de IndexNow de scripts/indexnow.mjs está publicada en public/.
 */
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { deadlinesFor } from '../src/utils/fiscalCalendar.js';
import { SEO_PAGES } from '../src/seo/routes.js';
import es from '../src/seo/content/es.js';
import en from '../src/seo/content/en.js';

const require = createRequire(import.meta.url);
const backend = require('../../backend/utils/fiscalCalendar.js');

let problems = 0;
const fail = (msg) => { problems++; console.log('❌', msg); };

for (let y = 2025; y <= 2030; y++) {
  for (const form of [undefined, 'autonomo', 'sociedad']) {
    if (JSON.stringify(deadlinesFor(y, form)) !== JSON.stringify(backend.deadlinesFor(y, form))) fail(`calendario ${y} ${form || 'todos'}: el frontend y el backend no coinciden`);
  }
}

const seen = new Set();
for (const page of SEO_PAGES) {
  for (const path of Object.values(page.paths)) {
    if (seen.has(path)) fail(`ruta repetida: ${path}`);
    seen.add(path);
  }
  const key = page.toolId || page.id.replace(/^guide-/, '');
  for (const [lang, c] of [['es', es], ['en', en]]) {
    const item = page.guide ? c.guides[page.guide] : page.tool || page.toolId ? c.tools[key] : null;
    if ((page.guide || page.tool || page.toolId) && !item) { fail(`${page.id}: falta el contenido en ${lang}`); continue; }
    if (!item) continue;
    for (const f of ['title', 'description', 'h1', 'intro']) if (!item[f]) fail(`${page.id} (${lang}): falta ${f}`);
    if (item.title && item.title.length > 65) fail(`${page.id} (${lang}): título de ${item.title.length} caracteres (máx. 65)`);
    if (item.description && (item.description.length < 70 || item.description.length > 160)) fail(`${page.id} (${lang}): descripción de ${item.description.length} caracteres (70-160)`);
    if (!item.faq?.length) fail(`${page.id} (${lang}): sin preguntas frecuentes`);
  }
}

// 3. Imagen al compartir cuadrada (U8).
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const metaOf = (html, attr, name) => (html.match(new RegExp(`<meta ${attr}="${name}" content="([^"]*)"`)) || [])[1];
function checkShare(file, html) {
  const img = metaOf(html, 'property', 'og:image');
  const w = metaOf(html, 'property', 'og:image:width');
  const h = metaOf(html, 'property', 'og:image:height');
  if (!img) return fail(`${file}: sin og:image`);
  if (!w || w !== h) fail(`${file}: og:image no es cuadrada (${w}x${h})`);
  if (metaOf(html, 'name', 'twitter:card') !== 'summary') fail(`${file}: twitter:card debe ser summary`);
  if (metaOf(html, 'name', 'twitter:image') !== img) fail(`${file}: twitter:image distinta de og:image`);
  const local = path.join(ROOT, 'public', new URL(img).pathname);
  if (!fs.existsSync(local)) return fail(`${file}: ${img} no existe en public/`);
  const png = fs.readFileSync(local);
  const pw = png.readUInt32BE(16), ph = png.readUInt32BE(20);
  if (pw !== ph || String(pw) !== w) fail(`${file}: la imagen mide ${pw}x${ph} y las etiquetas dicen ${w}x${h}`);
  // S15b: la imagen de los datos estructurados (la que usa Google en los resultados) es la
  // misma que la de compartir; nunca la vieja og-image.png (rectangular, logo pequeño).
  if (html.includes('/og-image.png')) fail(`${file}: cita la imagen vieja og-image.png`);
  for (const m of html.matchAll(/"image":"([^"]+)"/g)) if (m[1] !== img) fail(`${file}: JSON-LD con image ${m[1]} (debe ser ${img})`);
}
// La URL vieja sigue publicada para los resultados que Google ya tiene guardados: que sea la cuadrada.
{
  const old = path.join(ROOT, 'public', 'og-image.png');
  if (fs.existsSync(old)) { const b = fs.readFileSync(old); if (b.readUInt32BE(16) !== b.readUInt32BE(20)) fail('public/og-image.png sigue siendo la imagen vieja (no cuadrada)'); }
}
checkShare('index.html', fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8'));
let shared = 1;
const walk = (dir) => {
  if (!fs.existsSync(dir)) return;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const f = path.join(dir, e.name);
    if (e.isDirectory()) walk(f);
    else if (e.name === 'index.html') { checkShare(path.relative(ROOT, f), fs.readFileSync(f, 'utf8')); shared++; }
  }
};
walk(path.join(ROOT, 'dist'));

// 4. llms.txt e IndexNow.
{
  const { SITE } = await import('../src/seo/routes.js');
  const llms = path.join(ROOT, 'dist', 'llms.txt');
  if (fs.existsSync(path.join(ROOT, 'dist'))) {
    if (!fs.existsSync(llms)) fail('dist/llms.txt no existe (lo escribe scripts/prerender.mjs)');
    else {
      const txt = fs.readFileSync(llms, 'utf8');
      if (!txt.startsWith('# Nokfi')) fail('dist/llms.txt no empieza por «# Nokfi» (¿es HTML?)');
      for (const page of SEO_PAGES.filter(p => p.guide || p.tool || ['home', 'pricing', 'api-docs'].includes(p.id))) {
        for (const route of Object.values(page.paths)) if (!txt.includes(`(${SITE}${route})`) && !txt.includes(`: ${SITE}${route}\n`)) fail(`dist/llms.txt no enlaza ${route}`);
      }
      if (/\{\w+\}|undefined/.test(txt)) fail('dist/llms.txt tiene un hueco sin rellenar ({…} o undefined)');
    }
  }
  const { INDEXNOW_KEY } = await import('./indexnow.mjs');
  const keyFile = path.join(ROOT, 'public', `${INDEXNOW_KEY}.txt`);
  if (!fs.existsSync(keyFile) || fs.readFileSync(keyFile, 'utf8').trim() !== INDEXNOW_KEY) fail(`public/${INDEXNOW_KEY}.txt no existe o no contiene la clave de IndexNow`);
}

console.log(problems ? `❌ ${problems} problemas` : `✅ SEO: calendario igual en frontend y backend; ${seen.size} rutas públicas con contenido; imagen al compartir cuadrada en ${shared} páginas; llms.txt e IndexNow`);
process.exit(problems ? 1 : 0);
