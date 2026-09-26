/**
 * utils/finance.js — cálculos DETERMINISTAS del núcleo de valor (sesión 4).
 *
 *   V2  taxSummary      IVA trimestral (modelo 303) y pago fraccionado IRPF (130)
 *   V4  receivables     cobros pendientes, días medios de cobro por cliente
 *   V5  leaks           suscripciones/recurrentes, duplicados y subidas de precio
 *   V3  forecast        previsión de caja 30/60/90 días con escenarios
 *
 * Todo sale del libro (ledger_entries, V1). La IA NO calcula nada de esto:
 * como mucho lo explica. Son ESTIMACIONES orientativas (la UI lo dice): no
 * es asesoramiento fiscal. Alcance V2: régimen general; recargo de
 * equivalencia, módulos e Impuesto de Sociedades quedan fuera.
 */

'use strict';

const { quarterlyDueDate, daysBetween, iso } = require('./fiscalCalendar');

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const today = () => iso(new Date());

function quarterOf(dateIso) {
  const m = Number(String(dateIso).slice(5, 7));
  return { year: Number(String(dateIso).slice(0, 4)), quarter: Math.floor((m - 1) / 3) + 1 };
}

function quarterRange(year, q) {
  const from = `${year}-${String((q - 1) * 3 + 1).padStart(2, '0')}-01`;
  const endMonth = q * 3;
  const last = new Date(Date.UTC(year, endMonth, 0)).getUTCDate();
  return { from, to: `${year}-${String(endMonth).padStart(2, '0')}-${last}` };
}

const inRange = (e, from, to) => e.invoice_date >= from && e.invoice_date <= to;

/* ── V2: 303 + 130 ── */
function vatForQuarter(entries, year, q) {
  const { from, to } = quarterRange(year, q);
  let output = 0, input = 0;
  for (const e of entries) {
    if (!inRange(e, from, to)) continue;
    if (e.type === 'income') output += e.vat_amount;
    else input += e.vat_amount;
  }
  return { output: r2(output), input: r2(input), result: r2(output - input) };
}

/**
 * Modelo 130 (estimación directa): 20 % del rendimiento neto ACUMULADO del
 * año hasta el trimestre − pagos fraccionados de trimestres anteriores −
 * retenciones soportadas acumuladas. Si sale negativo, se ingresa 0.
 */
function irpf130ForQuarter(entries, year, q) {
  let prevPayments = 0;
  let last = null;
  for (let k = 1; k <= q; k++) {
    const { to } = quarterRange(year, k);
    const from = `${year}-01-01`;
    let income = 0, expense = 0, withholdings = 0;
    for (const e of entries) {
      if (!inRange(e, from, to)) continue;
      if (e.type === 'income') { income += e.base; withholdings += e.irpf_amount; }
      else expense += e.base;
    }
    const net = income - expense;
    const gross = Math.max(0, net) * 0.2;
    const payable = Math.max(0, gross - prevPayments - withholdings);
    last = { income: r2(income), expense: r2(expense), net: r2(net), gross: r2(gross), previous_payments: r2(prevPayments), withholdings: r2(withholdings), result: r2(payable) };
    prevPayments += payable;
  }
  return last;
}

function taxSummary(entries, { year, quarter, legalForm, reserve = 0 }) {
  const vat = vatForQuarter(entries, year, quarter);
  const irpf = legalForm === 'sociedad' ? null : irpf130ForQuarter(entries, year, quarter);
  const toPay = Math.max(0, vat.result) + (irpf ? irpf.result : 0);
  return {
    year, quarter,
    due_date: quarterlyDueDate(year, quarter),
    vat, irpf130: irpf,
    total_estimated: r2(toPay),
    reserved: r2(reserve),
    missing: r2(Math.max(0, toPay - reserve)),
    vat_refund: vat.result < 0 ? r2(-vat.result) : 0
  };
}

/* ── V4: cobros ── */
function partyKey(e) {
  return (e.party_nif || '').toUpperCase() || (e.party_name || '').trim().toLowerCase();
}

function receivables(entries, refDate = today()) {
  const incomes = entries.filter(e => e.type === 'income');
  const byClient = new Map();
  for (const e of incomes.filter(x => x.paid && x.paid_at)) {
    const k = partyKey(e);
    const days = daysBetween(e.invoice_date, String(e.paid_at).slice(0, 10));
    if (days < 0) continue;
    const c = byClient.get(k) || { sum: 0, n: 0 };
    c.sum += days; c.n++;
    byClient.set(k, c);
  }
  const avgDays = (k) => { const c = byClient.get(k); return c ? Math.round(c.sum / c.n) : null; };
  const pending = incomes.filter(e => !e.paid).map(e => {
    const age = daysBetween(e.invoice_date, refDate);
    const overdue = e.due_date ? daysBetween(e.due_date, refDate) : age - 30;
    return {
      id: e.id, party_name: e.party_name, party_nif: e.party_nif, party_email: e.party_email || '', invoice_number: e.invoice_number,
      invoice_date: e.invoice_date, due_date: e.due_date, total: r2(e.total),
      days_outstanding: age, days_overdue: Math.max(0, overdue),
      level: age > 90 ? 'critical' : age > 60 ? 'high' : age > 30 ? 'medium' : 'ok',
      client_avg_days: avgDays(partyKey(e))
    };
  }).sort((a, b) => b.days_outstanding - a.days_outstanding);
  const allPaid = [...byClient.values()].reduce((s, c) => ({ sum: s.sum + c.sum, n: s.n + c.n }), { sum: 0, n: 0 });
  return {
    pending,
    total: r2(pending.reduce((s, p) => s + p.total, 0)),
    overdue_60: r2(pending.filter(p => p.days_outstanding > 60).reduce((s, p) => s + p.total, 0)),
    avg_collection_days: allPaid.n ? Math.round(allPaid.sum / allPaid.n) : null
  };
}

/* ── V5: fugas ── */
const monthOf = (d) => String(d).slice(0, 7);

function leaks(entries, refDate = today()) {
  const expenses = entries.filter(e => e.type === 'expense').sort((a, b) => a.invoice_date.localeCompare(b.invoice_date));
  const groups = new Map();
  for (const e of expenses) {
    const k = partyKey(e);
    if (!k) continue;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(e);
  }
  const currentMonth = monthOf(refDate);
  const recurring = [], increases = [], duplicates = [];

  for (const list of groups.values()) {
    const months = new Set(list.map(e => monthOf(e.invoice_date)));
    const name = list[list.length - 1].party_name || list[list.length - 1].party_nif;
    if (months.size >= 3) {
      // Importe mensual = el ÚLTIMO (tras una subida, la mediana se quedaría corta).
      const last = list[list.length - 1];
      recurring.push({
        party_name: name, party_nif: last.party_nif, months: months.size, monthly: r2(last.total),
        yearly: r2(last.total * 12), last_date: last.invoice_date, category: last.category, day: Number(last.invoice_date.slice(8, 10))
      });
      const firstAvg = (list[0].total + list[1].total) / 2;
      if (firstAvg > 0 && last.total > firstAvg * 1.05) {
        const prev = list[list.length - 2];
        increases.push({
          party_name: name, from: r2(firstAvg), to: r2(last.total), pct: r2(((last.total - firstAvg) / firstAvg) * 100),
          since: list[0].invoice_date, last_date: last.invoice_date,
          monthly_extra: r2(last.total - firstAvg), this_month: monthOf(last.invoice_date) === currentMonth, delta_vs_previous: r2(last.total - prev.total)
        });
      }
    }
    // Duplicados: mismo nº de factura, o mismo importe en ≤ 7 días.
    for (let i = 1; i < list.length; i++) {
      for (let j = 0; j < i; j++) {
        const a = list[j], b = list[i];
        const sameNumber = a.invoice_number && a.invoice_number === b.invoice_number;
        const sameAmount = Math.abs(a.total - b.total) < 0.01 && Math.abs(daysBetween(a.invoice_date, b.invoice_date)) <= 7;
        if (sameNumber || sameAmount) {
          duplicates.push({ id: b.id, original_id: a.id, party_name: name, total: r2(b.total), invoice_date: b.invoice_date, invoice_number: b.invoice_number, reason: sameNumber ? 'same_number' : 'same_amount', this_month: monthOf(b.invoice_date) === currentMonth });
          break;
        }
      }
    }
  }
  // Contador "Nokfi te ha ayudado a detectar X € este mes": solo importes
  // IDENTIFICADOS (cargos duplicados + sobrecoste de subidas este mes), no
  // ahorros supuestos.
  const detected = duplicates.filter(d => d.this_month).reduce((s, d) => s + d.total, 0)
    + increases.filter(i => i.this_month).reduce((s, i) => s + i.monthly_extra, 0);
  return {
    recurring: recurring.sort((a, b) => b.yearly - a.yearly),
    increases: increases.sort((a, b) => b.pct - a.pct),
    duplicates,
    recurring_monthly_total: r2(recurring.reduce((s, x) => s + x.monthly, 0)),
    detected_this_month: r2(detected)
  };
}

/* ── V3: previsión de caja ── */
function addDays(isoDate, n) {
  const d = new Date(isoDate + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return iso(d);
}

/**
 * @param {object} o
 * @param {Array}  o.entries
 * @param {number} o.balance         saldo actual (manual)
 * @param {number} [o.days=90]
 * @param {number} [o.threshold=0]   aviso si baja de aquí
 * @param {string} [o.legalForm]
 * @param {object} [o.scenario]      { hire_monthly, payment_delay_days, extra_monthly_income }
 */
function forecast({ entries, balance, days = 90, threshold = 0, legalForm, scenario = {}, refDate = today() }) {
  const horizon = Math.min(Math.max(Number(days) || 90, 7), 180);
  const end = addDays(refDate, horizon);
  const flows = []; // { date, amount, kind, label }
  const delay = Math.max(0, Math.min(Number(scenario.payment_delay_days) || 0, 180));

  // Cobros pendientes (V4): vencimiento o fecha + días medios del cliente (o 30).
  const rec = receivables(entries, refDate);
  // Prudencia: un cobro YA vencido no se da por cobrado hoy, sino dentro de 14 días.
  for (const p of rec.pending) {
    const expected = p.due_date || addDays(p.invoice_date, p.client_avg_days ?? 30);
    let date = expected < refDate ? addDays(refDate, 14) : expected;
    date = addDays(date, delay);
    flows.push({ date, amount: p.total, kind: 'receivable', label: p.party_name || p.invoice_number });
  }
  // Pagos pendientes a proveedores (gastos marcados sin pagar).
  for (const e of entries.filter(x => x.type === 'expense' && !x.paid)) {
    let date = e.due_date || addDays(e.invoice_date, 30);
    if (date < refDate) date = refDate;
    flows.push({ date, amount: -e.total, kind: 'payable', label: e.party_name });
  }
  // Gastos recurrentes (V5), proyectados cada mes el mismo día.
  const lk = leaks(entries, refDate);
  for (const r of lk.recurring) {
    let d = new Date(refDate + 'T00:00:00Z');
    for (let m = 0; m < 7; m++) {
      const y = d.getUTCFullYear(), mo = d.getUTCMonth() + m;
      const lastDay = new Date(Date.UTC(y, mo + 1, 0)).getUTCDate();
      const date = iso(new Date(Date.UTC(y, mo, Math.min(r.day || 1, lastDay))));
      if (date > refDate && date <= end && date > r.last_date) flows.push({ date, amount: -r.monthly, kind: 'recurring', label: r.party_name });
    }
  }
  // Impuestos previstos (V2): trimestre anterior (si aún no ha vencido) y actual.
  const { year, quarter } = quarterOf(refDate);
  const quarters = [quarter === 1 ? { year: year - 1, quarter: 4 } : { year, quarter: quarter - 1 }, { year, quarter }];
  for (const q of quarters) {
    const ts = taxSummary(entries, { ...q, legalForm });
    if (ts.due_date >= refDate && ts.due_date <= end && ts.total_estimated > 0) {
      flows.push({ date: ts.due_date, amount: -ts.total_estimated, kind: 'tax', label: `${q.quarter}T ${q.year}` });
    }
  }
  // Escenarios.
  const monthlyStarts = [];
  for (let m = 1; m <= 7; m++) {
    const d = new Date(refDate + 'T00:00:00Z');
    const date = iso(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + m, 1)));
    if (date <= end) monthlyStarts.push(date);
  }
  const hire = Math.max(0, Number(scenario.hire_monthly) || 0);
  const extra = Math.max(0, Number(scenario.extra_monthly_income) || 0);
  for (const date of monthlyStarts) {
    if (hire) flows.push({ date, amount: -hire, kind: 'scenario_hire', label: 'hire' });
    if (extra) flows.push({ date, amount: extra, kind: 'scenario_income', label: 'income' });
  }

  flows.sort((a, b) => a.date.localeCompare(b.date));
  const series = [];
  let bal = Number(balance) || 0;
  let min = { date: refDate, balance: bal };
  let firstBelow = null;
  let fi = 0;
  for (let i = 0; i <= horizon; i++) {
    const date = addDays(refDate, i);
    while (fi < flows.length && flows[fi].date <= date) { bal += flows[fi].amount; fi++; }
    series.push({ date, balance: r2(bal) });
    if (bal < min.balance) min = { date, balance: r2(bal) };
    if (!firstBelow && bal < threshold) firstBelow = { date, balance: r2(bal) };
  }
  const at = (n) => series[Math.min(n, series.length - 1)].balance;
  return {
    start: r2(balance), days: horizon, threshold: r2(threshold),
    series, flows: flows.map(f => ({ ...f, amount: r2(f.amount) })),
    min, first_below: firstBelow,
    at30: at(30), at60: at(60), at90: at(90)
  };
}

module.exports = { quarterOf, quarterRange, vatForQuarter, irpf130ForQuarter, taxSummary, receivables, leaks, forecast, addDays, r2 };
