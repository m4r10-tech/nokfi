/**
 * services/testMode.js — sesión 9 (API, Bloque 2): respuestas de ejemplo de
 * las claves de prueba (nk_test_…).
 *
 * Misma forma exacta que las respuestas reales (se pasan por los mismos
 * normalizadores y las facturas por los mismos checks deterministas), pero sin
 * llamar a la IA, sin gastar cuota y sin guardar nada en el historial.
 * La entrada SÍ se valida igual que en real, así que un error de formato sale
 * igual en prueba y en producción.
 */

'use strict';

const P = require('./ai/prompts');
const { checkInvoice } = require('./invoiceChecks');
const { computeHealth, cleanAnswers } = require('../utils/healthScore');

const REPORTS = {
  excel: {
    summary: 'Datos de ejemplo: las ventas del trimestre suman 42.380,00 € con un ticket medio de 186,70 €. Septiembre cae un 12 % respecto a agosto y el 38 % de la facturación depende de tres clientes.',
    key_figures: [
      { label: 'Ventas del periodo', value: '42.380,00 €', note: 'Suma de la columna importe' },
      { label: 'Ticket medio', value: '186,70 €', note: '227 operaciones' },
      { label: 'Peso de los 3 mayores clientes', value: '38 %', note: 'Concentración alta' }
    ],
    strengths: ['El margen por operación se mantiene estable en los tres meses.'],
    priorities: [
      { title: 'Reducir la dependencia de tres clientes', detail: 'Si uno de ellos se va, perderías cerca de 5.300 € al trimestre. Busca dos clientes medianos más.', severity: 'high', link: 'cobros' },
      { title: 'Revisar la caída de septiembre', detail: 'Septiembre factura 1.650 € menos que agosto; comprueba si es estacional.', severity: 'medium', link: 'prevision' }
    ],
    action_plan: [
      { title: 'Llamar a los dos clientes que no compran desde julio', detail: 'Suman 2.140 € del trimestre anterior.', timeframe: 'Esta semana', due_in_days: 7, link: 'cobros' },
      { title: 'Preparar una oferta para clientes medianos', detail: '', timeframe: 'Este mes', due_in_days: 30 }
    ],
    glossary: [{ term: 'Ticket medio', definition: 'Ventas del periodo divididas entre el número de operaciones.' }]
  },
  folder: {
    summary: 'Datos de ejemplo: la carpeta tiene 14 documentos: 9 facturas de proveedores, 3 presupuestos y 2 contratos. Dos facturas vencen en los próximos 10 días por 1.284,50 €.',
    key_figures: [
      { label: 'Facturas de proveedores', value: '9', note: '6.912,40 € en total' },
      { label: 'Vencen en 10 días', value: '1.284,50 €', note: '2 facturas' }
    ],
    strengths: ['Todos los contratos tienen fecha de renovación.'],
    priorities: [{ title: 'Pagar a tiempo las dos facturas que vencen', detail: 'Recambios Norte (842,10 €) vence el día 8 y Seguros Mar (442,40 €) el día 10.', severity: 'high', link: 'calendario' }],
    action_plan: [{ title: 'Programar los dos pagos', detail: '', timeframe: 'Antes del día 8', due_in_days: 5, link: 'calendario' }],
    glossary: []
  }
};
REPORTS.compare = {
  ...REPORTS.excel,
  summary: 'Datos de ejemplo: el periodo B factura 4.210,00 € más que el A (+11 %), pero el margen baja 2 puntos porque los recambios suben un 9 %.',
  key_figures: [
    { label: 'Diferencia de ventas', value: '+4.210,00 €', note: '+11 % sobre el periodo A' },
    { label: 'Margen bruto', value: '31 % → 29 %', note: '−2 puntos' }
  ]
};
REPORTS.cuestionario = {
  summary: 'Datos de ejemplo: el negocio tiene la parte fiscal al día, pero no separa la caja para impuestos y no sigue los cobros vencidos.',
  key_figures: [{ label: 'Por cobrar vencido', value: '3.120,00 €', note: '4 facturas' }],
  strengths: ['Presentas los trimestres en plazo.'],
  priorities: [{ title: 'Apartar cada mes para Hacienda', detail: 'Con tus datos, unos 640 € al mes cubrirían el 303 y el 130.', severity: 'high', link: 'impuestos' }],
  action_plan: [{ title: 'Abrir una cuenta solo para impuestos', detail: '', timeframe: 'Este mes', due_in_days: 30, link: 'impuestos' }],
  glossary: []
};

const DEFAULT_TITLES = { cuestionario: 'Diagnóstico de negocio', excel: 'Análisis Excel', compare: 'Comparación de periodos', folder: 'Resumen de carpeta' };

/** Informe de ejemplo con la misma forma que POST /api/v1/analyze. */
function sampleAnalysis({ type, data, title }) {
  const report = P.normalizeReport(REPORTS[type], { dropHealth: type === 'cuestionario' });
  const health = type === 'cuestionario' ? computeHealth(cleanAnswers(data?.answers)) : null;
  return {
    id: null,
    type: type === 'compare' ? 'excel' : type,
    title: P.clean(title, 120) || DEFAULT_TITLES[type],
    report,
    health,
    actions: [],
    test: true
  };
}

const INVOICES = [
  { issuer_name: 'Recambios Norte, S.L.', issuer_nif: 'B12345674', recipient_name: 'Taller García', recipient_nif: '12345678Z', invoice_number: 'RN-2026-0412', invoice_date: '2026-09-14', due_date: '2026-10-14', concept: 'Pastillas de freno y filtros', category: 'Recambios', base: 842.1, vat_rate: 21, vat_amount: 176.84, irpf_rate: 0, irpf_amount: 0, total: 1018.94 },
  { issuer_name: 'Asesoría Martín', issuer_nif: '00000023T', recipient_name: 'Taller García', recipient_nif: '12345678Z', invoice_number: '2026/118', invoice_date: '2026-09-30', due_date: '', concept: 'Asesoría fiscal septiembre', category: 'Servicios profesionales', base: 120, vat_rate: 21, vat_amount: 25.2, irpf_rate: 15, irpf_amount: 18, total: 127.2 },
  { issuer_name: 'Energía Sur', issuer_nif: 'A58818501', recipient_name: 'Taller García', recipient_nif: '12345678Z', invoice_number: 'ES-88213', invoice_date: '2026-09-02', due_date: '2026-09-20', concept: 'Electricidad agosto', category: 'Suministros', base: 210.5, vat_rate: 21, vat_amount: 44.21, irpf_rate: 0, irpf_amount: 0, total: 254.71 }
];

/** Facturas de ejemplo (una por documento legible), con los checks reales. */
function sampleInvoices(files) {
  return files.map((f, i) => {
    const inv = { file_name: f.name, is_invoice: true, ...INVOICES[i % INVOICES.length] };
    return { ...inv, ...checkInvoice(inv) };
  });
}

module.exports = { sampleAnalysis, sampleInvoices };
