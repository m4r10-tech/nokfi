import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { installGlobalErrorHandlers } from './middleware/errorReporter';
import './index.css';

// C8 (sesión 4): errores no capturados → /api/client-errors (sin datos del usuario).
installGlobalErrorHandlers();

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>
);
