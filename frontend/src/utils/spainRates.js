/**
 * Datos fiscales y de cotización de España para las calculadoras (sesión 10).
 * Todo orientativo: revisar cada enero cuando salga la orden de cotización.
 */

// IVA (península y Baleares).
export const VAT_RATES = [21, 10, 4, 0];

// Retenciones de IRPF habituales en factura.
export const WITHHOLDINGS = [15, 7, 19, 1, 0];

/**
 * Autónomos: cotización por ingresos reales (RDL 13/2022). Cuota mínima por
 * tramo de rendimiento neto mensual. Tabla de 2025; si en 2026 cambia, se
 * actualiza aquí y en AUTONOMO_TABLE_YEAR.
 * [hasta (rendimiento neto €/mes), base mínima €/mes, cuota €/mes]
 */
export const AUTONOMO_TABLE_YEAR = 2025;
export const AUTONOMO_TABLE = [
  [670, 653.59, 200], [900, 718.95, 220], [1166.70, 849.67, 260],
  [1300, 950.98, 280], [1500, 960.78, 294], [1700, 960.78, 294], [1850, 1143.79, 350],
  [2030, 1209.15, 370], [2330, 1274.51, 390], [2760, 1356.21, 415], [3190, 1437.91, 440],
  [3620, 1519.61, 465], [4050, 1601.31, 490], [6000, 1732.03, 530], [Infinity, 1928.10, 590]
];
export const AUTONOMO_FLAT_RATE = 80;
export const AUTONOMO_GENERIC_EXPENSES = 0.07; // 7 % de gastos genéricos (3 % si es societario)

/**
 * Empresa: cotización a cargo del empleador (régimen general), en %.
 * MEI 2026: 0,75 % empresa (RDL 2/2023). Base máxima: la de 2025
 * (4.909,50 €/mes) hasta que se confirme la de 2026.
 */
export const EMPLOYER_RATES_YEAR = 2026;
export const EMPLOYER_RATES = { cc: 23.6, unemployment_indef: 5.5, unemployment_temp: 6.7, fogasa: 0.2, fp: 0.6, mei: 0.75 };
export const BASE_MAX_MONTHLY = 4909.5;
export const WORK_HOURS_YEAR = 1760;

export function autonomoQuota(netMonthly) {
  const i = AUTONOMO_TABLE.findIndex(([upTo]) => netMonthly <= upTo);
  const [, base, quota] = AUTONOMO_TABLE[i];
  return { bracket: i + 1, base, quota };
}
