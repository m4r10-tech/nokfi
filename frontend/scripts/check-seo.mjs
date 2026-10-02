/**
 * Comprobaciones de la sesión 12 (SEO). Uso: npm run check:seo
 *  1. El calendario fiscal del frontend (página pública) y el del backend
 *     (app, API, avisos por email) dan las mismas fechas.
 *  2. Cada página pública tiene contenido en es y en (título, descripción,
 *     H1, FAQ) y las rutas no se repiten.
 */
import { createRequire } from 'node:module';
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

console.log(problems ? `❌ ${problems} problemas` : `✅ SEO: calendario igual en frontend y backend; ${seen.size} rutas públicas con contenido`);
process.exit(problems ? 1 : 0);
