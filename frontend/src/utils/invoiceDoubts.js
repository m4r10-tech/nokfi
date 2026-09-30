/**
 * Campos dudosos de una factura leída por la IA, para marcar solo esos en la
 * revisión (en vez de un aviso genérico). Mismas reglas que
 * backend/services/invoiceChecks.js (checkInvoice), pero por campo y en vivo:
 * al corregir un campo, su marca desaparece.
 *
 * Devuelve { campo: códigoDelAviso }. Los códigos se traducen con
 * finance.import.doubts.<código>.
 */
const NIF_LETTERS = 'TRWAGMYFPDXBNJZSQVHLCKE';
const CIF_CONTROL_LETTERS = 'JABCDEFGHI';
const KNOWN_VAT = [0, 4, 5, 7, 10, 15, 21, 3, 9.5];
const n = (v) => Math.round((Number(v) || 0) * 100) / 100;

export function validSpanishTaxId(raw) {
  const s = String(raw || '').toUpperCase().replace(/[\s.-]/g, '').replace(/^ES/, '');
  if (/^\d{8}[A-Z]$/.test(s)) return NIF_LETTERS[Number(s.slice(0, 8)) % 23] === s[8];
  if (/^[XYZ]\d{7}[A-Z]$/.test(s)) return NIF_LETTERS[Number(String('XYZ'.indexOf(s[0])) + s.slice(1, 8)) % 23] === s[8];
  if (/^[ABCDEFGHJNPQRSUVW]\d{7}[0-9A-J]$/.test(s)) {
    let sum = 0;
    for (let i = 0; i < 7; i++) {
      const d = Number(s[i + 1]);
      if (i % 2 === 0) { const x = d * 2; sum += Math.floor(x / 10) + (x % 10); } else sum += d;
    }
    const control = (10 - (sum % 10)) % 10;
    const c = s[8];
    if ('ABEH'.includes(s[0])) return c === String(control);
    if ('PQRSNW'.includes(s[0])) return c === CIF_CONTROL_LETTERS[control];
    return c === String(control) || c === CIF_CONTROL_LETTERS[control];
  }
  return false;
}

export function invoiceDoubts(r, today = new Date().toISOString().slice(0, 10)) {
  const out = {};
  const base = n(r.base), vat = n(r.vat_amount), irpf = n(r.irpf_amount), total = n(r.total);
  if (!(base > 0 || total > 0)) out.total = 'amounts';
  else if (Math.abs(base + vat - irpf - total) > 0.05) { out.total = 'total'; out.base = 'total'; }
  const rate = Number(r.vat_rate);
  if (base > 0 && rate > 0 && Math.abs(base * rate / 100 - vat) > 0.05 + base * 0.001) out.vat_amount = 'vat';
  else if (r.vat_rate !== '' && r.vat_rate != null && !KNOWN_VAT.includes(rate)) out.vat_amount = 'vatRate';
  if (!String(r.party_nif || '').trim()) out.party_nif = 'nifMissing';
  else if (!validSpanishTaxId(r.party_nif)) out.party_nif = 'nif';
  if (!String(r.party_name || '').trim()) out.party_name = 'name';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(r.invoice_date || '') || r.invoice_date < '2000-01-01') out.invoice_date = 'date';
  else if (r.invoice_date > today) out.invoice_date = 'dateFuture';
  if (r.due_date && r.invoice_date && r.due_date < r.invoice_date) out.due_date = 'due';
  if (!String(r.invoice_number || '').trim()) out.invoice_number = 'number';
  return out;
}
