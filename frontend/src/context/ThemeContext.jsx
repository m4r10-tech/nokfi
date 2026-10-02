import { createContext, useContext, useEffect, useState } from 'react';

const ThemeContext = createContext(null);
const STORAGE_KEY = 'nokfi_theme';

export function ThemeProvider({ children }) {
  // try: en el prerender (Node) no hay localStorage → oscuro, el tema por defecto.
  const [theme, setTheme] = useState(() => { try { return localStorage.getItem(STORAGE_KEY) || 'dark'; } catch { return 'dark'; } });

  useEffect(() => {
    document.documentElement.classList.remove('theme-dark', 'theme-light');
    document.documentElement.classList.add(`theme-${theme}`);
    try { localStorage.setItem(STORAGE_KEY, theme); } catch { /* storage bloqueado */ }
  }, [theme]);

  const toggleTheme = () => setTheme(t => (t === 'dark' ? 'light' : 'dark'));

  return <ThemeContext.Provider value={{ theme, setTheme, toggleTheme }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme debe usarse dentro de ThemeProvider');
  return ctx;
}
