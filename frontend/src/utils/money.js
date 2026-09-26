import { localeOf } from './dates';

/** 1234.5 → "1.234,50 €" (según el idioma de la app). */
export function eur(n, lang, { decimals = 2 } = {}) {
  const v = Number(n) || 0;
  return v.toLocaleString(localeOf(lang), { style: 'currency', currency: 'EUR', minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

export function num(n, lang, max = 2) {
  return (Number(n) || 0).toLocaleString(localeOf(lang), { maximumFractionDigits: max });
}

/** Fecha ISO (YYYY-MM-DD) → "14 oct 2026" en el idioma de la app. */
export function isoDate(s, lang, opts = { day: 'numeric', month: 'short', year: 'numeric' }) {
  if (!s) return '—';
  const d = new Date(`${String(s).slice(0, 10)}T00:00:00`);
  return isNaN(d) ? s : d.toLocaleDateString(localeOf(lang), opts);
}

export const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export function currentQuarter(d = new Date()) {
  return { year: d.getFullYear(), quarter: Math.floor(d.getMonth() / 3) + 1 };
}

export function quarterRange(year, q) {
  const from = `${year}-${String((q - 1) * 3 + 1).padStart(2, '0')}-01`;
  const last = new Date(year, q * 3, 0).getDate();
  return { from, to: `${year}-${String(q * 3).padStart(2, '0')}-${last}` };
}
