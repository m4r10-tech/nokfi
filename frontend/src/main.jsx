import { StrictMode } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { installGlobalErrorHandlers } from './middleware/errorReporter';
import { trackSocialReferral } from './utils/track';
import { initialLang } from './context/LangContext';
import { loadLanguage } from './i18n';
import { seoMatch, seoLang } from './seo/routes';
import { loadSeoContent } from './seo/content';
import './index.css';

// C8 (sesión 4): errores no capturados → /api/client-errors (sin datos del usuario).
installGlobalErrorHandlers();
// Sesión 13: entradas desde X, Instagram y TikTok (sin cookies, solo recuentos).
trackSocialReferral();

const container = document.getElementById('root');
const app = (
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>
);

// Sesión 12 (SEO): las páginas públicas llegan prerenderizadas
// (scripts/prerender.mjs marca #root con su ruta). Se hidrata ese HTML en vez
// de repintarlo: sin parpadeo mientras carga la parte de la página. Si algo no
// coincide (idioma, tema, planes, cifras animadas), React vuelve a pintar esa
// parte sin más: no es un error que haya que reportar.
const path = window.location.pathname.replace(/\/+$/, '') || '/';
function start() {
  if (container.dataset.prerendered === path && container.hasChildNodes()) {
    hydrateRoot(container, app, { onRecoverableError: () => {} });
  } else {
    container.textContent = '';
    createRoot(container).render(app);
  }
}
// S15b T4 (lote 13): el diccionario (solo es va en el bundle) y, en una página pública de
// herramientas o guías, su contenido en ese idioma se cargan aparte. Se esperan antes de
// pintar o hidratar para que el primer pintado ya salga en su idioma y coincida con el HTML
// prerenderizado. En castellano no hay nada que esperar (es va en el bundle; el contenido
// público, en su chunk, se pide en paralelo con el de la página).
const lang = initialLang(path);
const seoPage = seoMatch(path)?.page;
const usesSeoContent = !!seoPage && !!(seoPage.tool || seoPage.toolId || seoPage.guide || seoPage.id === 'guides');
Promise.all([
  loadLanguage(lang),
  usesSeoContent ? loadSeoContent(seoLang(lang)) : null
]).catch(() => {}).finally(start);
