/**
 * config/plans.js — Fuente única de verdad para el modelo de suscripción.
 *
 * Antes de crear este fichero, los precios/cuotas/planes válidos estaban
 * duplicados en backend/routes/payments.js, backend/routes/webhooks.js,
 * backend/routes/admin.js y backend/db/database.js (4 copias) → drift. Aquí se
 * centralizan; el resto del backend lo importa todo de aquí.
 *
 * PRECIOS desde .env: la cantidad en EUR la define el operador en
 *   PLAN_PRICE_MINI_EUR / PLAN_PRICE_PRO_EUR / PLAN_PRICE_MAX_EUR
 * (defaults 5 / 20 / 50). Así, cambiar el precio y reiniciar el backend mueve a
 * la vez lo que cobra Stripe (unit_amount = cents) y lo que devuelve el endpoint
 * público GET /api/payments/plans → el frontend Pricing.jsx lo fetcha y siempre
 * muestra el precio que se cobra. ANTI-DRIFT: nunca hardcodear el precio en el
 * frontend; si lo haces, un cambio en el .env deja Stripe cobrando X y la página
 * diciendo Y. La cuota de IA (análisis/día) es decisión de producto y NO es
 * env-driven a propósito (anti-abuso/tiering); si hace falta moverla a .env,
 * replicar priceEurFromEnv.
 *
 * Stripe usa la unidad menor (céntimos): cents = Math.round(eur*100). El trial
 * de 14 días (solo mini) con tarjeta obligatoria se define abajo (TRIAL_*).
 *
 * Es CJS (lo importa el backend). El frontend NO puede importar esto (Vite ESM
 * en otra build) → por eso existe el endpoint /api/payments/plans, que el
 * frontend consulta en tiempo de ejecución para no espejar precios.
 */

'use strict';

// ── Precios por defecto (EUR) si el .env no los define ──
const DEFAULT_PRICES_EUR = { mini: 5, pro: 20, max: 50 };

/** Lee el precio en EUR de PLAN_PRICE_<PLAN>_EUR con saneamiento.
 *  Ausente o vacío o no-numérico o <= 0 → fallback (default). */
function priceEurFromEnv(plan, fallback) {
  const raw = process.env[`PLAN_PRICE_${plan.toUpperCase()}_EUR`];
  if (raw == null || raw === '') return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

// Cuota diaria de análisis IA por plan — decisión de producto, NO env-driven.
const PLAN_QUOTAS = { mini: 10, pro: 50, max: 130 };

const PLANS = {
  mini: { name: 'Mini', eur: priceEurFromEnv('mini', DEFAULT_PRICES_EUR.mini), quota: PLAN_QUOTAS.mini },
  pro:  { name: 'Pro',  eur: priceEurFromEnv('pro',  DEFAULT_PRICES_EUR.pro),  quota: PLAN_QUOTAS.pro },
  max:  { name: 'Max',  eur: priceEurFromEnv('max',  DEFAULT_PRICES_EUR.max),  quota: PLAN_QUOTAS.max }
};
// cents se deriva de eur (Stripe usa la unidad menor). Math.round evita los
// errores de coma flotante (19.99*100 → 1999, no 1998.9999…).
for (const p of Object.keys(PLANS)) PLANS[p].cents = Math.round(PLANS[p].eur * 100);

const VALID_PLANS = Object.keys(PLANS);

/** Cuota diaria de análisis IA por plan — mapa plano para aiQuotaForPlan. */
const AI_QUOTAS = Object.fromEntries(VALID_PLANS.map(p => [p, PLANS[p].quota]));

/**
 * Paquetes de créditos (S15b, U1; decidido 2026-11-05). Pago único en Stripe
 * (producto «Paquetes de créditos», un Price por paquete en
 * STRIPE_PRICE_PACK_<créditos>). Los créditos NO caducan, solo los compra quien
 * tiene un plan activo (Q1), se gastan cuando se acaban los créditos del día del
 * plan (Q2) y son un único saldo por cuenta, web y /api/v1 (Q3).
 * 1 crédito = 1 análisis o lectura de facturas con IA (lo que antes se llamaba
 * «análisis de IA»). El precio NO viene del .env: lo fija el Price de Stripe y
 * este catálogo solo lo muestra (mantener los dos iguales).
 */
const CREDIT_PACKS = {
  pack50:  { credits: 50,  eur: 5 },
  pack220: { credits: 220, eur: 20 },
  pack550: { credits: 550, eur: 50 }
};
for (const p of Object.keys(CREDIT_PACKS)) CREDIT_PACKS[p].cents = Math.round(CREDIT_PACKS[p].eur * 100);

/** Variable del .env con el Price de Stripe de un paquete (STRIPE_PRICE_PACK_50…). */
function packPriceEnv(pack) {
  return `STRIPE_PRICE_PACK_${CREDIT_PACKS[pack].credits}`;
}

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
  CREDIT_PACKS,
  packPriceEnv,
  coercePlan,
  planHasTrial
};
