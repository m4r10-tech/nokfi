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
    authApi.verify().then(({ ok, data }) => {
      if (ok && data.valid) {
        setLicense(data.license);
        setStatus('authenticated');
      } else {
        handleLogout();
      }
    });
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
