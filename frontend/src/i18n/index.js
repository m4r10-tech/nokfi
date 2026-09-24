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
  // #21 (sesión 2): si la key apunta a un SUB-OBJETO (p.ej. t('pricing.features')
  // en vez de t('pricing.features.mini')), devolverlo crudo rompía el render
  // ("Objects are not valid as a React child"). Los arrays SÍ son legítimos
  // (pricing.features.*, privacy.sections) — solo los objetos planos caen a key.
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) return key;
  return value;
}
