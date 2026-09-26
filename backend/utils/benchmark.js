/**
 * utils/benchmark.js — V7: comparación con tu sector (sesión 4).
 *
 * Referencias REALES del INE (config/benchmarks.json, generado con
 * scripts/build-benchmarks.js una vez al año) frente a las cifras del libro
 * del usuario (últimos 12 meses). Nunca se inventan cifras: si el sector no
 * está cubierto o no hay datos, se dice.
 *
 * Métricas (todas sobre la cifra de negocios, %):
 *   operating_margin  ≈ (ingresos − gastos) / ingresos     vs  excedente bruto de explotación / cifra de negocios
 *   staff_costs       gastos de categoría "Personal"       vs  gastos de personal / cifra de negocios
 *   purchases         resto de gastos (compras y servicios) vs  compras de bienes y servicios / cifra de negocios
 */

'use strict';

const BENCH = require('../config/benchmarks.json');
const { addDays } = require('./finance');

const r1 = (n) => Math.round(n * 10) / 10;

function referenceFor(sector, size) {
  const s = BENCH.sectors[sector];
  if (!s) return null;
  const ref = s.by_size[size] || s.by_size.total;
  if (!ref) return null;
  return { sector, activity: s.activity, cnae: s.cnae, size: s.by_size[size] ? size : 'total', ...ref };
}

function yourMetrics(entries, refDate = new Date().toISOString().slice(0, 10)) {
  const from = addDays(refDate, -365);
  let income = 0, staff = 0, other = 0;
  for (const e of entries) {
    if (e.invoice_date < from || e.invoice_date > refDate) continue;
    if (e.type === 'income') income += e.base;
    else if (e.category === 'Personal') staff += e.base;
    else other += e.base;
  }
  if (income <= 0) return { from, to: refDate, income: r1(income), available: false };
  return {
    from, to: refDate, available: true,
    income: r1(income),
    operating_margin_pct: r1(((income - staff - other) / income) * 100),
    staff_costs_pct: r1((staff / income) * 100),
    purchases_pct: r1((other / income) * 100)
  };
}

/** 'better' | 'similar' | 'worse' (±15 % relativo, mínimo 2 puntos). */
function verdict(yours, ref, higherIsBetter) {
  if (yours == null || ref == null) return null;
  const tol = Math.max(Math.abs(ref) * 0.15, 2);
  if (Math.abs(yours - ref) <= tol) return 'similar';
  const up = yours > ref;
  return up === higherIsBetter ? 'better' : 'worse';
}

function compare(profile, entries) {
  const source = BENCH.source;
  const ref = profile?.sector ? referenceFor(profile.sector, profile.size) : null;
  if (!profile?.sector || !profile?.size) return { available: false, reason: 'missing_profile', source };
  if (!ref) return { available: false, reason: 'sector_not_covered', sector: profile.sector, source };
  const yours = yourMetrics(entries);
  const metrics = [
    { key: 'operating_margin', higher_is_better: true, yours: yours.operating_margin_pct ?? null, sector: ref.operating_margin_pct },
    { key: 'staff_costs', higher_is_better: false, yours: yours.staff_costs_pct ?? null, sector: ref.staff_costs_pct },
    { key: 'purchases', higher_is_better: false, yours: yours.purchases_pct ?? null, sector: ref.purchases_pct }
  ].map(m => ({ ...m, verdict: verdict(m.yours, m.sector, m.higher_is_better) }));
  return {
    available: true, source, reference: ref, yours, metrics,
    revenue_per_company_eur: ref.revenue_per_company_eur,
    owner_pay_included: ref.size === 'solo'
  };
}

/** Texto para el system prompt de la IA (solo cifras reales, con fuente). */
function promptContext(profile) {
  const ref = profile?.sector && profile?.size ? referenceFor(profile.sector, profile.size) : null;
  if (!ref) return '';
  return `Referencia sectorial real (Fuente: INE, Estadística Estructural de Empresas ${BENCH.source.year}; actividad "${ref.activity}", tramo ${ref.ine_size} personas): `
    + `excedente bruto de explotación ${ref.operating_margin_pct} % de la facturación, gastos de personal ${ref.staff_costs_pct} %, compras de bienes y servicios ${ref.purchases_pct} %. `
    + 'Úsala solo para comparar si los datos del usuario lo permiten, citando "INE" y el año; son medias agregadas, orientativas.';
}

module.exports = { compare, referenceFor, yourMetrics, verdict, promptContext, BENCH };
