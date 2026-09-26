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
  } else if ((s.match(/\./g) || []).length > 1) {
    s = s.replace(/\./g, '');
  }
  const n = Number(s);
  return Number.isFinite(n) ? (neg ? -n : n) : null;
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
    totals[c] = { ...(AVG_ONLY.test(c) && !MONEY.test(c) ? {} : { suma: total }), media: r2(nums.reduce((a, b) => a + b, 0) / nums.length), min: r2(Math.min(...nums)), max: r2(Math.max(...nums)) };
  }

  const summable = numeric.filter(c => totals[c].suma !== undefined);
  const money = summable.find(c => MONEY.test(c) && !COST.test(c)) || null;
  const cost = summable.find(c => COST.test(c)) || null;
  const units = summable.find(c => UNITS.test(c)) || null;
  const margin = (m, k) => (m && k && m !== 0 ? r2(((m - k) / m) * 100) : undefined);

  const out = { filas: list.length, columnas_numericas: numeric, totales: totals };
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
      return o;
    });
  }
  return out;
}

module.exports = { tableStats, toNumber, toMonth };
