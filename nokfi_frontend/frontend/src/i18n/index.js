import es from './es';
import en from './en';

export const dictionaries = { es, en };

/** Accede a una clave anidada tipo "nav.home" dentro del diccionario del idioma dado */
export function translate(lang, key) {
  const dict = dictionaries[lang] || dictionaries.es;
  const parts = key.split('.');
  let value = dict;
  for (const part of parts) {
    value = value?.[part];
    if (value === undefined) return key;
  }
  return value;
}
