import { eur, num } from './money';

/**
 * S15b T4 (A11 de sub4): la cifra clave de los análisis antiguos llega en formatos
 * distintos («2301.58», «2.301,58», «9.043,96 €», «€2301.58», «2301,58 EUR»…). Aquí
 * se reescribe en el formato del idioma: con «€» si es dinero (lleva moneda, tiene
 * céntimos o la etiqueta es de importes) y como número normal si no. Lo que no es
 * una cifra suelta («42/100», «3 meses», «+12 %») se deja tal cual.
 */
const MONEY_LABEL = /(saldo|total|importe|ingres|gasto|venta|cobr|pag|factur|caja|iva|irpf|benefici|coste|costo|margen|deuda|vencid|media|entrada|salida|balance|revenue|income|expense|cost|profit|amount|cash|sales|recette|dépense|umsatz|einnahm|ausgab|ricav|spes|incass|przych|koszt|sprzeda|kwota)/i;

/** «2.301,58», «2,301.58», «2301.58», «1.200» (miles), «-35,5» → número; null si no lo es. */
function looseNumber(s) {
  const v = String(s).replace(/[\s  ]/g, '');
  if (!/^-?[\d.,]+$/.test(v) || !/\d/.test(v)) return null;
  const lastDot = v.lastIndexOf('.'), lastComma = v.lastIndexOf(',');
  let norm;
  if (lastDot >= 0 && lastComma >= 0) {
    // El último separador es el decimal; el otro, de miles.
    norm = lastComma > lastDot ? v.replace(/\./g, '').replace(',', '.') : v.replace(/,/g, '');
  } else if (lastComma >= 0) {
    norm = (v.match(/,/g).length > 1) ? v.replace(/,/g, '') : v.replace(',', '.');
  } else if (lastDot >= 0) {
    const dots = v.match(/\./g).length;
    norm = dots > 1 || /^-?\d{1,3}\.\d{3}$/.test(v) ? v.replace(/\./g, '') : v;
  } else norm = v;
  const n = Number(norm);
  return Number.isFinite(n) ? n : null;
}

export function keyFigureValue(value, label, lang) {
  const raw = String(value ?? '').trim();
  const m = raw.match(/^(€|EUR)?\s*(-?[\d.,\s  ]*\d)\s*(€|EUR|euros?)?$/i);
  if (!m) return raw;
  const n = looseNumber(m[2]);
  if (n == null) return raw;
  const money = !!(m[1] || m[3]) || /[.,]\d{2}$/.test(m[2].trim()) || MONEY_LABEL.test(String(label || ''));
  return money ? eur(n, lang) : num(n, lang);
}
