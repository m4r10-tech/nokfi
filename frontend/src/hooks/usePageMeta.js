import { useEffect } from 'react';

/**
 * usePageMeta — título <title> y meta description por página (SEO).
 *
 * La app es una SPA con un único index.html: sin este hook, TODAS las rutas
 * comparten el mismo <title> y la misma description ("Nokfi — Tu negocio…"),
 * lo que empobrece el SEO de las páginas públicas (/pricing, /privacidad) y
 * la UX de la pestaña del navegador (historial, marcadores).
 *
 * Se aplica solo en páginas PÚBLICAS (las indexables); las rutas /app/*
 * (privadas, tras login) no necesitan SEO y mantienen el título base.
 * Los crawlers modernos (Google) ejecutan JS y recogen estos cambios; el
 * title/description estáticos de index.html siguen siendo el fallback.
 */
export function usePageMeta(title, description) {
  useEffect(() => {
    if (title) document.title = title;
    if (description) {
      const el = document.querySelector('meta[name="description"]');
      if (el) el.setAttribute('content', description);
    }
  }, [title, description]);
}
