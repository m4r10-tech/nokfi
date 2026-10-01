/**
 * services/invoiceChecks.js — sesión 7 (API, Bloque 1.2): validaciones
 * DETERMINISTAS de las facturas extraídas por la IA. La IA lee; Nokfi
 * comprueba. Nada de esto lo decide el modelo.
 *
 *   checks: { totals_ok, nif_valid, recipient_nif_valid, date_valid, vat_rate_valid }
 *   warnings: [{ code, message }]
 */

'use strict';

const NIF_LETTERS = 'TRWAGMYFPDXBNJZSQVHLCKE';
const CIF_CONTROL_LETTERS = 'JABCDEFGHI';

/** NIF (DNI), NIE o CIF español con su dígito o letra de control. */
function validSpanishTaxId(raw) {
  const s = String(raw || '').toUpperCase().replace(/[\s.-]/g, '').replace(/^ES/, '');
  if (/^\d{8}[A-Z]$/.test(s)) return NIF_LETTERS[Number(s.slice(0, 8)) % 23] === s[8];
  if (/^[XYZ]\d{7}[A-Z]$/.test(s)) {
    const n = Number(String('XYZ'.indexOf(s[0])) + s.slice(1, 8));
    return NIF_LETTERS[n % 23] === s[8];
  }
  if (/^[ABCDEFGHJNPQRSUVW]\d{7}[0-9A-J]$/.test(s)) {
    const digits = s.slice(1, 8);
    let sum = 0;
    for (let i = 0; i < 7; i++) {
      const d = Number(digits[i]);
      if (i % 2 === 0) { const x = d * 2; sum += Math.floor(x / 10) + (x % 10); } else sum += d;
    }
    const control = (10 - (sum % 10)) % 10;
    const c = s[8];
    // Sociedades (A, B, E, H) llevan número; P, Q, R, S, N, W llevan letra; el resto, cualquiera.
    if ('ABEH'.includes(s[0])) return c === String(control);
    if ('PQRSNW'.includes(s[0])) return c === CIF_CONTROL_LETTERS[control];
    return c === String(control) || c === CIF_CONTROL_LETTERS[control];
  }
  return false;
}

// Tipos de IVA (península) y de IGIC habituales; 0 para exentas.
const KNOWN_VAT = [0, 4, 5, 7, 10, 15, 21, 3, 9.5];
const today = () => new Date().toISOString().slice(0, 10);

function checkInvoice(inv, refDate = today()) {
  const warnings = [];
  const w = (code, message) => warnings.push({ code, message });
  // Las rectificativas (abonos) llegan en negativo y también tienen importes.
  const hasAmounts = inv.total !== 0 || inv.base !== 0;
  const totals_ok = hasAmounts && Math.abs(inv.base + inv.vat_amount - inv.irpf_amount - inv.total) <= 0.05;
  if (!hasAmounts) w('amounts_missing', 'No se han podido leer los importes.');
  else if (!totals_ok) w('totals_mismatch', 'Base + IVA − retención no coincide con el total.');
  if (hasAmounts && inv.base > 0 && inv.vat_rate > 0 && Math.abs(inv.base * inv.vat_rate / 100 - inv.vat_amount) > 0.05 + inv.base * 0.001) {
    w('vat_amount_mismatch', 'La cuota de IVA no corresponde al tipo aplicado sobre la base (¿varios tipos de IVA?).');
  }
  const nif_valid = !!inv.issuer_nif && validSpanishTaxId(inv.issuer_nif);
  if (!inv.issuer_nif) w('issuer_nif_missing', 'No aparece el NIF del emisor.');
  else if (!nif_valid) w('issuer_nif_invalid', 'El NIF/CIF del emisor no es válido (dígito de control) o no es español.');
  const recipient_nif_valid = inv.recipient_nif ? validSpanishTaxId(inv.recipient_nif) : null;
  if (recipient_nif_valid === false) w('recipient_nif_invalid', 'El NIF/CIF del receptor no es válido (dígito de control) o no es español.');
  const plausible = /^\d{4}-\d{2}-\d{2}$/.test(inv.invoice_date) && !isNaN(Date.parse(inv.invoice_date + 'T00:00:00Z'))
    && inv.invoice_date >= '2000-01-01';
  const future = plausible && inv.invoice_date > refDate;
  const date_valid = plausible && !future;
  if (!inv.invoice_date) w('date_missing', 'No aparece la fecha de la factura.');
  else if (!plausible) w('date_invalid', 'La fecha de la factura no es válida.');
  else if (future) w('date_in_future', 'La fecha de la factura es posterior a hoy.');
  if (inv.due_date && inv.invoice_date && inv.due_date < inv.invoice_date) w('due_before_issue', 'El vencimiento es anterior a la fecha de la factura.');
  const vat_rate_valid = KNOWN_VAT.includes(inv.vat_rate);
  if (!vat_rate_valid) w('vat_rate_unusual', `Tipo de IVA poco habitual: ${inv.vat_rate} %.`);
  if (!inv.invoice_number) w('number_missing', 'No aparece el número de factura.');
  return { checks: { totals_ok, nif_valid, recipient_nif_valid, date_valid, vat_rate_valid }, warnings };
}

module.exports = { validSpanishTaxId, checkInvoice };
