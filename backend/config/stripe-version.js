/**
 * config/stripe-version.js — Versión de la API de Stripe fijada para todas las
 * llamadas que hace el backend (Checkout, Billing Portal, Subscriptions).
 *
 * El trial de 14 días del plan mini se crea con subscription_data[trial_period_days]
 * (Checkout Sessions) y luego se lee sub.trial_end en webhooks.js (Subscriptions
 * API). Centralizar la versión aquí evita que un valor distinto en payments.js
 * vs webhooks.js haga que `trial_end` se lea con semántica diferente entre la
 * creación y la lectura de la suscripción.
 *
 * NOTA: Checkout Sessions NO admite subscription_data[trial_settings][end_behavior]
 * (ese campo es de la API de Subscriptions). Mandarlo en una Checkout Session da
 * "unknown parameter" — ver payments.js. El comportamiento por defecto al acabar
 * un trial de Checkout es empezar a cobrar (= el "release" que queremos).
 */
'use strict';

module.exports = '2024-04-10';
