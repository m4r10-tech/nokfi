import { Writable } from 'node:stream';
import { renderToPipeableStream } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom/server';
import App from './App';
import { SeoCollector } from './seo/useSeo';
import { setPrerenderPlans } from './hooks/usePlans';

/**
 * Render en Node de una página pública (sesión 12, prerender del build).
 * Solo lo usa scripts/prerender.mjs: no hay servidor de SSR en producción.
 * Espera a que se resuelvan las partes cargadas con lazy() (onAllReady) para
 * que el HTML lleve el contenido completo y React pueda hidratarlo.
 * @returns {Promise<{ html: string, head: { title, tags } | null }>}
 */
export function render(url, { plans } = {}) {
  setPrerenderPlans(plans || null);
  let head = null;
  const collect = (h) => { head = h; };
  return new Promise((resolve, reject) => {
    let html = '';
    const sink = new Writable({
      write(chunk, _enc, cb) { html += chunk.toString(); cb(); },
      final(cb) { resolve({ html, head }); cb(); }
    });
    const stream = renderToPipeableStream(
      <SeoCollector.Provider value={collect}>
        <StaticRouter location={url}>
          <App />
        </StaticRouter>
      </SeoCollector.Provider>,
      {
        onAllReady() { stream.pipe(sink); },
        onShellError: reject,
        onError(err) { reject(err); }
      }
    );
  });
}
