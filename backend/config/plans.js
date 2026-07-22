/**
 * config/plans.js — Fuente única de verdad para el modelo de suscripción.
 *
 * Antes de crear este fichero, los precios/cuotas/planes válidos estaban
 * duplicados en backend/routes/payments.js, backend/routes/webhooks.js,
 * backend/routes/admin.js y backend/db/database.js (4 copias), lo que era un
 * pie de fábrica para drift: cambiar un precio en un sitio y olvidar otro.
 * Centralizar aquí elimina esa clase de bug.
 *
 * Precios en céntimos de EUR (Stripe usa la unidad menor) y en EUR (para el
 * cálculo de MRR en getStats() y para mostrar). Cuota = análisis IA/día por
 * plan (anti-sharing delegado del viejo device-fingerprint, tiered por plan).
 *
 * Trial: el plan mini lleva una prueba gratuita de TRIAL_DAYS días con tarjeta
 * obligatoria al aperturar (Stripe bloquea reusar la misma tarjeta para un
 * segundo trial → antifarmeo). pro/max pagan inmediatamente, sin trial.
 *
 * Es CJS (lo importa el backend). El frontend no puede importar esto (Vite
 * ESM en otra build) → el frontend espeja TRIAL en una constante mínima local
 * en Pricing.jsx. Esa duplicación puntual es idiomática y aceptable.
 */

'use strict';

const PLANS = {
  mini: { name: 'Mini', cents: 500,  eur: 5,  quota: 10 },   // 5€/mes · 10 análisis/día
  pro:  { name: 'Pro',  cents: 2000, eur: 20, quota: 50 },    // 20€/mes · 50 análisis/día
  max:  { name: 'Max',  cents: 5000, eur: 50, quota: 130 }    // 50€/mes · 130 análisis/día
};

const VALID_PLANS = Object.keys(PLANS);

/** Cuota diaria de análisis IA por plan — mapa plano para aiQuotaForPlan. */
const AI_QUOTAS = Object.fromEntries(VALID_PLANS.map(p => [p, PLANS[p].quota]));

/** Trial gratis (días) y a qué planes aplica. */
const TRIAL_DAYS = 14;
const TRIAL_PLANS = ['mini'];

/** Saneamiento de plan de entrada: el que llega o 'mini' (conservador). */
function coercePlan(plan) {
  return VALID_PLANS.includes(plan) ? plan : 'mini';
}

/** ¿El plan lleva trial de 14 días con tarjeta? */
function planHasTrial(plan) {
  return TRIAL_PLANS.includes(plan);
}

module.exports = {
  PLANS,
  VALID_PLANS,
  AI_QUOTAS,
  TRIAL_DAYS,
  TRIAL_PLANS,
  coercePlan,
  planHasTrial
};
