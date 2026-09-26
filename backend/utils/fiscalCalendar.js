/**
 * utils/fiscalCalendar.js — C4: calendario fiscal de autónomos y pymes (España).
 *
 * Plazos de presentación del régimen general (AEAT). Reglas:
 *   - Trimestrales 303 (IVA), 130 (IRPF), 111 (retenciones) y 115 (alquileres):
 *     del 1 al 20 del mes siguiente al trimestre; el 4T hasta el 30 de enero
 *     (303/130) y el 20 de enero (111/115).
 *   - Si el último día cae en sábado o domingo, pasa al lunes siguiente.
 *     ⚠️ No se tienen en cuenta festivos: por eso la UI dice "orientativo" y
 *     remite a la sede de la AEAT. VERIFICAR LAS FECHAS CADA AÑO.
 *   - La domiciliación bancaria suele cerrar 5 días antes (se indica en la UI).
 *
 * `applies`: formas jurídicas a las que aplica (autonomo | sociedad).
 * `conditional`: solo si tienes trabajadores/profesionales (111, 190) o
 * alquilas un local (115, 180).
 */

'use strict';

function iso(d) { return d.toISOString().slice(0, 10); }

/** Último día del plazo con el corrimiento de fin de semana (UTC, sin festivos). */
function deadline(year, month, day) {
  const d = new Date(Date.UTC(year, month - 1, day));
  const wd = d.getUTCDay();
  if (wd === 6) d.setUTCDate(d.getUTCDate() + 2);
  else if (wd === 0) d.setUTCDate(d.getUTCDate() + 1);
  return iso(d);
}

function lastDayOfFebruary(year) {
  return new Date(Date.UTC(year, 2, 0)).getUTCDate();
}

/**
 * Plazos cuyo VENCIMIENTO cae en `year`.
 * @returns {Array<{key, date, models:string[], period, applies:string[], conditional:boolean, kind}>}
 */
function deadlinesForYear(year) {
  const prev = year - 1;
  const both = ['autonomo', 'sociedad'];
  const list = [
    { key: `${prev}-4T-111-115`, date: deadline(year, 1, 20), models: ['111', '115'], period: `4T ${prev}`, applies: both, conditional: true, kind: 'withholdings' },
    { key: `${prev}-4T-303-130`, date: deadline(year, 1, 30), models: ['303', '130'], period: `4T ${prev}`, applies: both, conditional: false, kind: 'quarterly' },
    { key: `${prev}-390`, date: deadline(year, 1, 30), models: ['390'], period: `${prev}`, applies: both, conditional: false, kind: 'vat_annual' },
    { key: `${prev}-190-180`, date: deadline(year, 1, 31), models: ['190', '180'], period: `${prev}`, applies: both, conditional: true, kind: 'withholdings_annual' },
    { key: `${prev}-347`, date: deadline(year, 2, lastDayOfFebruary(year)), models: ['347'], period: `${prev}`, applies: both, conditional: true, kind: 'third_parties' },
    { key: `${year}-1T`, date: deadline(year, 4, 20), models: ['303', '130', '111', '115'], period: `1T ${year}`, applies: both, conditional: false, kind: 'quarterly' },
    { key: `${year}-202-1P`, date: deadline(year, 4, 20), models: ['202'], period: `1P ${year}`, applies: ['sociedad'], conditional: false, kind: 'corporate_installment' },
    { key: `${prev}-100`, date: deadline(year, 6, 30), models: ['100'], period: `${prev}`, applies: ['autonomo'], conditional: false, kind: 'income_tax_annual' },
    { key: `${year}-2T`, date: deadline(year, 7, 20), models: ['303', '130', '111', '115'], period: `2T ${year}`, applies: both, conditional: false, kind: 'quarterly' },
    { key: `${prev}-200`, date: deadline(year, 7, 25), models: ['200'], period: `${prev}`, applies: ['sociedad'], conditional: false, kind: 'corporate_annual' },
    { key: `${year}-3T`, date: deadline(year, 10, 20), models: ['303', '130', '111', '115'], period: `3T ${year}`, applies: both, conditional: false, kind: 'quarterly' },
    { key: `${year}-202-2P`, date: deadline(year, 10, 20), models: ['202'], period: `2P ${year}`, applies: ['sociedad'], conditional: false, kind: 'corporate_installment' },
    { key: `${year}-202-3P`, date: deadline(year, 12, 20), models: ['202'], period: `3P ${year}`, applies: ['sociedad'], conditional: false, kind: 'corporate_installment' }
  ];
  return list.sort((a, b) => a.date.localeCompare(b.date));
}

/** Filtra por forma jurídica; el 130 solo aplica a autónomos (lo quita de los trimestrales de sociedades). */
function deadlinesFor(year, legalForm) {
  return deadlinesForYear(year)
    .filter(d => !legalForm || d.applies.includes(legalForm))
    .map(d => (legalForm === 'sociedad' ? { ...d, models: d.models.filter(m => m !== '130') } : d))
    .filter(d => d.models.length);
}

function daysBetween(fromIso, toIso) {
  return Math.round((Date.parse(toIso + 'T00:00:00Z') - Date.parse(fromIso + 'T00:00:00Z')) / 86400000);
}

/** Próximos plazos desde hoy (este año + el siguiente). */
function upcoming(legalForm, today = iso(new Date()), limit = 12) {
  const y = Number(today.slice(0, 4));
  return [...deadlinesFor(y, legalForm), ...deadlinesFor(y + 1, legalForm)]
    .map(d => ({ ...d, days_left: daysBetween(today, d.date) }))
    .filter(d => d.days_left >= 0)
    .slice(0, limit);
}

/** Fecha de pago del 303/130 de un trimestre (Q4 → 30 de enero del año siguiente). */
function quarterlyDueDate(year, quarter) {
  if (quarter === 4) return deadline(year + 1, 1, 30);
  return deadline(year, quarter * 3 + 1, 20);
}

module.exports = { deadlinesForYear, deadlinesFor, upcoming, quarterlyDueDate, deadline, daysBetween, iso };
