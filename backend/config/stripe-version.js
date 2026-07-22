/**
 * config/stripe-version.js — Versión de la API de Stripe fijada para todas las
 * llamadas que hace el backend (Checkout, Billing Portal, Subscriptions).
 *
 * trial_settings[end_behavior][type]=release (usado en el trial de 14 días del
 * plan mini) exige una API version >= 2024-04-10. Centralizarla aquí en vez de
 * dejarla como literal en cada fetch evita que un valor distinto en payments.js
 * vs webhooks.js provoque que `trial_end` o el end_behavior se lean con
 * semántica diferente entre la creación y la lectura de la suscripción.
 */
'use strict';

module.exports = '2024-04-10';
