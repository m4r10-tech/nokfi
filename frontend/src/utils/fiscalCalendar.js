/**
 * Calendario fiscal (copia en ESM de backend/utils/fiscalCalendar.js) para la
 * página pública /calendario-fiscal-<año> (sesión 12), que no tiene sesión y
 * no puede llamar a /api/finance/calendar. `npm run check:seo` comprueba que
 * las dos copias dan las mismas fechas: si cambias una, cambia la otra.
 * Régimen general; si el plazo cae en fin de semana pasa al lunes; sin festivos.
 */

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
export function deadlinesForYear(year) {
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
export function deadlinesFor(year, legalForm) {
  return deadlinesForYear(year)
    .filter(d => !legalForm || d.applies.includes(legalForm))
    .map(d => (legalForm === 'sociedad' ? { ...d, models: d.models.filter(m => m !== '130') } : d))
    .filter(d => d.models.length);
}
