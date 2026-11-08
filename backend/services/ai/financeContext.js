/**
 * services/ai/financeContext.js — contexto financiero compacto del libro
 * (sesión 8). Lo usan los informes de IA (diagnóstico) y el asistente para
 * hablar con los datos REALES del usuario en vez de con frases genéricas.
 *
 * Todo sale de los cálculos deterministas de utils/finance.js: la IA no
 * calcula nada, solo copia las cifras (ya formateadas en el idioma del
 * informe) y enlaza a la pantalla de Nokfi que resuelve cada cosa.
 */

'use strict';

const F = require('../../db/finance');
const { getCompanyProfile } = require('../../db/database');
const { taxSummary, receivables, leaks, forecast, quarterOf } = require('../../utils/finance');
const { upcoming, iso } = require('../../utils/fiscalCalendar');

/* Pantallas de Nokfi a las que puede enlazar la IA (clave → ruta). */
const NOKFI_LINKS = {
  cobros: '/app/finanzas/cobros',
  impuestos: '/app/finanzas/impuestos',
  prevision: '/app/finanzas/prevision',
  calendario: '/app/finanzas/calendario',
  libro: '/app/finanzas/libro',
  fugas: '/app/finanzas/fugas',
  sector: '/app/finanzas/sector',
  calculadoras: '/app/calculadoras',
  excel: '/app/excel',
  configuracion: '/app/configuracion'
};
const LINK_KEYS = Object.keys(NOKFI_LINKS);
const LINK_PATHS = new Set(Object.values(NOKFI_LINKS));

/** Acepta una clave ("cobros") o una ruta de la lista; cualquier otra cosa → ''. */
function normalizeLink(v) {
  const s = String(v ?? '').trim().toLowerCase();
  if (NOKFI_LINKS[s]) return NOKFI_LINKS[s];
  return LINK_PATHS.has(s) ? s : '';
}

/* Nombre de cada modelo de Hacienda (contexto de la IA, S15b D3). */
const MODEL_NAMES = {
  '303': 'IVA trimestral', '130': 'pago fraccionado del IRPF', '111': 'retenciones de trabajadores y profesionales',
  '115': 'retenciones de alquileres', '390': 'resumen anual del IVA', '190': 'resumen anual de retenciones',
  '180': 'resumen anual de retenciones de alquileres', '347': 'operaciones con terceros', '202': 'pago fraccionado del Impuesto sobre Sociedades',
  '100': 'declaración de la renta', '200': 'Impuesto sobre Sociedades'
};
const modelLabel = (m) => (MODEL_NAMES[m] ? `modelo ${m} (${MODEL_NAMES[m]})` : `modelo ${m}`);

const LOCALES = { es: 'es-ES', en: 'en-GB', fr: 'fr-FR', it: 'it-IT', de: 'de-DE', pl: 'pl-PL' };

function formatters(lang) {
  const loc = LOCALES[lang] || 'es-ES';
  const money = new Intl.NumberFormat(loc, { style: 'currency', currency: 'EUR', useGrouping: 'always', minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const date = new Intl.DateTimeFormat(loc, { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
  const nb = (s) => s.replace(/[  ]/g, ' ');
  return {
    eur: (n) => nb(money.format(Number(n) || 0)),
    date: (d) => (d ? nb(date.format(new Date(`${String(d).slice(0, 10)}T00:00:00Z`))) : '')
  };
}

/**
 * @param {number} licenseId
 * @param {object} [o]
 * @param {string} [o.lang]      idioma de las cifras y fechas
 * @param {number} [o.maxChars]  tope del texto (el chat usa menos)
 * @param {string} [o.today]     YYYY-MM-DD (tests)
 * @returns {{ text: string, hasData: boolean }}
 */
function financeContext(licenseId, { lang = 'es', maxChars = 3000, today = iso(new Date()) } = {}) {
  const profile = getCompanyProfile(licenseId) || {};
  const entries = F.allEntries(licenseId);
  const f = formatters(lang);
  const lines = [`Hoy es ${f.date(today)}.`];

  // S15b D3: cada modelo con su nombre y su plazo, para que la IA no junte el importe
  // estimado (303/130) con la fecha de otro modelo (p. ej. 111/115 el 20 de enero).
  const next = upcoming(profile.legal_form || undefined, today, 1)[0];
  if (next) {
    const estimated = next.models.filter(m => m === '303' || m === '130');
    const note = estimated.length === next.models.length
      ? ''
      : `; Nokfi no estima el importe de ${next.models.filter(m => !estimated.includes(m)).map(m => `el ${m}`).join(' ni ')}`;
    lines.push(`Próximo plazo fiscal (${next.period}) el ${f.date(next.date)}, faltan ${next.days_left} días: ${next.models.map(modelLabel).join('; ')}${note} [enlace: calendario].`);
  }
  // S15b (U10/F2): una sociedad no presenta el 130 ni paga IRPF por su actividad.
  if (profile.legal_form === 'sociedad') {
    lines.push('Es una sociedad: NO presenta el modelo 130 ni el IRPF de la actividad (son de autónomos); no los menciones como suyos. Sus modelos son el 303 (IVA), el 111 y el 115 si practica retenciones (nóminas, profesionales, alquiler), el 202 (pagos fraccionados) y el 200 (Impuesto sobre Sociedades). Nokfi todavía no calcula el 200, el 202, el 111 ni el 115: no des cifras de ellos.');
  }

  if (!entries.length) {
    lines.push('El libro de facturas está vacío: no hay cifras reales de ingresos, gastos, cobros ni impuestos. No inventes ninguna; puedes proponer registrar las facturas en el libro [enlace: libro].');
    return { text: cap(lines, maxChars), hasData: false };
  }

  const incomes = entries.filter(e => e.type === 'income').length;
  lines.push(`Libro de Nokfi: ${entries.length} apuntes (${incomes} ingresos, ${entries.length - incomes} gastos).`);

  // Impuestos del trimestre en curso (303 + 130).
  const cq = quarterOf(today);
  const tax = taxSummary(entries, { ...cq, legalForm: profile.legal_form, reserve: F.getReserve(licenseId, cq.year, cq.quarter) });
  const vat = tax.vat.result < 0
    ? `IVA (303) a compensar ${f.eur(-tax.vat.result)}: no se paga ni se devuelve ahora, se descuenta en los trimestres siguientes`
    : `IVA (303) a pagar ${f.eur(tax.vat.result)}`;
  // S15b T4: si el 303 descuenta IVA a compensar de trimestres anteriores, se dice (si no, la
  // IA ve un 303 menor que el IVA del trimestre y no sabe por qué).
  const comp = tax.vat.previous_compensation > 0
    ? ` (ya descontados ${f.eur(tax.vat.previous_compensation)} de IVA a compensar de trimestres anteriores; el IVA del propio trimestre sale ${f.eur(tax.vat.quarter_result)})`
    : '';
  const irpf = tax.irpf130 ? `; IRPF (130) ${f.eur(tax.irpf130.result)}` : '';
  const estModels = tax.irpf130 ? 'modelos 303 y 130' : 'modelo 303';
  lines.push(`Impuestos estimados del ${cq.quarter}T ${cq.year}, solo ${estModels} (plazo de estos modelos: hasta el ${f.date(tax.due_date)}; no mezcles este importe ni este plazo con los de otros modelos como el 111 o el 115): ${vat}${comp}${irpf}; total a pagar ${f.eur(tax.total_estimated)}; apartado ${f.eur(tax.reserved)}; falta por apartar ${f.eur(tax.missing)} [enlace: impuestos].`);

  // Cobros pendientes: total, vencido y los deudores más importantes.
  const rec = receivables(entries, today);
  if (rec.pending.length) {
    lines.push(`Por cobrar: ${f.eur(rec.total)} en ${rec.pending.length} facturas; de eso, vencido ${f.eur(rec.overdue_total)} [enlace: cobros].`);
    for (const p of rec.pending.slice(0, 5)) {
      const who = p.party_name || p.invoice_number || 'cliente sin nombre';
      const state = p.is_overdue
        ? `venció el ${f.date(p.effective_due_date)} (hace ${p.days_overdue} días)`
        : `vence el ${f.date(p.effective_due_date)} (faltan ${p.days_to_due} días)`;
      lines.push(`- ${who}: ${f.eur(p.total)}, ${state}${p.invoice_number ? `, factura ${p.invoice_number}` : ''}.`);
    }
  } else {
    lines.push('Por cobrar: nada pendiente.');
  }
  if (rec.avg_collection_days != null) lines.push(`Días medios de cobro: ${rec.avg_collection_days}.`);

  // Gastos recurrentes (fugas).
  const dismissed = F.dismissedSet(licenseId);
  const lk = leaks(entries, today, { dismissed });
  if (lk.recurring.length) {
    lines.push(`Gastos recurrentes: ${lk.recurring.length}, ${f.eur(lk.recurring_monthly_total)} al mes${lk.increases.length ? `; ${lk.increases.length} con subida de precio` : ''} [enlace: fugas].`);
  }

  // Previsión de caja (solo si el usuario ha indicado su saldo).
  if (profile.cash_balance != null) {
    const fc = forecast({ entries, balance: profile.cash_balance, days: 90, threshold: profile.cash_alert_threshold || 0, legalForm: profile.legal_form, dismissed, refDate: today });
    let s = `Caja: saldo ${f.eur(fc.start)}; previsto a 30 días ${f.eur(fc.at30)}, a 90 días ${f.eur(fc.at90)}; mínimo ${f.eur(fc.min.balance)} el ${f.date(fc.min.date)}`;
    if (fc.first_below) s += `; baja del aviso de ${f.eur(fc.threshold)} el ${f.date(fc.first_below.date)}`;
    lines.push(`${s} [enlace: prevision].`);
  } else {
    lines.push('Caja: el usuario no ha indicado su saldo, así que no hay previsión; puede indicarlo en Previsión [enlace: prevision].');
  }

  return { text: cap(lines, maxChars), hasData: true };
}

/** Recorta por líneas completas para no dejar una cifra a medias. */
function cap(lines, maxChars) {
  const out = [];
  let n = 0;
  for (const l of lines) {
    if (n + l.length + 1 > maxChars) break;
    out.push(l);
    n += l.length + 1;
  }
  return out.join('\n');
}

/**
 * Sesión 10: fuera de la web (API, MCP, webhooks) una ruta "/app/…" no sirve
 * de nada: se devuelve absoluta (https://nokfi.app/app/…). Copia el objeto:
 * cambia `link` en report.priorities, report.action_plan y en actions.
 */
function absoluteLinks(body) {
  if (!body || typeof body !== 'object') return body;
  const base = (process.env.APP_PUBLIC_URL || 'https://nokfi.app').replace(/\/+$/, '');
  const fix = (x) => (x && typeof x.link === 'string' && x.link.startsWith('/') ? { ...x, link: base + x.link } : x);
  const out = { ...body };
  if (out.report && typeof out.report === 'object') {
    out.report = { ...out.report };
    for (const k of ['priorities', 'action_plan']) if (Array.isArray(out.report[k])) out.report[k] = out.report[k].map(fix);
  }
  if (Array.isArray(out.actions)) out.actions = out.actions.map(fix);
  return out;
}

module.exports = { financeContext, normalizeLink, absoluteLinks, NOKFI_LINKS, LINK_KEYS };
