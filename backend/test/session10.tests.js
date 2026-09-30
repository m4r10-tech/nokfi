/**
 * test/session10.tests.js — sesión 10 (frontend P2): lo que cambia en el
 * backend para el pulido. Cuestionario con "A medias" y "No aplica" e
 * historial con archivo, periodo y resultado clave.
 */

'use strict';

module.exports = async function session10Tests({ check, getDB }) {
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

  const { monthRange } = require('../utils/tableStats');
  check('S10 historial: monthRange detecta los meses de la columna de fecha',
    () => {
      const r = monthRange([{ fecha: '2026-07-03', importe: 10 }, { fecha: '15/09/2026', importe: 5 }, { fecha: '2026-08-01', importe: 1 }]);
      return r && r.from === '2026-07' && r.to === '2026-09' && monthRange([{ a: 1 }]) === null;
    });

  const P = require('../services/ai/prompts');
  check('S10 historial: sanitizeFiles guarda el periodo de cada archivo',
    () => P.sanitizeFiles([{ name: 'caja-3T.csv', rows: [{ fecha: '2026-07-01', saldo: 1 }, { fecha: '2026-09-30', saldo: 2 }] }])[0].period?.to === '2026-09');

  const { listAnalyses, createAnalysis } = require('../db/database');
  check('S10 historial: la lista trae módulo, archivos, periodo, nota y primera cifra clave',
    () => {
      const lid = getDB().prepare('SELECT id FROM licenses ORDER BY id LIMIT 1').get().id;
      const id = createAnalysis({
        license_id: lid, kind: 'excel', title: 'Caja', prompt_chars: 1,
        result_json: { summary: 'x', key_figures: [{ label: 'Saldo final', value: '1.200 €' }] },
        meta: { module: 'caja', files: ['caja-3T.csv'], period: { from: '2026-07', to: '2026-09' } }
      });
      const row = listAnalyses(lid).find(a => a.id === id);
      const s = JSON.parse(row.summary_json), k = JSON.parse(row.key_figure_json);
      return s.module === 'caja' && s.files[0] === 'caja-3T.csv' && s.period.to === '2026-09' && k.value === '1.200 €';
    });

  const { absoluteLinks } = require('../services/ai/financeContext');
  check('S10 API: los link de informes y acciones salen absolutos (y sin tocar el original)',
    () => {
      const src = { report: { priorities: [{ title: 'a', link: '/app/finanzas/cobros' }], action_plan: [{ step: 'b', link: '' }] }, actions: [{ link: '/app/finanzas/impuestos' }] };
      const out = absoluteLinks(src);
      return /^https?:\/\/.+\/app\/finanzas\/cobros$/.test(out.report.priorities[0].link) && out.report.action_plan[0].link === ''
        && /\/app\/finanzas\/impuestos$/.test(out.actions[0].link) && out.actions[0].link.startsWith('http')
        && src.report.priorities[0].link === '/app/finanzas/cobros';
    });
};
