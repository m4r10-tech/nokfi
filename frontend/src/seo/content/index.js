/**
 * S15b T4 (lote 13): el contenido de las páginas públicas (herramientas y guías) se
 * carga por idioma. Antes iban es y en juntos en el chunk de SeoLayout (~80 KB) y la
 * calculadora de IVA en castellano descargaba también todo el inglés.
 *
 * - `loadSeoContent(l)` lo pide (main.jsx lo espera antes de hidratar una página pública,
 *   y entry-server.jsx antes del prerender, así el HTML y la hidratación coinciden).
 * - `seoContent(l)` lo devuelve si ya está; si no, lanza la promesa de carga (Suspense
 *   muestra el «cargando» de la ruta, p. ej. al cambiar de es a en en la misma visita).
 */
const loaders = {
  es: () => import('./es'),
  en: () => import('./en')
};
const cache = {};
const pending = {};

export function loadSeoContent(l) {
  const key = loaders[l] ? l : 'es';
  if (cache[key]) return Promise.resolve(cache[key]);
  if (!pending[key]) {
    pending[key] = loaders[key]().then((m) => { cache[key] = m.default; return cache[key]; })
      .finally(() => { delete pending[key]; });
  }
  return pending[key];
}

export function seoContent(l) {
  const key = loaders[l] ? l : 'es';
  if (cache[key]) return cache[key];
  throw loadSeoContent(key);
}
