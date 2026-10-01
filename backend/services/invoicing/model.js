/**
 * services/invoicing/model.js — sesión 11 (tanda 2): modelo interno de una
 * factura emitida, alineado con EN 16931, y su validación. Puro: sin BD.
 *
 * Importes: cada línea se redondea a 2 decimales; el IVA (y el recargo de
 * equivalencia) se calcula POR TIPO sobre la suma de bases de ese tipo
 * (BT-117 = BT-116 × tipo), como piden EN 16931 y VERI*FACTU; la retención
 * (IRPF) va sobre la base total.
 *
 * Tipos de factura (los de VERI*FACTU):
 *   F1  completa (cliente identificado con NIF)
 *   F2  simplificada (sin NIF del cliente; máx. 400 € IVA incluido, art. 4 RD 1619/2012)
 *   R1-R4 rectificativas de una F1 (R1 error fundado en derecho y art. 80.1, 80.2
 *         y 80.6 LIVA; R2 concurso, art. 80.3; R3 incobrables, art. 80.4; R4 resto)
 *   R5  rectificativa de una simplificada
 * Las rectificativas son "por diferencias": sus líneas son la corrección
 * (normalmente en negativo).
 */

'use strict';

const { validSpanishTaxId } = require('../invoiceChecks');
const { sanitizeFreeText } = require('../../utils/sanitize');

const r2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const txt = (v, max) => sanitizeFreeText(v ?? '').slice(0, max).trim();
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const EMAIL = /^[^\s@<>"',;]+@[^\s@<>"',;]+\.[a-z]{2,}$/i;

const VAT_RATES = [0, 4, 5, 10, 21];
// Recargo de equivalencia por tipo de IVA (art. 161 LIVA).
const RE_RATES = { 21: 5.2, 10: 1.4, 5: 0.62, 4: 0.5, 0: 0 };
const IRPF_RATES = [0, 1, 2, 7, 15, 19];
const KINDS = ['F1', 'F2', 'R1', 'R2', 'R3', 'R4', 'R5'];
const RECTIFY_KINDS = ['R1', 'R2', 'R3', 'R4', 'R5'];
// Operaciones al 0 %: exentas (E1-E6, arts. 20-25 LIVA), no sujetas (N1, N2)
// o inversión del sujeto pasivo (S2). Mismas claves que VERI*FACTU.
const EXEMPTIONS = ['E1', 'E2', 'E3', 'E4', 'E5', 'E6', 'N1', 'N2', 'S2'];
const PAYMENT_METHODS = ['transfer', 'direct_debit', 'card', 'cash', 'other'];
const SIMPLIFIED_MAX = 400;
const MAX_LINES = 200;
const SERIES = /^[A-Z0-9]{1,8}$/;
const COUNTRY = /^[A-Z]{2}$/;

/** Fecha de hoy en España (las facturas se fechan en hora peninsular). */
function todayMadrid(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

function addDays(iso, days) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** IBAN con su control mod 97 (ISO 13616). */
function validIban(raw) {
  const s = String(raw || '').toUpperCase().replace(/\s+/g, '');
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(s)) return false;
  const moved = s.slice(4) + s.slice(0, 4);
  let rem = 0;
  for (const ch of moved) {
    const v = /\d/.test(ch) ? ch : String(ch.charCodeAt(0) - 55);
    for (const d of v) rem = (rem * 10 + Number(d)) % 97;
  }
  return rem === 1;
}

const cleanTaxId = (v) => String(v || '').toUpperCase().replace(/[\s.-]/g, '').slice(0, 20);

/** Datos de una parte (emisor o cliente) normalizados. */
function normalizeParty(raw = {}) {
  const country = String(raw.country || 'ES').toUpperCase().slice(0, 2);
  let taxId = cleanTaxId(raw.tax_id ?? raw.nif);
  if (country === 'ES') taxId = taxId.replace(/^ES(?=[0-9A-Z]{9}$)/, '');
  const email = String(raw.email || '').trim().toLowerCase().slice(0, 160);
  return {
    name: txt(raw.name ?? raw.legal_name, 160),
    tax_id: taxId,
    email: EMAIL.test(email) ? email : '',
    address: txt(raw.address, 200),
    postal_code: txt(raw.postal_code, 12),
    city: txt(raw.city, 80),
    province: txt(raw.province, 80),
    country: COUNTRY.test(country) ? country : 'ES'
  };
}

/** Qué le falta al emisor para poder facturar (vacío = completo). */
function issuerMissing(issuer) {
  const miss = [];
  if (!issuer.name) miss.push('legal_name');
  if (!issuer.tax_id || !validSpanishTaxId(issuer.tax_id)) miss.push('tax_id');
  if (!issuer.address) miss.push('address');
  if (!issuer.postal_code || (issuer.country === 'ES' && !/^\d{5}$/.test(issuer.postal_code))) miss.push('postal_code');
  if (!issuer.city) miss.push('city');
  return miss;
}

function customerError(c) {
  if (!c.name) return 'customer_name';
  if (c.postal_code && c.country === 'ES' && !/^\d{5}$/.test(c.postal_code)) return 'customer_postal_code';
  if (c.tax_id) {
    if (c.country === 'ES' && !validSpanishTaxId(c.tax_id)) return 'customer_tax_id';
    if (c.country !== 'ES' && c.tax_id.length < 2) return 'customer_tax_id';
  }
  return null;
}

/** Líneas → líneas normalizadas, o { error }. */
function normalizeLines(raw, { surcharge }) {
  if (!Array.isArray(raw) || !raw.length) return { error: 'lines' };
  if (raw.length > MAX_LINES) return { error: 'too_many_lines' };
  const lines = [];
  for (const [i, l] of raw.entries()) {
    const description = txt(l?.description, 500);
    const quantity = Number(l?.quantity ?? 1);
    const unitPrice = Number(l?.unit_price);
    const discount = Number(l?.discount_pct ?? 0);
    const vatRate = Number(l?.vat_rate ?? 21);
    if (!description) return { error: 'line_description', index: i };
    if (!Number.isFinite(quantity) || quantity === 0 || Math.abs(quantity) > 1e6) return { error: 'line_quantity', index: i };
    if (!Number.isFinite(unitPrice) || Math.abs(unitPrice) > 1e8) return { error: 'line_unit_price', index: i };
    if (!Number.isFinite(discount) || discount < 0 || discount > 100) return { error: 'line_discount', index: i };
    if (!VAT_RATES.includes(vatRate)) return { error: 'line_vat_rate', index: i };
    const q = Math.round(quantity * 1000) / 1000;
    const p = Math.round(unitPrice * 10000) / 10000;
    lines.push({
      position: i + 1,
      description,
      quantity: q,
      unit: txt(l?.unit, 12),
      unit_price: p,
      discount_pct: r2(discount),
      vat_rate: vatRate,
      re_rate: surcharge ? RE_RATES[vatRate] : 0,
      amount: r2(q * p * (1 - discount / 100))
    });
  }
  return { lines };
}

/** Desglose por tipo y totales (EN 16931: IVA por tipo sobre la suma de bases). */
function computeTotals(lines, irpfRate) {
  const groups = new Map();
  for (const l of lines) {
    const key = `${l.vat_rate}|${l.re_rate}`;
    const g = groups.get(key) || { vat_rate: l.vat_rate, re_rate: l.re_rate, base: 0 };
    g.base = r2(g.base + l.amount);
    groups.set(key, g);
  }
  const taxes = [...groups.values()]
    .sort((a, b) => b.vat_rate - a.vat_rate)
    .map(g => ({ ...g, vat_amount: r2(g.base * g.vat_rate / 100), re_amount: r2(g.base * g.re_rate / 100) }));
  const base = r2(taxes.reduce((s, g) => s + g.base, 0));
  const vat = r2(taxes.reduce((s, g) => s + g.vat_amount, 0));
  const re = r2(taxes.reduce((s, g) => s + g.re_amount, 0));
  const irpf = r2(base * irpfRate / 100);
  return { taxes, base, vat_amount: vat, re_amount: re, irpf_rate: irpfRate, irpf_amount: irpf, total: r2(base + vat + re - irpf) };
}

/**
 * Valida y arma una factura a partir del cuerpo de la petición.
 * ctx: { issuer (normalizado), customer (normalizado o null), original (si rectifica), today }
 * Devuelve { invoice } o { error, field?, index?, fields? }.
 */
function buildInvoice(body, ctx) {
  const today = ctx.today || todayMadrid();
  const missing = issuerMissing(ctx.issuer);
  if (missing.length) return { error: 'issuer_incomplete', fields: missing };

  const original = ctx.original || null;
  const surcharge = !!body.equivalence_surcharge;
  const L = normalizeLines(body.lines, { surcharge });
  if (L.error) return { error: 'invalid_input', field: L.error, index: L.index };

  const irpfRate = Number(body.irpf_rate ?? 0);
  if (!IRPF_RATES.includes(irpfRate)) return { error: 'invalid_input', field: 'irpf_rate' };
  const totals = computeTotals(L.lines, irpfRate);

  const customer = ctx.customer;
  if (customer) {
    const ce = customerError(customer);
    if (ce) return { error: 'invalid_input', field: ce };
  }

  // Tipo de factura.
  let kind;
  if (original) {
    kind = String(body.rectification_kind || (original.kind === 'F2' || original.kind === 'R5' ? 'R5' : 'R1')).toUpperCase();
    if (!RECTIFY_KINDS.includes(kind)) return { error: 'invalid_input', field: 'rectification_kind' };
    const simplifiedOriginal = original.kind === 'F2' || original.kind === 'R5';
    if (simplifiedOriginal !== (kind === 'R5')) return { error: 'invalid_input', field: 'rectification_kind' };
    if (!txt(body.rectification_reason, 300)) return { error: 'invalid_input', field: 'rectification_reason' };
    if (totals.total === 0 && totals.base === 0) return { error: 'invalid_input', field: 'lines' };
  } else {
    kind = customer?.tax_id ? 'F1' : 'F2';
    if (totals.total <= 0) return { error: 'invalid_input', field: 'total' };
    if (kind === 'F2' && totals.total > SIMPLIFIED_MAX) return { error: 'customer_tax_id_required', max: SIMPLIFIED_MAX };
  }
  if (kind === 'F1' || ['R1', 'R2', 'R3', 'R4'].includes(kind)) {
    if (!customer?.tax_id) return { error: 'customer_tax_id_required' };
  }

  // Operaciones al 0 %: hace falta la causa (exenta, no sujeta o inversión del sujeto pasivo).
  const hasZero = totals.taxes.some(g => g.vat_rate === 0);
  const exemption = hasZero ? String(body.exemption || '').toUpperCase() : '';
  if (hasZero && !EXEMPTIONS.includes(exemption)) return { error: 'invalid_input', field: 'exemption' };

  // Series: las rectificativas van en una serie propia (empieza por R).
  const series = String(body.series || (original ? 'R' : 'F')).toUpperCase();
  if (!SERIES.test(series) || (original ? !series.startsWith('R') : series.startsWith('R'))) return { error: 'invalid_input', field: 'series' };

  const issueDate = body.issue_date === undefined || body.issue_date === '' ? today : String(body.issue_date);
  if (!ISO.test(issueDate) || isNaN(Date.parse(`${issueDate}T00:00:00Z`))) return { error: 'invalid_input', field: 'issue_date' };
  if (issueDate > today) return { error: 'invalid_input', field: 'issue_date_future' };
  if (original && issueDate < original.issue_date) return { error: 'invalid_input', field: 'issue_date' };

  let operationDate = null;
  if (body.operation_date) {
    if (!ISO.test(String(body.operation_date))) return { error: 'invalid_input', field: 'operation_date' };
    // VERI*FACTU rechaza una fecha de operación posterior a la de expedición (salvo claves 14/15).
    if (String(body.operation_date) > issueDate) return { error: 'invalid_input', field: 'operation_date' };
    if (body.operation_date !== issueDate) operationDate = String(body.operation_date);
  }

  const termsDays = Number.isInteger(ctx.paymentTermsDays) ? ctx.paymentTermsDays : 30;
  let dueDate = body.due_date === undefined ? addDays(issueDate, termsDays) : (body.due_date || null);
  if (dueDate && (!ISO.test(String(dueDate)) || dueDate < issueDate)) return { error: 'invalid_input', field: 'due_date' };

  const paymentMethod = PAYMENT_METHODS.includes(body.payment_method) ? body.payment_method : 'transfer';
  let iban = '';
  if (paymentMethod === 'transfer' || paymentMethod === 'direct_debit') {
    iban = String(body.iban ?? ctx.issuerIban ?? '').toUpperCase().replace(/\s+/g, '');
    if (iban && !validIban(iban)) return { error: 'invalid_input', field: 'iban' };
  }

  const lang = ['es', 'en', 'fr', 'it', 'de', 'pl'].includes(body.lang) ? body.lang : (ctx.defaultLang || 'es');

  return {
    invoice: {
      kind, series, issue_date: issueDate, operation_date: operationDate, due_date: dueDate,
      currency: 'EUR', lang,
      issuer: ctx.issuer, customer: customer || null,
      lines: L.lines, ...totals,
      equivalence_surcharge: surcharge,
      exemption: exemption || null,
      payment_method: paymentMethod, iban,
      notes: txt(body.notes, 1000),
      rectifies_id: original ? original.id : null,
      rectification_reason: original ? txt(body.rectification_reason, 300) : ''
    }
  };
}

/** Número visible: serie + año + correlativo (F2026-0001). */
const formatNumber = (series, year, seq) => `${series}${year}-${String(seq).padStart(4, '0')}`;

module.exports = {
  VAT_RATES, RE_RATES, IRPF_RATES, KINDS, RECTIFY_KINDS, EXEMPTIONS, PAYMENT_METHODS, SIMPLIFIED_MAX,
  r2, todayMadrid, addDays, validIban, normalizeParty, issuerMissing, normalizeLines, computeTotals, buildInvoice, formatNumber
};
