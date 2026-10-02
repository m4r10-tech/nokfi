/**
 * Prerender de las páginas públicas + sitemap.xml (sesión 12, SEO).
 *
 * `npm run build` = vite build (la SPA) → vite build --ssr (src/entry-server.jsx
 * en dist-ssr/) → este script. Para cada ruta de src/seo/routes.js renderiza
 * la app con React en Node (renderToPipeableStream, esperando a las partes
 * lazy) y guarda dist/<ruta>/index.html con el contenido y sus metaetiquetas
 * (title, description, canonical, hreflang, Open Graph, JSON-LD). Nginx lo
 * sirve con `try_files $uri $uri/ /index.html`: Google recibe el contenido sin
 * ejecutar JS, y en el navegador main.jsx hidrata ese HTML.
 *
 * - Precios: GET /api/payments/plans de producción (PRERENDER_API=<url> para
 *   cambiarlo). Si no responde, las páginas salen sin precios (no falla).
 * - Falla (exit 1) si una página no tiene canonical, h1 o título.
 * - No es un servidor de SSR: en producción solo hay HTML estático.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { SEO_PAGES, SITE } from '../src/seo/routes.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const SSR = path.join(ROOT, 'dist-ssr');
const API = (process.env.PRERENDER_API || SITE).replace(/\/$/, '');

const escAttr = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
const escText = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
// Dentro de <script> solo hay que evitar que el texto cierre la etiqueta.
const escScript = (s) => String(s).replace(/</g, '\\u003c');

function tagHtml({ tag, attrs, text }) {
  const a = Object.entries(attrs).map(([k, v]) => ` ${k}="${escAttr(v)}"`).join('');
  if (tag === 'script') return `<script data-seo${a}>${escScript(text || '')}</script>`;
  return `<${tag} data-seo${a}>`;
}

/** Quita del index.html las etiquetas que la página va a sustituir. */
function stripHead(shell) {
  return shell
    .replace(/<title>[\s\S]*?<\/title>\s*/, '')
    .replace(/<link rel="canonical"[^>]*>\s*/, '')
    .replace(/<meta name="description"[^>]*>\s*/, '')
    .replace(/<meta (property|name)="(og:title|og:description|og:url|twitter:title|twitter:description)"[^>]*>\s*/g, '');
}

async function fetchPlans() {
  try {
    const r = await fetch(`${API}/api/payments/plans`, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(10000) });
    const data = await r.json();
    return Array.isArray(data.plans) && data.plans.length ? data.plans : null;
  } catch {
    console.warn(`⚠️  Prerender: no se pudieron leer los planes de ${API}; las páginas salen sin precios.`);
    return null;
  }
}

function sitemap() {
  const today = new Date().toISOString().slice(0, 10);
  const urls = SEO_PAGES.flatMap(page => Object.values(page.paths).map(route => {
    const alts = Object.keys(page.paths).length > 1
      ? [...Object.entries(page.paths).map(([l, p]) => `    <xhtml:link rel="alternate" hreflang="${l}" href="${SITE}${p}"/>`),
        `    <xhtml:link rel="alternate" hreflang="x-default" href="${SITE}${page.paths.es}"/>`].join('\n') + '\n'
      : '';
    return `  <url>\n    <loc>${SITE}${route}</loc>\n${alts}    <lastmod>${today}</lastmod>\n    <priority>${page.priority ?? 0.5}</priority>\n  </url>`;
  }));
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${urls.join('\n')}\n</urlset>\n`;
}

const shell = stripHead(fs.readFileSync(path.join(DIST, 'index.html'), 'utf8'));
if (!shell.includes('<div id="root"></div>')) throw new Error('index.html sin <div id="root"></div>');
const { render } = await import(pathToFileURL(path.join(SSR, 'entry-server.js')).href);
const plans = await fetchPlans();
const plansScript = plans ? `<script type="application/json" id="nokfi-plans">${escScript(JSON.stringify(plans))}</script>` : '';

let count = 0;
try {
  for (const page of SEO_PAGES) {
    for (const [lang, route] of Object.entries(page.paths)) {
      const { html, head } = await render(route, { plans });
      if (!head?.title) throw new Error(`${route}: la página no llama a useSeo (sin título)`);
      if (!head.tags.some(t => t.attrs.rel === 'canonical' && t.attrs.href === SITE + route)) throw new Error(`${route}: sin canonical ${SITE + route}`);
      if (!/<h1[\s>]/.test(html)) throw new Error(`${route}: sin <h1>`);
      const doc = shell
        .replace(/<html lang="[^"]*">/, `<html lang="${lang}" class="theme-dark">`)
        .replace('</head>', `  <title>${escText(head.title)}</title>\n  ${head.tags.map(tagHtml).join('\n  ')}\n  ${plansScript}\n</head>`)
        .replace('<div id="root"></div>', `<div id="root" data-prerendered="${escAttr(route)}">${html}</div>`);
      const file = path.join(DIST, route.replace(/^\//, ''), 'index.html');
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, doc);
      count++;
    }
  }
  fs.writeFileSync(path.join(DIST, 'sitemap.xml'), sitemap());
  console.log(`✅ Prerender: ${count} páginas y sitemap.xml en dist/${plans ? '' : ' (sin precios)'}`);
} catch (e) {
  console.error(`❌ Prerender: ${e.stack || e.message}`);
  process.exitCode = 1;
} finally {
  fs.rmSync(SSR, { recursive: true, force: true });
}
