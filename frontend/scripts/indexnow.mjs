/**
 * IndexNow: avisa a Bing (y a los buscadores que comparten el protocolo: Yandex,
 * Seznam, Naver…) de las páginas públicas nuevas o cambiadas. ChatGPT y Copilot
 * buscan con Bing, así que es la vía rápida para que vean los cambios. Gratis.
 *
 * Uso, DESPUÉS de desplegar (la clave tiene que estar ya publicada):
 *   npm run indexnow                      → todas las páginas del sitemap
 *   npm run indexnow -- /guias/x /en/y    → solo esas rutas
 *
 * La clave no es un secreto: el protocolo exige publicarla en
 * https://nokfi.app/<clave>.txt (public/<clave>.txt) para demostrar que el
 * sitio es nuestro. `npm run check:seo` comprueba que el archivo existe.
 */
import { pathToFileURL } from 'node:url';
import { SEO_PAGES, SITE } from '../src/seo/routes.js';

export const INDEXNOW_KEY = '19103c58f6bb1dc657f6eb8d24f323c8';

async function main() {
  const args = process.argv.slice(2);
  const routes = args.length ? args : SEO_PAGES.flatMap(p => Object.values(p.paths));
  const host = new URL(SITE).host;
  const keyUrl = `${SITE}/${INDEXNOW_KEY}.txt`;
  const published = await fetch(keyUrl).then(r => r.text()).catch(() => '');
  if (published.trim() !== INDEXNOW_KEY) throw new Error(`${keyUrl} no devuelve la clave: despliega antes el dist`);
  const r = await fetch('https://api.indexnow.org/indexnow', {
    method: 'POST',
    headers: { 'content-type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ host, key: INDEXNOW_KEY, keyLocation: keyUrl, urlList: routes.map(p => SITE + p) })
  });
  if (r.status !== 200 && r.status !== 202) throw new Error(`IndexNow respondió ${r.status}: ${await r.text()}`);
  console.log(`✅ IndexNow: ${routes.length} URL enviadas (HTTP ${r.status})`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) main().catch(e => { console.error(`❌ ${e.message}`); process.exit(1); });
