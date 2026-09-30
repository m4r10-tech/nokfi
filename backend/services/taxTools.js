/**
 * services/taxTools.js — sesión 9 (API, Bloque 2.3): herramientas SIN IA.
 *
 * No gastan cuota: son cálculos deterministas (los mismos del libro y del
 * calendario fiscal). Cada función devuelve { status, body } para que la API
 * REST y el servidor MCP respondan igual.
 *
 *   taxId        validar NIF / NIE / CIF (dígito de control) y tipo de entidad
 *   vat          IVA (con o sin IVA incluido) y recargo de equivalencia
 *   withholding  retención de IRPF de una factura (y el total a cobrar)
 *   model130     pago fraccionado del modelo 130 (cifras propias o desde el libro)
 *   quarter      resumen del trimestre desde el libro (303 + 130)
 *   calendar     próximos plazos fiscales
 *
 * Régimen general, península y Baleares. Orientativo: no es asesoramiento fiscal.
 */

'use strict';

const { validSpanishTaxId } = require('./invoiceChecks');
const { irpf130ForQuarter, taxSummary, quarterOf, r2 } = require('../utils/finance');
const { upcoming, deadlinesFor, quarterlyDueDate, iso } = require('../utils/fiscalCalendar');
const { getCompanyProfile } = require('../db/database');
const F = require('../db/finance');

const NOTE = 'Cálculo orientativo (régimen general). No sustituye el asesoramiento fiscal.';
const bad = (message, error = 'invalid_input') => ({ status: 400, body: { error, message } });

/** Número de la entrada: admite 1234.5, "1234,5" y "1.234,50". */
function num(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : NaN;
  if (typeof v !== 'string' || !v.trim()) return NaN;
  let s = v.trim().replace(/\s|€/g, '');
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  return /^-?\d+(\.\d+)?$/.test(s) ? Number(s) : NaN;
}
const bool = (v) => v === true || v === 'true' || v === '1' || v === 1;

/* ── NIF / NIE / CIF ── */
const CIF_ENTITIES = {
  A: 'Sociedad anónima', B: 'Sociedad de responsabilidad limitada', C: 'Sociedad colectiva', D: 'Sociedad comanditaria',
  E: 'Comunidad de bienes o herencia yacente', F: 'Sociedad cooperativa', G: 'Asociación o fundación', H: 'Comunidad de propietarios',
  J: 'Sociedad civil', N: 'Entidad extranjera', P: 'Corporación local', Q: 'Organismo público', R: 'Congregación o institución religiosa',
  S: 'Órgano de la Administración del Estado o de las comunidades autónomas', U: 'Unión temporal de empresas',
  V: 'Otro tipo de entidad', W: 'Establecimiento permanente de entidad no residente'
};

function taxId(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return bad('Falta "value" (el NIF, NIE o CIF a validar).');
  if (raw.length > 30) return bad('El valor es demasiado largo.');
  const normalized = raw.toUpperCase().replace(/[\s.-]/g, '').replace(/^ES/, '');
  const kind = /^\d{8}[A-Z]$/.test(normalized) ? 'nif'
    : /^[XYZ]\d{7}[A-Z]$/.test(normalized) ? 'nie'
    : /^[ABCDEFGHJNPQRSUVW]\d{7}[0-9A-J]$/.test(normalized) ? 'cif' : null;
  const valid = validSpanishTaxId(normalized);
  return {
    status: 200,
    body: {
      value: raw,
      normalized,
      valid,
      type: kind,
      entity: kind === 'nif' || kind === 'nie' ? 'Persona física' : kind === 'cif' ? CIF_ENTITIES[normalized[0]] : null,
      vat_number: valid ? `ES${normalized}` : null,
      reason: valid ? null : kind ? 'check_digit' : 'format',
      note: 'Comprueba el formato y el dígito de control; no consulta si el NIF está dado de alta en la AEAT ni en el censo VIES.'
    }
  };
}

/* ── IVA y recargo de equivalencia ── */
const VAT_RATES = [0, 4, 5, 10, 21];
const SURCHARGE = { 21: 5.2, 10: 1.4, 5: 0.62, 4: 0.5, 0: 0 };

function vat(input = {}) {
  const amount = num(input.amount);
  const rate = input.rate === undefined || input.rate === '' ? 21 : num(input.rate);
  if (!Number.isFinite(amount) || amount < 0) return bad('"amount" debe ser un número mayor o igual que 0.');
  if (!VAT_RATES.includes(rate)) return bad(`"rate" debe ser uno de: ${VAT_RATES.join(', ')}.`);
  const includes = bool(input.includes_vat);
  const re = bool(input.equivalence_surcharge);
  const sRate = re ? SURCHARGE[rate] : 0;
  const base = includes ? amount / (1 + (rate + sRate) / 100) : amount;
  const vatAmount = r2(base * rate / 100);
  const sAmount = r2(base * sRate / 100);
  const b = r2(base);
  return {
    status: 200,
    body: {
      base: b, vat_rate: rate, vat_amount: vatAmount,
      equivalence_surcharge: re, surcharge_rate: sRate, surcharge_amount: sAmount,
      total: includes ? r2(amount) : r2(b + vatAmount + sAmount),
      includes_vat: includes, note: NOTE
    }
  };
}

/* ── Retención de IRPF ── */
const WITHHOLDING_TYPES = {
  professional: 15,       // actividades profesionales (general)
  new_professional: 7,    // el año de inicio y los dos siguientes
  rental: 19,             // alquiler de locales
  agricultural: 2,        // actividades agrícolas y ganaderas (general)
  modules: 1              // actividades en módulos (art. 95.6 RIRPF)
};

function withholding(input = {}) {
  const base = num(input.base);
  if (!Number.isFinite(base) || base < 0) return bad('"base" debe ser un número mayor o igual que 0.');
  let rate;
  if (input.rate !== undefined && input.rate !== '') {
    rate = num(input.rate);
    if (!Number.isFinite(rate) || rate < 0 || rate > 47) return bad('"rate" debe estar entre 0 y 47.');
  } else {
    const type = input.type || 'professional';
    if (!(type in WITHHOLDING_TYPES)) return bad(`"type" debe ser uno de: ${Object.keys(WITHHOLDING_TYPES).join(', ')}.`);
    rate = WITHHOLDING_TYPES[type];
  }
  const vatRate = input.vat_rate === undefined || input.vat_rate === '' ? 21 : num(input.vat_rate);
  if (!VAT_RATES.includes(vatRate)) return bad(`"vat_rate" debe ser uno de: ${VAT_RATES.join(', ')}.`);
  const w = r2(base * rate / 100);
  const v = r2(base * vatRate / 100);
  return {
    status: 200,
    body: {
      base: r2(base), withholding_rate: rate, withholding_amount: w,
      vat_rate: vatRate, vat_amount: v,
      total_invoice: r2(base + v - w),
      type: input.rate !== undefined && input.rate !== '' ? 'custom' : (input.type || 'professional'),
      note: NOTE
    }
  };
}

/* ── Modelo 130 ── */
function quarterArgs(input) {
  const cq = quarterOf(iso(new Date()));
  const year = input.year === undefined || input.year === '' ? cq.year : Number(input.year);
  const quarter = input.quarter === undefined || input.quarter === '' ? cq.quarter : Number(input.quarter);
  if (!Number.isInteger(year) || year < 2000 || year > 2100) return { error: bad('"year" no es válido.') };
  if (![1, 2, 3, 4].includes(quarter)) return { error: bad('"quarter" debe ser 1, 2, 3 o 4.') };
  return { year, quarter };
}

function model130(license, input = {}) {
  const q = quarterArgs(input);
  if (q.error) return q.error;
  const { year, quarter } = q;
  if (input.source === 'ledger') {
    const r = irpf130ForQuarter(F.allEntries(license.id), year, quarter);
    return { status: 200, body: { year, quarter, source: 'ledger', due_date: quarterlyDueDate(year, quarter), ...r, note: NOTE } };
  }
  const income = num(input.income), expenses = num(input.expenses);
  const prev = input.previous_payments === undefined ? 0 : num(input.previous_payments);
  const wh = input.withholdings === undefined ? 0 : num(input.withholdings);
  if (![income, expenses, prev, wh].every(Number.isFinite)) {
    return bad('Envía "income" y "expenses" (acumulados del 1 de enero al fin del trimestre) y, si hay, "previous_payments" y "withholdings". O usa "source": "ledger" para calcularlo con tu libro de Nokfi.');
  }
  if ([income, expenses, prev, wh].some(n => n < 0)) return bad('Las cifras no pueden ser negativas.');
  const net = income - expenses;
  const gross = Math.max(0, net) * 0.2;
  return {
    status: 200,
    body: {
      year, quarter, source: 'input', due_date: quarterlyDueDate(year, quarter),
      income: r2(income), expense: r2(expenses), net: r2(net), gross: r2(gross),
      previous_payments: r2(prev), withholdings: r2(wh), result: r2(Math.max(0, gross - prev - wh)),
      note: NOTE
    }
  };
}

/* ── Resumen del trimestre (desde el libro) ── */
function quarter(license, input = {}) {
  const q = quarterArgs(input);
  if (q.error) return q.error;
  const profile = getCompanyProfile(license.id) || {};
  const entries = F.allEntries(license.id);
  return {
    status: 200,
    body: {
      legal_form: profile.legal_form || null,
      entries_in_ledger: entries.length,
      ...taxSummary(entries, { ...q, legalForm: profile.legal_form, reserve: F.getReserve(license.id, q.year, q.quarter) }),
      note: NOTE
    }
  };
}

/* ── Calendario fiscal ── */
function calendar(license, input = {}) {
  const profile = getCompanyProfile(license.id) || {};
  const lf = input.legal_form || profile.legal_form || undefined;
  if (lf && !['autonomo', 'sociedad'].includes(lf)) return bad('"legal_form" debe ser autonomo o sociedad.');
  const note = 'Plazos orientativos (si el último día cae en fin de semana pasa al lunes; no se cuentan festivos). La domiciliación suele cerrar 5 días antes.';
  if (input.year !== undefined && input.year !== '') {
    const year = Number(input.year);
    if (!Number.isInteger(year) || year < 2020 || year > 2100) return bad('"year" no es válido.');
    return { status: 200, body: { legal_form: lf || null, year, deadlines: deadlinesFor(year, lf), note } };
  }
  const limit = Math.min(Math.max(Number(input.limit) || 6, 1), 24);
  return { status: 200, body: { legal_form: lf || null, today: iso(new Date()), deadlines: upcoming(lf, iso(new Date()), limit), note } };
}

module.exports = { taxId, vat, withholding, model130, quarter, calendar, num, WITHHOLDING_TYPES, VAT_RATES, SURCHARGE };
