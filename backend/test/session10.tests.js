/**
 * test/session10.tests.js — sesión 10 (frontend P2): lo que cambia en el
 * backend para el pulido. Cuestionario con "A medias" y "No aplica".
 */

'use strict';

module.exports = async function session10Tests({ check }) {
  const { computeHealth, cleanAnswers, WEIGHTS, SECTIONS } = require('../utils/healthScore');
  const ids = Object.keys(WEIGHTS);
  const all = (v) => Object.fromEntries(ids.map(id => [id, v]));

  check('S10 cuestionario: cleanAnswers admite "partial" y "na" y descarta lo demás',
    () => {
      const a = cleanAnswers({ facturacion: 'partial', control_cobros: 'na', descuentos: 'quizá', dashboard: 1 });
      return a.facturacion === 'partial' && a.control_cobros === 'na' && !('descuentos' in a) && !('dashboard' in a);
    });
  check('S10 cuestionario: todo "A medias" → 50 y cada área pierde la mitad (partial: true)',
    () => {
      const h = computeHealth(all('partial'));
      return h.score === 50 && h.lost.length === 30 && h.lost.every(l => l.partial && l.section);
    });
  check('S10 cuestionario: "No aplica" no penaliza (todo Sí salvo pedidos en N/A → 100)',
    () => {
      const a = all(true);
      for (const id of SECTIONS.pedidos) a[id] = 'na';
      const h = computeHealth(a);
      return h.score === 100 && h.sections.pedidos === null && h.lost.length === 0 && h.na === 6;
    });
  check('S10 cuestionario: con N/A los puntos perdidos se reparten sobre el peso que aplica',
    () => {
      const a = all(true);
      for (const id of SECTIONS.pedidos) a[id] = 'na';
      a.flujo_caja = false;
      const h = computeHealth(a);
      const lostSum = h.lost.reduce((s, l) => s + l.points, 0);
      return h.lost.length === 1 && Math.abs(100 - h.score - lostSum) < 1;
    });
  check('S10 cuestionario: los Sí/No de siempre dan la misma nota que antes',
    () => computeHealth(all(true)).score === 100 && computeHealth(all(false)).score === 0);
};
