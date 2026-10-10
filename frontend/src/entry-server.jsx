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
    // Se juntan los bytes y se decodifican una sola vez: decodificar cada trozo
    // por separado rompe las letras con tilde que caen entre dos trozos.
    const chunks = [];
    const sink = new Writable({
      write(chunk, _enc, cb) { chunks.push(Buffer.from(chunk)); cb(); },
      // React 18.3 mete a veces un byte nulo (\u0000) delante de una letra con
      // tilde al partir sus búferes (visto en /guias, /guias/iva-a-compensar y
      // la calculadora de cuota): sobra, el texto llega entero, así que se quita.
      final(cb) { resolve({ html: Buffer.concat(chunks).toString('utf8').replace(/\u0000/g, ''), head }); cb(); }
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
