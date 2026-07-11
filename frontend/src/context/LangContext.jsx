import { createContext, useContext, useState, useMemo } from 'react';
import { translate } from '../i18n';

const LangContext = createContext(null);
const STORAGE_KEY = 'nokfi_lang';

export function LangProvider({ children }) {
  const [lang, setLangState] = useState(() => localStorage.getItem(STORAGE_KEY) || 'es');

  const setLang = (newLang) => {
    setLangState(newLang);
    localStorage.setItem(STORAGE_KEY, newLang);
  };

  const t = useMemo(() => (key) => translate(lang, key), [lang]);

  return <LangContext.Provider value={{ lang, setLang, t }}>{children}</LangContext.Provider>;
}

export function useLang() {
  const ctx = useContext(LangContext);
  if (!ctx) throw new Error('useLang debe usarse dentro de LangProvider');
  return ctx;
}
