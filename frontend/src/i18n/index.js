import es from './es';
import en from './en';
import { LANG_CODES } from './languages';

/**
 * i18n de Nokfi (sesión 4, Fase A: es, en, fr, it, de, pl).
 *
 * - es y en van en el bundle; fr/it/de/pl se cargan bajo demanda (C7).
 * - Plurales con Intl.PluralRules: t('finance.days', { n: 3 }) busca
 *   `days_one` / `days_few` / `days_many` / `days_other` y, si no existen,
 *   usa `days` (polaco tiene 3 formas: 1 / 2-4 / 5+).
 * - Interpolación {var} cuando se pasan variables. Las llamadas antiguas con
 *   .replace('{n}', …) siguen funcionando (sin variables no se interpola).
 * - Si falta una clave en un idioma, cae a inglés y después a castellano.
 */
export const dictionaries = { es, en };

const loaders = {
  fr: () => import('./fr'),
  it: () => import('./it')
};

export const isSupported = (code) => LANG_CODES.includes(code);

/** Carga el diccionario de un idioma (no-op si ya está). */
export async function loadLanguage(code) {
  if (dictionaries[code] || !loaders[code]) return;
  const mod = await loaders[code]();
  dictionaries[code] = mod.default;
}

function lookup(dict, key) {
  let value = dict;
  for (const part of key.split('.')) {
    value = value?.[part];
    if (value === undefined) return undefined;
  }
  return value;
}

const pluralRules = {};
function pluralCategory(lang, n) {
  if (!pluralRules[lang]) pluralRules[lang] = new Intl.PluralRules(lang);
  return pluralRules[lang].select(n);
}

function resolve(dict, key, lang, vars) {
  if (!dict) return undefined;
  if (vars && typeof vars.n === 'number') {
    const v = lookup(dict, `${key}_${pluralCategory(lang, vars.n)}`);
    if (v !== undefined) return v;
  }
  return lookup(dict, key);
}

/** Accede a una clave anidada tipo "nav.home" en el idioma dado. */
export function translate(lang, key, vars) {
  let value = resolve(dictionaries[lang], key, lang, vars);
  if (value === undefined) value = resolve(dictionaries.en, key, 'en', vars);
  if (value === undefined) value = resolve(dictionaries.es, key, 'es', vars);
  if (value === undefined) return key;
  // #21 (sesión 2): si la key apunta a un SUB-OBJETO, devolverlo crudo rompía
  // el render. Los arrays SÍ son legítimos (pricing.features.*, privacy.sections).
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) return key;
  if (vars && typeof value === 'string') {
    return value.replace(/\{(\w+)\}/g, (m, k) => (vars[k] !== undefined ? String(vars[k]) : m));
  }
  return value;
}
