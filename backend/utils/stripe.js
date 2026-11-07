/**
 * utils/stripe.js — llamada genérica a la API de Stripe (S15b).
 *
 * Misma versión fijada que el resto del backend (config/stripe-version.js),
 * cuerpo form-urlencoded y timeout de 30 s. Nunca lanza por un 4xx/5xx de
 * Stripe: devuelve { ok, status, data } para que quien llama decida (p. ej. un
 * 402 de tarjeta rechazada en un cambio de plan no es un error del servidor).
 * Sí lanza si no hay STRIPE_SECRET_KEY o si falla la red.
 */

'use strict';

const STRIPE_API_VERSION = require('../config/stripe-version');
const { fetchWithTimeout } = require('./http');

/** 429 de Stripe (límite de peticiones o lock_timeout: el objeto lo está
 *  modificando Stripe a la vez, p. ej. mientras cobra la factura): se reintenta
 *  dos veces con espera corta, como recomienda Stripe. Visto en modo test al
 *  parar una suscripción justo tras el invoice.payment_failed. */
async function stripeApi(method, path, params) {
  for (let attempt = 0; ; attempt++) {
    const r = await stripeApiOnce(method, path, params);
    if (r.status !== 429 || attempt >= 2) return r;
    await new Promise((ok) => setTimeout(ok, 700 * (attempt + 1) * (attempt + 1)));
  }
}

async function stripeApiOnce(method, path, params) {
  if (!process.env.STRIPE_SECRET_KEY) throw new Error('STRIPE_SECRET_KEY no configurado');
  const hasBody = params && method !== 'GET';
  const qs = params && method === 'GET' ? `?${new URLSearchParams(params)}` : '';
  const res = await fetchWithTimeout(`https://api.stripe.com/v1/${path}${qs}`, {
    method,
    headers: {
      'Authorization': `Bearer ${process.env.STRIPE_SECRET_KEY}`,
      'Stripe-Version': STRIPE_API_VERSION,
      ...(hasBody ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {})
    },
    body: hasBody ? new URLSearchParams(params).toString() : undefined
  }, 30000);
  let data = {};
  try { data = await res.json(); } catch { data = {}; }
  return { ok: res.ok, status: res.status, data };
}

/** ¿El error de Stripe es "ya no existe" (borrado o cancelado antes)? */
function isGone(r) {
  return r.status === 404 || r.data?.error?.code === 'resource_missing';
}

/** Fin del periodo de una suscripción en los dos formatos de la API
 *  (≤ 2024: sub.current_period_end; ≥ basil: items.data[].current_period_end). */
function subscriptionPeriodEnd(sub) {
  if (!sub) return undefined;
  if (sub.current_period_end) return sub.current_period_end;
  const ends = (sub.items?.data || []).map((i) => Number(i?.current_period_end)).filter(Number.isFinite);
  return ends.length ? Math.max(...ends) : undefined;
}

module.exports = { stripeApi, isGone, subscriptionPeriodEnd };
