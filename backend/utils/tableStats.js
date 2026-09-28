/**
 * utils/tableStats.js — cifras EXACTAS de una tabla (Excel/CSV) para la IA.
 *
 * Los modelos abiertos gratuitos (Llama en Cloudflare/Groq) interpretan bien
 * pero suman y dividen mal, y además solo ven una muestra de filas. Aquí
 * Nokfi calcula sobre TODAS las filas recibidas: totales por columna
 * numérica, agrupaciones por la columna de categoría (producto, cliente…),
 * evolución mensual y margen si hay columnas de venta y coste. El prompt
 * obliga a usar estas cifras tal cual.
 */

'use strict';

const r2 = (n) => Math.round(n * 100) / 100;

/** "1.234,56 €", "1234.56", "12%" → número, o null si no es numérico. */
function toNumber(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  let s = String(v ?? '').trim().replace(/[€$£%\s]/g, '');
  if (!s || !/^[-+(]?[\d.,]+\)?$/.test(s)) return null;
  const neg = /^\(.*\)$/.test(s) || s.startsWith('-');
  s = s.replace(/[()+-]/g, '');
  const lastComma = s.lastIndexOf(','), lastDot = s.lastIndexOf('.');
  if (lastComma > -1 && lastDot > -1) {
    s = lastComma > lastDot ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  } else if (lastComma > -1) {
    // "1,5" decimal; "1,234" miles (3 cifras tras la coma y sin más comas no es concluyente → decimal si ≠ 3)
    s = /^\d{1,3}(,\d{3})+$/.test(s) ? s.replace(/,/g, '') : s.replace(',', '.');
  } else if ((s.match(/\./g) || []).length > 1 || /^\d{1,3}\.\d{3}$/.test(s)) {
    // "1.234.567" o "1.100": punto de miles (formato español), no decimal.
    s = s.replace(/\./g, '');
  }
  const n = Number(s);
  return Number.isFinite(n) ? (neg ? -n : n) : null;
}

// Columnas de fecha por nombre (para reconocer números de serie de Excel).
const DATE_COL = /fecha|date|data|datum|dia|día|jour|giorno|tag|dzie/i;
/** Número de serie de Excel (días desde 1899-12-30) → 'YYYY-MM-DD' (solo en rango 1982-2064). */
function serialToIso(v) {
  const n = typeof v === 'number' ? v : (/^\d{5}(\.\d+)?$/.test(String(v).trim()) ? Number(v) : NaN);
  if (!(n > 30000 && n < 60000)) return null;
  return new Date(Date.UTC(1899, 11, 30) + Math.floor(n) * 86400000).toISOString().slice(0, 10);
}

/**
 * Normaliza las filas antes de calcular y de enviar la muestra a la IA: las
 * fechas que llegan como número de serie (clientes antiguos o Excel sin
 * formato) pasan a ISO, para que la IA nunca cite "46223" como fecha.
 */
function normalizeRows(rows) {
  if (!rows.length) return rows;
  const cols = [...new Set(rows.slice(0, 50).flatMap(r => Object.keys(r)))].filter(c => DATE_COL.test(c));
  if (!cols.length) return rows;
  const serialCols = cols.filter(c => {
    const vals = rows.slice(0, 50).map(r => r[c]).filter(v => v !== '' && v != null);
    return vals.length && vals.filter(v => serialToIso(v)).length >= vals.length * 0.8;
  });
  if (!serialCols.length) return rows;
  return rows.map(r => {
    const o = { ...r };
    for (const c of serialCols) { const d = serialToIso(o[c]); if (d) o[c] = d; }
    return o;
  });
}

/** Fecha → 'YYYY-MM' o null. */
function toMonth(v) {
  if (v instanceof Date && !isNaN(v)) return v.toISOString().slice(0, 7);
  const s = String(v ?? '').trim();
  let m = s.match(/^(\d{4})[-/](\d{1,2})[-/]\d{1,2}/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}`;
  m = s.match(/^\d{1,2}[-/.](\d{1,2})[-/.](\d{4})/);
  if (m) return `${m[2]}-${m[1].padStart(2, '0')}`;
  return null;
}

const MONEY = /importe|total|venta|ingreso|factura|amount|revenue|sales|cobro|precio total|subtotal|neto|bruto/i;
const COST = /coste|costo|cost|compra|gasto/i;
const UNITS = /unidad|cantidad|uds|qty|quantity|units/i;
// Saldos acumulados: sumarlos no tiene sentido → último valor, mínimo y máximo.
const BALANCE = /saldo|balance|acumulado|solde|saldo finale|kontostand|stan konta/i;
// Precios unitarios, tarifas, porcentajes: sumarlos no tiene sentido → solo media/mín/máx.
const AVG_ONLY = /precio|price|tarifa|pvp|unitario|unit price|%|porcentaje|tipo|rate|stock m[ií]nimo|m[ií]nimo/i;

function tableStats(rows, { maxGroups = 25 } = {}) {
  const list = Array.isArray(rows) ? rows.filter(r => r && typeof r === 'object') : [];
  if (!list.length) return null;
  const columns = [...new Set(list.slice(0, 50).flatMap(r => Object.keys(r)))].slice(0, 40);

  const numeric = [], categorical = [];
  let dateCol = null;
  for (const c of columns) {
    const vals = list.map(r => r[c]).filter(v => v !== '' && v != null);
    if (!vals.length) continue;
    const nums = vals.map(toNumber).filter(n => n !== null);
    if (!dateCol && vals.filter(v => toMonth(v)).length >= vals.length * 0.8) { dateCol = c; continue; }
    if (nums.length >= vals.length * 0.8) { numeric.push(c); continue; }
    const distinct = new Set(vals.map(v => String(v).trim()));
    if (distinct.size >= 2 && distinct.size <= Math.max(60, list.length * 0.5)) categorical.push({ c, n: distinct.size });
  }

  const sum = (rs, c) => r2(rs.reduce((s, r) => s + (toNumber(r[c]) ?? 0), 0));
  const totals = {};
  for (const c of numeric) {
    const nums = list.map(r => toNumber(r[c])).filter(n => n !== null);
    const total = r2(nums.reduce((a, b) => a + b, 0));
    if (BALANCE.test(c)) {
      totals[c] = { saldo_final: r2(nums[nums.length - 1]), saldo_inicial: r2(nums[0]), min: r2(Math.min(...nums)), max: r2(Math.max(...nums)) };
      continue;
    }
    totals[c] = { ...(AVG_ONLY.test(c) && !MONEY.test(c) ? {} : { suma: total }), media: r2(nums.reduce((a, b) => a + b, 0) / nums.length), min: r2(Math.min(...nums)), max: r2(Math.max(...nums)) };
  }
  const balance = numeric.find(c => BALANCE.test(c)) || null;

  const summable = numeric.filter(c => totals[c].suma !== undefined);
  const money = summable.find(c => MONEY.test(c) && !COST.test(c)) || null;
  const cost = summable.find(c => COST.test(c)) || null;
  const units = summable.find(c => UNITS.test(c)) || null;
  const margin = (m, k) => (m && k && m !== 0 ? r2(((m - k) / m) * 100) : undefined);

  const out = { filas: list.length, columnas_numericas: numeric, totales: totals };
  if (balance) out.columna_saldo = balance;
  if (money) out.columna_importe = money;
  if (money && cost) {
    out.margen_total = { ventas: totals[money].suma, costes: totals[cost].suma, beneficio: r2(totals[money].suma - totals[cost].suma), margen_pct: margin(totals[money].suma, totals[cost].suma) };
  }

  // Agrupar por las columnas de categoría con menos valores distintos (producto, cliente, familia…)
  const key = money || units || summable[0];
  out.por_categoria = {};
  for (const { c } of categorical.sort((a, b) => a.n - b.n).slice(0, 2)) {
    const groups = new Map();
    for (const r of list) {
      const g = String(r[c] ?? '').trim() || '(vacío)';
      if (!groups.has(g)) groups.set(g, []);
      groups.get(g).push(r);
    }
    const arr = [...groups.entries()].map(([g, rs]) => {
      const o = { [c]: g, filas: rs.length };
      for (const n of numeric) {
        if (n === balance || BALANCE.test(n)) continue;
        if (totals[n].suma !== undefined) o[n] = sum(rs, n);
        else { const v = rs.map(r => toNumber(r[n])).filter(x => x !== null); o[`${n} (media)`] = v.length ? r2(v.reduce((a, b) => a + b, 0) / v.length) : null; }
      }
      if (money && cost) o.margen_pct = margin(o[money], o[cost]);
      if (money && out.totales[money].suma) o.peso_pct = r2((o[money] / out.totales[money].suma) * 100);
      return o;
    });
    if (key) arr.sort((a, b) => b[key] - a[key]);
    out.por_categoria[c] = { grupos: groups.size, ordenado_por: key || null, detalle: arr.slice(0, maxGroups) };
  }

  if (dateCol) {
    const months = new Map();
    for (const r of list) {
      const m = toMonth(r[dateCol]);
      if (!m) continue;
      if (!months.has(m)) months.set(m, []);
      months.get(m).push(r);
    }
    const ms = [...months.keys()].sort();
    out.fechas = { columna: dateCol, desde: ms[0], hasta: ms[ms.length - 1] };
    out.por_mes = ms.slice(-24).map(m => {
      const rs = months.get(m);
      const o = { mes: m, filas: rs.length };
      for (const n of [money, cost, units].filter(Boolean)) o[n] = sum(rs, n);
      if (balance) { const v = rs.map(r => toNumber(r[balance])).filter(x => x !== null); if (v.length) o[`${balance} (cierre)`] = r2(v[v.length - 1]); }
      return o;
    });
  }
  return out;
}

/**
 * Cifras listas para copiar: los importes con separador de miles y €
 * ("14.309,91 €" en es-ES), los porcentajes con "%" y las cantidades sin €.
 * Los modelos copian mejor una cifra formateada que un float ("2301.58").
 */
const MONEYISH = /importe|total|venta|ingreso|factur|euro|€|eur\b|precio|price|pvp|tarifa|saldo|balance|coste|costo|cost|gasto|compra|cobro|pago|entrada|salida|iva|base|neto|bruto|beneficio|amount|revenue|sales|montant|prix|umsatz|betrag|preis|importo|prezzo|kwota|cena/i;
const LOCALES = { es: 'es-ES', en: 'en-GB', fr: 'fr-FR', it: 'it-IT', de: 'de-DE', pl: 'pl-PL' };
function formatStats(stats, lang = 'es') {
  if (!stats) return stats;
  const loc = LOCALES[lang] || 'es-ES';
  const money = new Intl.NumberFormat(loc, { style: 'currency', currency: 'EUR', useGrouping: 'always', minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const plain = new Intl.NumberFormat(loc, { useGrouping: 'always', maximumFractionDigits: 2 });
  const pct = new Intl.NumberFormat(loc, { maximumFractionDigits: 1 });
  const COUNT = /^(filas|grupos)$/;
  const fmt = (v, key, col) => { if (typeof v !== 'number') return v; const out = fmtRaw(v, key, col); return typeof out === 'string' ? out.replace(/[\u00a0\u202f]/g, ' ') : out; };
  const fmtRaw = (v, key, col) => {
    if (COUNT.test(key)) return v;
    if (/_pct$|^margen_pct$|^peso_pct$/.test(key)) return `${pct.format(v)} %`;
    const c = col || key;
    if (['ventas', 'costes', 'beneficio'].includes(key) || (!UNITS.test(c) && MONEYISH.test(c))) return money.format(v);
    return plain.format(v);
  };
  const walk = (node, col) => {
    if (Array.isArray(node)) return node.map(x => walk(x, col));
    if (node && typeof node === 'object') {
      const o = {};
      for (const [k, v] of Object.entries(node)) {
        // Dentro de "totales", la clave es la columna; dentro de una fila de grupo, cada clave numérica es una columna.
        const nextCol = node === stats.totales ? k : col;
        o[k] = v && typeof v === 'object' ? walk(v, nextCol) : fmt(v, k, typeof v === 'number' && !['suma', 'media', 'min', 'max', 'saldo_final', 'saldo_inicial'].includes(k) ? k : nextCol);
      }
      return o;
    }
    return node;
  };
  return walk(stats);
}

module.exports = { tableStats, formatStats, normalizeRows, serialToIso, toNumber, toMonth };
