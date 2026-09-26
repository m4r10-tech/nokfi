import { createContext, useContext, useState, useMemo, useEffect, useCallback } from 'react';
import { translate, loadLanguage, isSupported } from '../i18n';

const LangContext = createContext(null);
const STORAGE_KEY = 'nokfi_lang';
const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

/**
 * Idioma de la app (sesión 4, §5.1).
 *
 * Prioridad:
 *   1) elegido a mano (localStorage nokfi_lang) — siempre gana;
 *   2) idioma del NAVEGADOR si es uno de los 6 (un hispanohablante en Londres
 *      suele tener el navegador en español: mejor que la IP);
 *   3) país de la conexión (cabecera CF-IPCountry de Cloudflare vía /api/geo;
 *      no se guarda) — desempata cuando el navegador está en otro idioma;
 *   4) inglés si el navegador habla un idioma no soportado; castellano si no
 *      hay ninguna pista.
 */
const COUNTRY_LANG = {
  ES: 'es', MX: 'es', AR: 'es', CO: 'es', CL: 'es', PE: 'es', VE: 'es', EC: 'es', GT: 'es', CU: 'es', BO: 'es', DO: 'es',
  HN: 'es', PY: 'es', SV: 'es', NI: 'es', CR: 'es', PA: 'es', UY: 'es', PR: 'es', AD: 'es', GQ: 'es',
  GB: 'en', US: 'en', IE: 'en', AU: 'en', NZ: 'en', CA: 'en', ZA: 'en', MT: 'en', IN: 'en', SG: 'en',
  FR: 'fr', BE: 'fr', LU: 'fr', MC: 'fr', SN: 'fr', CI: 'fr', MA: 'fr', TN: 'fr', DZ: 'fr',
  CH: 'de', DE: 'de', AT: 'de', LI: 'de',
  IT: 'it', SM: 'it', VA: 'it',
  PL: 'pl'
};

function browserLang() {
  const list = typeof navigator !== 'undefined' ? (navigator.languages || [navigator.language]) : [];
  for (const l of list) {
    const code = String(l || '').slice(0, 2).toLowerCase();
    if (isSupported(code)) return { code, any: true };
  }
  return { code: null, any: list.filter(Boolean).length > 0 };
}

function storedLang() {
  try { const v = localStorage.getItem(STORAGE_KEY); return isSupported(v) ? v : null; } catch { return null; }
}

export function LangProvider({ children }) {
  const initial = storedLang() || browserLang().code || 'es';
  const [lang, setLangState] = useState(initial);
  const [, setLoaded] = useState(0); // fuerza re-render cuando llega un diccionario

  const apply = useCallback(async (code) => {
    await loadLanguage(code).catch(() => {});
    setLoaded(x => x + 1);
    setLangState(code);
  }, []);

  // Carga el diccionario inicial si no va en el bundle, y detecta por país
  // solo cuando no hay elección manual ni idioma de navegador soportado.
  useEffect(() => {
    if (initial !== 'es') apply(initial);
    if (storedLang() || browserLang().code) return;
    const ctrl = new AbortController();
    fetch(`${API_BASE}/geo`, { signal: ctrl.signal })
      .then(r => (r.ok ? r.json() : null))
      .then(d => {
        const byIp = COUNTRY_LANG[String(d?.country || '').toUpperCase()];
        const fallback = browserLang().any ? 'en' : 'es';
        const next = byIp || fallback;
        if (next !== 'es') apply(next);
      })
      .catch(() => {});
    return () => ctrl.abort();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // <html lang> dinámico (lectores de pantalla, traducción del navegador, SEO).
  useEffect(() => { document.documentElement.lang = lang; }, [lang]);

  const setLang = (newLang) => {
    if (!isSupported(newLang)) return;
    try { localStorage.setItem(STORAGE_KEY, newLang); } catch { /* storage bloqueado */ }
    apply(newLang);
  };

  const t = useMemo(() => (key, vars) => translate(lang, key, vars), [lang]);

  return <LangContext.Provider value={{ lang, setLang, t }}>{children}</LangContext.Provider>;
}

export function useLang() {
  const ctx = useContext(LangContext);
  if (!ctx) throw new Error('useLang debe usarse dentro de LangProvider');
  return ctx;
}
