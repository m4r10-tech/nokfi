/**
 * Idiomas de la app (sesión 4, Fase A): lista ÚNICA. Añadir un idioma =
 * añadir aquí su entrada + su diccionario i18n/<code>.js (npm run check:i18n).
 * Aparcados (Fases B/C/D): ruso, chino y árabe (RTL).
 */
export const LANGUAGES = [
  { code: 'es', name: 'Español' },
  { code: 'en', name: 'English' },
  { code: 'fr', name: 'Français' },
  { code: 'it', name: 'Italiano' },
  { code: 'de', name: 'Deutsch' },
  { code: 'pl', name: 'Polski' }
];

export const LANG_CODES = LANGUAGES.map(l => l.code);
