/**
 * Páginas públicas indexables (sesión 12, SEO) — lista ÚNICA.
 *
 * La usan el router (App.jsx), el selector de idioma, las metaetiquetas
 * (useSeo), el pie con las herramientas y el script de prerender + sitemap
 * (scripts/prerender.mjs). Añadir una página pública = añadirla aquí.
 *
 * Idiomas en Google: castellano en la raíz y inglés bajo /en (hreflang).
 * fr/it/de/pl siguen en la app, pero no tienen URL propia.
 *
 * `strict`: el contenido largo solo existe en es/en → la página se muestra
 * siempre en el idioma de su URL. Sin `strict` (landing, precios), la URL
 * manda si el visitante usa es/en; con fr/it/de/pl se le muestra su idioma.
 */
import { GUIDE_SLUGS } from './guideSlugs.js';

export const SITE = 'https://nokfi.app';
export const SEO_LANGS = ['es', 'en'];

/** Año del calendario fiscal público (el del build y el siguiente). */
export const CALENDAR_YEARS = (() => {
  const y = new Date().getFullYear();
  return [y, y + 1];
})();

const BASE = [
  { id: 'home', paths: { es: '/home', en: '/en' }, priority: 1 },
  { id: 'pricing', paths: { es: '/pricing', en: '/en/pricing' }, priority: 0.9 },
  { id: 'autonomo', tool: true, strict: true, paths: { es: '/calculadora-cuota-autonomos', en: '/en/spain-self-employed-quota-calculator' }, priority: 0.9 },
  { id: 'iva', tool: true, strict: true, paths: { es: '/calculadora-iva', en: '/en/spain-vat-calculator' }, priority: 0.9 },
  { id: 'irpf', tool: true, strict: true, paths: { es: '/calculadora-retencion-irpf', en: '/en/spain-irpf-withholding-calculator' }, priority: 0.8 },
  { id: 'empleado', tool: true, strict: true, paths: { es: '/calculadora-coste-empleado', en: '/en/spain-employee-cost-calculator' }, priority: 0.8 },
  { id: 'hora', tool: true, strict: true, paths: { es: '/calculadora-precio-hora', en: '/en/hourly-rate-calculator' }, priority: 0.8 },
  ...CALENDAR_YEARS.map((y, i) => ({
    id: `calendario-${y}`, tool: i === 0, toolId: 'calendario', year: y, strict: true,
    paths: { es: `/calendario-fiscal-${y}`, en: `/en/spain-tax-calendar-${y}` }, priority: i === 0 ? 0.9 : 0.7
  })),
  { id: 'nif', tool: true, strict: true, paths: { es: '/validar-nif', en: '/en/spanish-nif-validator' }, priority: 0.8 },
  { id: 'guides', strict: true, paths: { es: '/guias', en: '/en/guides' }, priority: 0.7 },
  ...GUIDE_SLUGS.map(g => ({ id: `guide-${g.id}`, guide: g.id, strict: true, paths: { es: `/guias/${g.es}`, en: `/en/guides/${g.en}` }, priority: 0.7 })),
  { id: 'api-docs', paths: { es: '/api-docs', en: '/en/api-docs' }, priority: 0.5 },
  { id: 'privacy', paths: { es: '/privacidad' }, priority: 0.3 },
  { id: 'terms', paths: { es: '/terminos' }, priority: 0.3 },
  { id: 'dpa', paths: { es: '/encargo-tratamiento' }, priority: 0.2 }
];

export const SEO_PAGES = BASE;

/** Herramientas del pie y de los enlaces internos, en orden. */
export const TOOL_IDS = ['autonomo', 'iva', 'irpf', 'empleado', 'hora', `calendario-${CALENDAR_YEARS[0]}`, 'nif'];

const byPath = new Map();
for (const page of SEO_PAGES) {
  for (const [lang, path] of Object.entries(page.paths)) byPath.set(path, { page, lang });
}

const clean = (pathname) => (pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname);

/** { page, lang } de una ruta pública, o null. */
export function seoMatch(pathname) {
  return byPath.get(clean(pathname)) || null;
}

export function pageById(id) {
  return SEO_PAGES.find(p => p.id === id) || null;
}

/** Ruta de una página en un idioma (cae al castellano si no hay versión). */
export function pathFor(id, lang) {
  const page = pageById(id);
  if (!page) return '/home';
  return page.paths[lang] || page.paths.es;
}

/** Idioma de contenido de los enlaces públicos: en solo si el visitante lee inglés. */
export const seoLang = (lang) => (lang === 'en' ? 'en' : 'es');

/**
 * Idioma que se muestra en `pathname` para un visitante con idioma `userLang`.
 * Fuera de las páginas públicas registradas, el del visitante.
 */
export function effectiveLang(pathname, userLang) {
  const m = seoMatch(pathname);
  if (!m) return userLang;
  if (m.page.strict || SEO_LANGS.includes(userLang)) return m.lang;
  return userLang;
}
