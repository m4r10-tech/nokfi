import { createContext, useContext, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { SITE, seoMatch } from './routes.js';

/**
 * useSeo (sesión 12) — metaetiquetas de una página pública indexable:
 * title, description, canonical, hreflang (es, en y x-default), Open Graph,
 * Twitter y datos estructurados JSON-LD.
 *
 * - En el navegador las pone en <head> (useEffect).
 * - En el prerender (scripts/prerender.mjs, render en Node) no hay efectos:
 *   las recoge SeoCollector y el script las escribe en el HTML. Las dos vías
 *   usan seoHead(), así lo que ve Google es lo mismo que pinta el navegador.
 *
 * La ruta tiene que estar en seo/routes.js (si no, no hay canonical ni
 * hreflang). Las etiquetas añadidas llevan data-seo.
 */
const OG_LOCALE = { es: 'es_ES', en: 'en_GB' };

/** Contexto que solo existe en el prerender: recibe las etiquetas de la página. */
export const SeoCollector = createContext(null);

/** Etiquetas de una página → { title, tags: [{ tag, attrs, text? }] }. */
export function seoHead(pathname, { title, description, jsonLd, noindex = false }) {
  const tags = [];
  const meta = (attr, key, content) => tags.push({ tag: 'meta', attrs: { [attr]: key, content } });
  if (description) meta('name', 'description', description);
  const m = seoMatch(pathname);
  if (m) {
    const url = SITE + m.page.paths[m.lang];
    tags.push({ tag: 'link', attrs: { rel: 'canonical', href: url } });
    const langs = Object.keys(m.page.paths);
    if (langs.length > 1) {
      for (const l of langs) tags.push({ tag: 'link', attrs: { rel: 'alternate', hreflang: l, href: SITE + m.page.paths[l] } });
      tags.push({ tag: 'link', attrs: { rel: 'alternate', hreflang: 'x-default', href: SITE + m.page.paths.es } });
    }
    meta('property', 'og:url', url);
    meta('property', 'og:locale', OG_LOCALE[m.lang]);
  }
  if (title) { meta('property', 'og:title', title); meta('name', 'twitter:title', title); }
  if (description) { meta('property', 'og:description', description); meta('name', 'twitter:description', description); }
  if (noindex) meta('name', 'robots', 'noindex, nofollow');
  if (jsonLd) tags.push({ tag: 'script', attrs: { type: 'application/ld+json' }, text: JSON.stringify(jsonLd) });
  return { title, tags };
}

/** Selector de la etiqueta equivalente que ya puede estar en <head> (index.html). */
export function seoSelector({ tag, attrs }) {
  if (tag === 'meta') return attrs.name ? `meta[name="${attrs.name}"]` : `meta[property="${attrs.property}"]`;
  if (tag === 'link' && attrs.rel === 'canonical') return 'link[rel="canonical"]';
  return null;
}

export function useSeo({ title, description, jsonLd, noindex = false }) {
  const { pathname } = useLocation();
  const collect = useContext(SeoCollector);
  if (collect) collect(seoHead(pathname, { title, description, jsonLd, noindex }));

  const ld = jsonLd ? JSON.stringify(jsonLd) : '';
  useEffect(() => {
    const head = seoHead(pathname, { title, description, jsonLd: ld ? JSON.parse(ld) : null, noindex });
    if (head.title) document.title = head.title;
    // Las del HTML prerenderizado (o de la página anterior) se sustituyen.
    document.head.querySelectorAll('link[rel="alternate"][data-seo], script[data-seo], meta[name="robots"][data-seo]').forEach(el => el.remove());
    const added = [];
    for (const t of head.tags) {
      const sel = seoSelector(t);
      let el = sel && t.attrs.name !== 'robots' ? document.head.querySelector(sel) : null;
      if (!el) {
        el = document.createElement(t.tag);
        el.setAttribute('data-seo', '');
        document.head.appendChild(el);
        if (!sel || t.attrs.name === 'robots') added.push(el);
      }
      for (const [k, v] of Object.entries(t.attrs)) el.setAttribute(k, v);
      if (t.text) el.textContent = t.text;
    }
    return () => added.forEach(el => el.remove());
  }, [pathname, title, description, ld, noindex]);
}

/** Organization: va en todas las páginas públicas con datos estructurados. */
export const ORGANIZATION_LD = {
  '@type': 'Organization',
  '@id': `${SITE}/#organization`,
  name: 'Nokfi',
  url: SITE,
  logo: `${SITE}/icons/icon-512.png`,
  email: 'info@nokfi.app'
};

/** Bloque JSON-LD con @context y @graph. */
export function ldGraph(...nodes) {
  return { '@context': 'https://schema.org', '@graph': [ORGANIZATION_LD, ...nodes.filter(Boolean)] };
}

export function faqLd(items) {
  if (!items?.length) return null;
  return {
    '@type': 'FAQPage',
    mainEntity: items.map(({ q, a }) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } }))
  };
}

export function breadcrumbLd(trail) {
  return {
    '@type': 'BreadcrumbList',
    itemListElement: trail.map(([name, path], i) => ({ '@type': 'ListItem', position: i + 1, name, item: SITE + path }))
  };
}

/**
 * SoftwareApplication con los planes de GET /api/payments/plans (usePlans):
 * mismo origen que lo que cobra Stripe, nunca precios escritos a mano.
 */
export function softwareLd(plans, description) {
  return {
    '@type': 'SoftwareApplication',
    name: 'Nokfi',
    url: SITE,
    description,
    applicationCategory: 'FinanceApplication',
    operatingSystem: 'Web',
    publisher: { '@id': `${SITE}/#organization` },
    ...(plans?.length ? {
      offers: plans.map(p => ({
        '@type': 'Offer', name: `Nokfi ${p.name}`, price: String(p.price), priceCurrency: 'EUR', url: `${SITE}/pricing?plan=${p.id}`,
        priceSpecification: { '@type': 'UnitPriceSpecification', price: String(p.price), priceCurrency: 'EUR', billingDuration: 'P1M', unitText: 'MONTH' }
      }))
    } : {})
  };
}
