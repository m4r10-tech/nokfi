/**
 * Fechas de la BD → UI. SQLite guarda created_at como 'YYYY-MM-DD HH:MM:SS'
 * en UTC (sin zona): se parsea como UTC y se muestra en la hora local del
 * usuario, con el locale del idioma de la app.
 */
export function parseDbDate(s) {
  if (!s) return null;
  const d = new Date(s.includes('T') ? s : s.replace(' ', 'T') + 'Z');
  return isNaN(d.getTime()) ? null : d;
}

// Sesión 4: mapa idioma → locale (fechas, números, €) para los 6 idiomas.
const LOCALES = { es: 'es-ES', en: 'en-GB', fr: 'fr-FR', it: 'it-IT', de: 'de-DE', pl: 'pl-PL' };
export const localeOf = (lang) => LOCALES[lang] || 'es-ES';

export function formatDate(s, lang, opts = { year: 'numeric', month: 'short', day: 'numeric' }) {
  const d = parseDbDate(s);
  return d ? d.toLocaleDateString(localeOf(lang), opts) : '—';
}

export function formatDateTime(s, lang) {
  const d = parseDbDate(s);
  return d
    ? d.toLocaleString(localeOf(lang), { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    : '—';
}

export function formatTime(d, lang) {
  return d.toLocaleTimeString(localeOf(lang), { hour: '2-digit', minute: '2-digit' });
}

/** "hace 5 min", "hace 3 h", "ayer", "hace 4 días"… (Intl.RelativeTimeFormat) */
export function relativeTime(s, lang) {
  const d = parseDbDate(s);
  if (!d) return '—';
  const rtf = new Intl.RelativeTimeFormat(localeOf(lang), { numeric: 'auto' });
  const diffSec = Math.round((d.getTime() - Date.now()) / 1000);
  const abs = Math.abs(diffSec);
  if (abs < 60) return rtf.format(0, 'second');
  if (abs < 3600) return rtf.format(Math.round(diffSec / 60), 'minute');
  if (abs < 86400) return rtf.format(Math.round(diffSec / 3600), 'hour');
  const days = dayDiff(d, new Date());
  if (days < 30) return rtf.format(-days, 'day');
  return formatDate(s, lang);
}

/** Días naturales (locales) entre dos fechas: 0 = mismo día, 1 = ayer… */
export function dayDiff(a, b) {
  const da = new Date(a.getFullYear(), a.getMonth(), a.getDate());
  const db = new Date(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((db - da) / 86400000);
}

/** Día UTC (YYYY-MM-DD) — el corte de la cuota IA diaria del backend (ai_usage). */
export const utcDay = (d = new Date()) => d.toISOString().slice(0, 10);
