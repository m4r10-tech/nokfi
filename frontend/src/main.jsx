import { StrictMode } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { installGlobalErrorHandlers } from './middleware/errorReporter';
import './index.css';

// C8 (sesión 4): errores no capturados → /api/client-errors (sin datos del usuario).
installGlobalErrorHandlers();

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
if (container.dataset.prerendered === path && container.hasChildNodes()) {
  hydrateRoot(container, app, { onRecoverableError: () => {} });
} else {
  container.textContent = '';
  createRoot(container).render(app);
}
