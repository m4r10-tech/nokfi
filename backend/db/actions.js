/**
 * db/actions.js — C2: seguimiento del plan de acción.
 *
 * Cada informe estructurado (F1) trae `action_plan`; al guardarlo se crean
 * aquí sus tareas, marcables y persistentes por licencia. El dashboard
 * muestra el progreso y las siguientes tareas pendientes.
 */

'use strict';

const { getDB } = require('./database');

function createActionsForAnalysis(license_id, analysis_id, plan) {
  const db = getDB();
  const insert = db.prepare(`
    INSERT INTO action_items (license_id, analysis_id, title, detail, timeframe, position)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  const tx = db.transaction((items) => {
    items.forEach((a, i) => insert.run(license_id, analysis_id, a.title, a.detail || '', a.timeframe || '', i));
  });
  tx((plan || []).slice(0, 10));
}

function listActionsForAnalysis(license_id, analysis_id) {
  return getDB().prepare(`
    SELECT id, title, detail, timeframe, done, done_at FROM action_items
    WHERE license_id = ? AND analysis_id = ? ORDER BY position, id
  `).all(license_id, analysis_id).map(r => ({ ...r, done: !!r.done }));
}

/** Pendientes primero (del informe más reciente), luego hechas recientes. */
function listActions(license_id, { limit = 100 } = {}) {
  return getDB().prepare(`
    SELECT a.id, a.analysis_id, a.title, a.detail, a.timeframe, a.done, a.done_at, a.created_at,
           an.title AS analysis_title
    FROM action_items a LEFT JOIN analyses an ON an.id = a.analysis_id
    WHERE a.license_id = ?
    ORDER BY a.done ASC, a.created_at DESC, a.position ASC, a.id ASC
    LIMIT ?
  `).all(license_id, limit).map(r => ({ ...r, done: !!r.done }));
}

function setActionDone(license_id, id, done) {
  const info = getDB().prepare(`
    UPDATE action_items SET done = ?, done_at = CASE WHEN ? THEN datetime('now') ELSE NULL END
    WHERE id = ? AND license_id = ?
  `).run(done ? 1 : 0, done ? 1 : 0, id, license_id);
  return info.changes > 0;
}

function actionStats(license_id) {
  const r = getDB().prepare(`
    SELECT COUNT(*) total, COALESCE(SUM(done), 0) done FROM action_items WHERE license_id = ?
  `).get(license_id);
  return { total: r.total, done: r.done, open: r.total - r.done };
}

module.exports = { createActionsForAnalysis, listActionsForAnalysis, listActions, setActionDone, actionStats };
