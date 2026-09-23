import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { authApi, setSessionToken, setSessionExpiredHandler } from '../middleware/api';

const AuthContext = createContext(null);

// El token vive en memoria (middleware/api.js) + respaldo en sessionStorage
// (se borra al cerrar la pestaña) para no forzar re-login en cada refresco.
const SESSION_STORAGE_KEY = 'nokfi_session_token';

export function AuthProvider({ children }) {
  const [license, setLicense] = useState(null);
  const [status, setStatus] = useState('checking'); // checking | authenticated | unauthenticated
  const [authError, setAuthError] = useState(null);

  const handleLogout = useCallback(() => {
    setSessionToken(null);
    sessionStorage.removeItem(SESSION_STORAGE_KEY);
    setLicense(null);
    setStatus('unauthenticated');
  }, []);

  useEffect(() => {
    setSessionExpiredHandler((errorCode) => {
      setAuthError(errorCode);
      handleLogout();
    });
  }, [handleLogout]);

  useEffect(() => {
    const stored = sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (!stored) { setStatus('unauthenticated'); return; }
    setSessionToken(stored);

    // #2 (sesión 2): solo un rechazo DEFINITIVO del servidor (401/403) cierra
    // la sesión. Un error de red (status 0) o un 5xx (backend caído, 502 de
    // Cloudflare) NO deben tumbarla: antes cualquier corte de 1s de wifi
    // borraba la sesión local del usuario. Ante fallo transitorio se reintenta
    // una vez a los 2.5s y se vuelve a intentar cuando el navegador recupera
    // conectividad (evento 'online'); el token se conserva mientras tanto
    // (ProtectedRoute muestra el spinner de 'checking').
    let cancelled = false;
    let retried = false;

    const attempt = () => {
      authApi.verify().then(({ ok, status: st, data }) => {
        if (cancelled) return;
        if (ok && data.valid) {
          setLicense(data.license);
          setStatus('authenticated');
          return;
        }
        if (st === 401 || st === 403) { handleLogout(); return; }
        if (!retried) {
          retried = true;
          setTimeout(() => { if (!cancelled) attempt(); }, 2500);
        }
      });
    };

    const onOnline = () => { retried = false; attempt(); };
    window.addEventListener('online', onOnline);
    attempt();

    return () => {
      cancelled = true;
      window.removeEventListener('online', onOnline);
    };
  }, [handleLogout]);

  const applySession = (token, licenseData) => {
    setSessionToken(token);
    sessionStorage.setItem(SESSION_STORAGE_KEY, token);
    setLicense(licenseData);
    setStatus('authenticated');
    setAuthError(null);
  };

  const logout = async () => {
    await authApi.logout();
    handleLogout();
  };

  return (
    <AuthContext.Provider value={{ license, status, authError, applySession, logout, setAuthError }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de AuthProvider');
  return ctx;
}
