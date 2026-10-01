/**
 * Sesión 11: utilidades de Finanzas › Facturas. El cálculo es el MISMO que el
 * del backend (services/invoicing/model.js) para que la vista previa coincida
 * al céntimo con la factura emitida; el que manda es el servidor.
 */

import { apiErrorMessage } from '../../middleware/errors';

export const VAT_RATES = [21, 10, 5, 4, 0];
export const IRPF_RATES = [0, 1, 2, 7, 15, 19];
export const RE_RATES = { 21: 5.2, 10: 1.4, 5: 0.62, 4: 0.5, 0: 0 };
export const EXEMPTIONS = ['E1', 'E2', 'E3', 'E4', 'E5', 'E6', 'N1', 'N2', 'S2'];
export const PAYMENT_METHODS = ['transfer', 'direct_debit', 'card', 'cash', 'other'];
export const RECTIFY_KINDS = ['R1', 'R2', 'R3', 'R4'];
export const INVOICE_LANGS = ['es', 'en', 'fr', 'it', 'de', 'pl'];
export const SIMPLIFIED_MAX = 400;

const r2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

export function lineAmount(l) {
  const q = Math.round((Number(l.quantity) || 0) * 1000) / 1000;
  const p = Math.round((Number(l.unit_price) || 0) * 10000) / 10000;
  return r2(q * p * (1 - (Number(l.discount_pct) || 0) / 100));
}

export function computeTotals(lines, irpfRate, surcharge) {
  const groups = new Map();
  for (const l of lines) {
    const vat = Number(l.vat_rate);
    const re = surcharge ? RE_RATES[vat] || 0 : 0;
    const key = `${vat}|${re}`;
    const g = groups.get(key) || { vat_rate: vat, re_rate: re, base: 0 };
    g.base = r2(g.base + lineAmount(l));
    groups.set(key, g);
  }
  const taxes = [...groups.values()].sort((a, b) => b.vat_rate - a.vat_rate)
    .map(g => ({ ...g, vat_amount: r2(g.base * g.vat_rate / 100), re_amount: r2(g.base * g.re_rate / 100) }));
  const base = r2(taxes.reduce((s, g) => s + g.base, 0));
  const vat = r2(taxes.reduce((s, g) => s + g.vat_amount, 0));
  const re = r2(taxes.reduce((s, g) => s + g.re_amount, 0));
  const irpf = r2(base * (Number(irpfRate) || 0) / 100);
  return { taxes, base, vat_amount: vat, re_amount: re, irpf_amount: irpf, total: r2(base + vat + re - irpf) };
}

/** Estado visible de una factura (para la insignia del listado). */
export function invoiceState(inv) {
  if (inv.status === 'cancelled') return { key: 'cancelled', tone: 'negative' };
  if (inv.kind?.startsWith('R')) return { key: 'rectification', tone: 'accent' };
  if (inv.rectified_by?.length) return { key: 'rectified', tone: 'muted' };
  if (inv.paid) return { key: 'collected', tone: 'positive' };
  return { key: 'pending', tone: 'warning' };
}

const KNOWN_FIELDS = ['lines', 'too_many_lines', 'line_description', 'line_quantity', 'line_unit_price', 'line_discount', 'line_vat_rate', 'irpf_rate',
  'customer_name', 'customer_tax_id', 'rectification_kind', 'rectification_reason', 'total', 'exemption', 'series', 'issue_date', 'issue_date_future',
  'issue_date_before_last', 'operation_date', 'due_date', 'iban', 'payment_terms_days', 'to'];
const KNOWN_ERRORS = ['issuer_incomplete', 'customer_tax_id_required', 'customer_not_found', 'original_not_found', 'original_cancelled',
  'already_cancelled', 'has_rectifications', 'invoice_locked', 'invoice_cancelled', 'send_rate_limited', 'email_unavailable', 'email_failed'];

/** Error de la API de facturas → texto en el idioma del usuario. */
export function invoiceError(t, res) {
  const d = res?.data || {};
  if (d.error === 'invalid_input' && KNOWN_FIELDS.includes(d.field)) {
    const line = Number.isInteger(d.index) ? ` (${t('invoices.line')} ${d.index + 1})` : '';
    return t(`invoices.errors.${d.field}`, { date: d.last_date || '' }) + line;
  }
  if (KNOWN_ERRORS.includes(d.error)) return t(`invoices.errors.${d.error}`, { max: SIMPLIFIED_MAX });
  return apiErrorMessage(t, res);
}

export function emptyLine(vat = 21) {
  return { description: '', quantity: 1, unit: '', unit_price: '', discount_pct: 0, vat_rate: vat };
}
