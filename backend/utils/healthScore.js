/**
 * utils/healthScore.js — C1: nota de salud financiera 0-100 con REGLAS FIJAS.
 *
 * No la inventa la IA: sale de las 30 respuestas del Cuestionario. Cada área
 * pesa según su impacto en la supervivencia del negocio (caja, cobros,
 * impuestos y márgenes pesan más). La nota es el % de peso cubierto; el
 * desglose dice exactamente por qué se pierden puntos.
 *
 * Pesos: 5 = crítico (caja/cobros/Hacienda/margen), 3 = importante, 2 = mejora.
 *
 * Sesión 10: además de Sí/No, "A medias" ('partial', cuenta la mitad) y
 * "No aplica" ('na', sale del cálculo: no suma ni penaliza).
 */

'use strict';

const WEIGHTS = {
  // Ingresos y ventas
  facturacion: 5, control_cobros: 5, previsiones_ventas: 3, descuentos: 2, clientes_recurrentes: 2, margen_producto: 5,
  // Gastos y costes
  gastos_fijos: 5, gastos_variables: 3, presupuesto_mensual: 3, tickets_digitales: 2, gastos_personal: 3, revision_proveedores: 3,
  // Pedidos y stock
  gestion_pedidos: 2, control_stock: 3, productos_top: 2, productos_bajos: 3, punto_pedido: 2, devoluciones: 2,
  // Tesorería y finanzas
  conciliacion: 3, flujo_caja: 5, fondo_reserva: 5, financiacion: 3, impuestos: 5, rentabilidad: 5,
  // Reporting
  dashboard: 2, informe_mensual: 3, comparativa_periodos: 2, alertas_automaticas: 2, kpi_ventas: 2, gestor_externo: 3
};

const SECTIONS = {
  ingresos: ['facturacion', 'control_cobros', 'previsiones_ventas', 'descuentos', 'clientes_recurrentes', 'margen_producto'],
  gastos: ['gastos_fijos', 'gastos_variables', 'presupuesto_mensual', 'tickets_digitales', 'gastos_personal', 'revision_proveedores'],
  pedidos: ['gestion_pedidos', 'control_stock', 'productos_top', 'productos_bajos', 'punto_pedido', 'devoluciones'],
  tesoreria: ['conciliacion', 'flujo_caja', 'fondo_reserva', 'financiacion', 'impuestos', 'rentabilidad'],
  reporting: ['dashboard', 'informe_mensual', 'comparativa_periodos', 'alertas_automaticas', 'kpi_ventas', 'gestor_externo']
};

const TOTAL_WEIGHT = Object.values(WEIGHTS).reduce((a, b) => a + b, 0);

const VALUES = [true, false, 'partial', 'na'];
const CREDIT = (v) => (v === true ? 1 : v === 'partial' ? 0.5 : 0);

/** Filtra las respuestas a los 30 ids conocidos con un valor válido. */
function cleanAnswers(answers) {
  const out = {};
  if (!answers || typeof answers !== 'object') return out;
  for (const id of Object.keys(WEIGHTS)) {
    if (VALUES.includes(answers[id])) out[id] = answers[id];
  }
  return out;
}

/**
 * @returns {{ score:number, sections:Object<string,number|null>, lost:Array<{id,points,partial?,section}>, answered:number, na:number }}
 *   lost = áreas no gestionadas (o a medias) ordenadas por puntos perdidos.
 *   Una sección con todo "No aplica" vale null.
 */
function computeHealth(answers) {
  const a = cleanAnswers(answers);
  const applies = (id) => a[id] !== 'na';
  const total = Object.entries(WEIGHTS).reduce((s, [id, w]) => s + (applies(id) ? w : 0), 0) || 1;
  const sectionOf = (id) => Object.keys(SECTIONS).find(k => SECTIONS[k].includes(id));
  let got = 0;
  const lost = [];
  for (const [id, w] of Object.entries(WEIGHTS)) {
    if (!applies(id)) continue;
    const credit = CREDIT(a[id]);
    got += w * credit;
    if (credit < 1) {
      lost.push({ id, points: Math.round((w * (1 - credit) / total) * 1000) / 10, section: sectionOf(id), ...(credit > 0 ? { partial: true } : {}) });
    }
  }
  const sections = {};
  for (const [sec, ids] of Object.entries(SECTIONS)) {
    const live = ids.filter(applies);
    const secTotal = live.reduce((s, id) => s + WEIGHTS[id], 0);
    const ok = live.reduce((s, id) => s + WEIGHTS[id] * CREDIT(a[id]), 0);
    sections[sec] = secTotal ? Math.round((ok / secTotal) * 100) : null;
  }
  lost.sort((x, y) => y.points - x.points);
  return {
    score: Math.round((got / total) * 100),
    sections,
    lost,
    answered: Object.keys(a).length,
    na: Object.values(a).filter(v => v === 'na').length
  };
}

module.exports = { computeHealth, cleanAnswers, WEIGHTS, SECTIONS };
