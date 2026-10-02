import { useState, useEffect } from 'react';
import { paymentsApi } from '../middleware/api';

/**
 * usePlans — catálogo público de planes desde GET /api/payments/plans.
 *
 * Fuente ÚNICA del catálogo para el frontend (anti-drift): tanto la landing
 * (Landing.jsx) como la página de precios (Pricing.jsx) consumen este hook, así
 * que lo que muestra la web == lo que cobra Stripe (el backend lee los precios
 * del .env). Nunca hardcodear precios en el frontend.
 *
 * Devuelve:
 *   - plans: array mapeado a { id, name, price:String, highlight, trial }
 *     vacío hasta que llega la respuesta (o si falla).
 *   - failed: true si la carga no fue OK (la UI decide cómo mostrarlo —
 *     deshabilitar botones, mostrar un badge de error).
 *   - notLoaded: true solo durante la primera petición en curso (para mostrar
 *     un "cargando planes…" sin flashear el estado de error).
 *
 * No lanza: si la red cae, falla a `failed:true` y la app degrada con elegancia.
 */
/**
 * Sesión 12 (SEO): el prerender pide el catálogo a la API, lo pasa con
 * setPrerenderPlans() y lo deja en el HTML (<script id="nokfi-plans">).
 * Así la página prerenderizada lleva los precios y, al hidratar, el navegador
 * arranca con los mismos datos; después se piden igualmente a la API.
 */
let prerenderPlans = null;
export function setPrerenderPlans(raw) { prerenderPlans = raw; }

const toPlans = (raw) => raw.map(p => ({
  id: p.id,
  name: p.name,
  price: String(p.price_eur),
  highlight: p.id === 'pro',
  trial: !!p.trial
}));

function initialPlans() {
  if (prerenderPlans) return toPlans(prerenderPlans);
  if (typeof document === 'undefined') return null;
  try {
    const raw = JSON.parse(document.getElementById('nokfi-plans')?.textContent || 'null');
    return Array.isArray(raw) && raw.length ? toPlans(raw) : null;
  } catch { return null; }
}

export function usePlans() {
  const [plans, setPlans] = useState(() => initialPlans() || []);
  const [failed, setFailed] = useState(false);
  const [notLoaded, setNotLoaded] = useState(() => !plans.length);

  useEffect(() => {
    let cancelled = false;
    paymentsApi.getPlans().then(({ ok, data }) => {
      if (cancelled) return;
      if (ok && Array.isArray(data.plans) && data.plans.length) {
        setPlans(toPlans(data.plans));
        setFailed(false);
      } else {
        setFailed(true);
      }
      setNotLoaded(false);
    }).catch(() => {
      if (cancelled) return;
      setFailed(true);
      setNotLoaded(false);
    });
    return () => { cancelled = true; };
  }, []);

  return { plans, failed, notLoaded };
}
