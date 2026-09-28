import { localeOf } from './dates';

/**
 * Formateador con separador de miles SIEMPRE. En es-ES y pl-PL, Intl no agrupa
 * los números de 4 cifras (minimumGroupingDigits = 2) y sale "3950,00 €" junto
 * a "18.730,80 €". Con `useGrouping: 'always'` se agrupan todos; en navegadores
 * que no lo soportan, se inserta el separador a mano sobre formatToParts.
 */
const cache = new Map();
function formatter(locale, opts) {
  const key = locale + JSON.stringify(opts);
  if (!cache.has(key)) {
    const f = new Intl.NumberFormat(locale, { ...opts, useGrouping: 'always' });
    const group = new Intl.NumberFormat(locale).formatToParts(10000000).find(p => p.type === 'group')?.value || '.';
    const native = f.formatToParts(1000).some(p => p.type === 'group');
    cache.set(key, (v) => {
      if (native) return f.format(v);
      return f.formatToParts(v).map(p => (p.type === 'integer' && p.value.length > 3 ? p.value.replace(/\B(?=(\d{3})+(?!\d))/g, group) : p.value)).join('');
    });
  }
  return cache.get(key);
}

/** Número con separador de miles siempre, en el locale del idioma de la app. */
export function formatNumber(n, lang, opts = {}) {
  return formatter(localeOf(lang), opts)(Number(n) || 0);
}

/** 1234.5 → "1.234,50 €" (según el idioma de la app). */
export function eur(n, lang, { decimals = 2 } = {}) {
  return formatNumber(n, lang, { style: 'currency', currency: 'EUR', minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

export function num(n, lang, max = 2) {
  return formatNumber(n, lang, { maximumFractionDigits: max });
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
