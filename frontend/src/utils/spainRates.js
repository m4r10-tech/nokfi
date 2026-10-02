/**
 * Datos fiscales y de cotización de España para las calculadoras (sesión 10).
 * Todo orientativo: revisar cada enero cuando salga la orden de cotización.
 */

// IVA (península y Baleares).
export const VAT_RATES = [21, 10, 4, 0];

// Retenciones de IRPF habituales en factura.
export const WITHHOLDINGS = [15, 7, 19, 1, 0];

/**
 * Autónomos: cotización por ingresos reales (RDL 13/2022). Bases mínimas por
 * tramo de rendimiento neto mensual de la Orden PJC/297/2026 (BOE 31-3-2026,
 * art. 18): las mismas de 2025 (RDL 3/2026). El tipo sube al 31,50 % (28,30 CC
 * + 1,30 AT/EP + 0,90 cese + 0,10 FP + 0,90 MEI): cuota = base × tipo.
 * Revisar cada año cuando salga la orden de cotización.
 * [hasta (rendimiento neto €/mes), base mínima €/mes]
 */
export const AUTONOMO_TABLE_YEAR = 2026;
export const AUTONOMO_RATE = 31.5;
const AUTONOMO_BASES = [
  [670, 653.59], [900, 718.95], [1166.70, 849.67],
  [1300, 950.98], [1500, 960.78], [1700, 960.78], [1850, 1143.79],
  [2030, 1209.15], [2330, 1274.51], [2760, 1356.21], [3190, 1437.91],
  [3620, 1519.61], [4050, 1601.31], [6000, 1732.03], [Infinity, 1928.10]
];
/** [hasta, base mínima, cuota mínima] */
export const AUTONOMO_TABLE = AUTONOMO_BASES.map(([upTo, base]) => [upTo, base, Math.round(base * AUTONOMO_RATE) / 100]);
export const AUTONOMO_FLAT_RATE = 80;
export const AUTONOMO_GENERIC_EXPENSES = 0.07; // 7 % de gastos genéricos (3 % si es societario)

/**
 * Empresa: cotización a cargo del empleador (régimen general), en %.
 * MEI 2026: 0,75 % empresa (RDL 2/2023). Base máxima 2026: 5.101,20 €/mes
 * (Orden PJC/297/2026, art. 2).
 */
export const EMPLOYER_RATES_YEAR = 2026;
export const EMPLOYER_RATES = { cc: 23.6, unemployment_indef: 5.5, unemployment_temp: 6.7, fogasa: 0.2, fp: 0.6, mei: 0.75 };
export const BASE_MAX_MONTHLY = 5101.2;
export const WORK_HOURS_YEAR = 1760;

export function autonomoQuota(netMonthly) {
  const i = AUTONOMO_TABLE.findIndex(([upTo]) => netMonthly <= upTo);
  const [, base, quota] = AUTONOMO_TABLE[i];
  return { bracket: i + 1, base, quota };
}
