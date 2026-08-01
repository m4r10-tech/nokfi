import { useState } from 'react';
import { Link } from 'react-router-dom';
import { paymentsApi } from '../middleware/api';
import { useLang } from '../context/LangContext';
import Logo from '../components/Logo';
import PlanCards from '../components/PlanCards';
import { usePlans } from '../hooks/usePlans';

/**
 * Página pública de precios — flujo de ALTA de una suscripción (Fase 3).
 * El usuario entra su email, elige uno de los 3 planes y se le redirige al
 * Checkout de Stripe (modo subscription). Tras pagar, Stripe lo devuelve a
 * /reveal, donde ve su clave recién creada (el webhook la genera).
 *
 * Los precios NO se hardcodean aquí: se fetchan de GET /api/payments/plans, que
 * los lee del .env del backend (PLAN_PRICE_*_EUR) → SIEMPRE mostramos lo que
 * Stripe cobra. Si el catálogo no carga, el botón se deshabilita (no dejamos
 * mostrar precios que no sabemos que se cobran).
 */

// highlight / orden vienen siempre del backend; el catálogo va en este orden.
export default function Pricing() {
  const { t } = useLang();
  const [email, setEmail] = useState('');
  const [loadingPlan, setLoadingPlan] = useState(null); // plan id en curso, o null
  const [error, setError] = useState(null);
  const { plans, failed, notLoaded } = usePlans(); // catálogo desde /plans (anti-drift)

  const subscribe = async (planId) => {
    setError(null);
    const trimmed = email.trim();
    if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setError(t('pricing.invalidEmail'));
      return;
    }
    setLoadingPlan(planId);
    const { ok, data } = await paymentsApi.stripeCheckout(trimmed, planId);
    setLoadingPlan(null);
    if (ok && data.checkout_url) {
      window.location.href = data.checkout_url;
    } else if (data.error === 'stripe_not_configured') {
      setError(t('pricing.checkoutError'));
    } else {
      setError(data.message || t('pricing.checkoutError'));
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-10" style={{ background: 'var(--bg-base)' }}>
      <div className="flex justify-center mb-8"><Logo size="lg" /></div>

      <h1 className="text-2xl font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>{t('pricing.title')}</h1>
      <p className="text-sm mb-8" style={{ color: 'var(--text-secondary)' }}>{t('pricing.subtitle')}</p>

      <div className="w-full max-w-2xl mb-6">
        <input type="email" placeholder={t('pricing.emailPlaceholder')} value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded-lg px-4 py-2.5 text-sm outline-none"
          style={{ background: 'var(--surface-2)', border: '0.5px solid var(--border-strong)', color: 'var(--text-primary)' }} />
      </div>

      <PlanCards plans={plans} notLoaded={notLoaded} failed={failed}
        ctaLabel={t('pricing.cta')} onChoose={subscribe} loadingId={loadingPlan} />

      {error && <p className="mt-5 text-sm rounded-lg px-3 py-2 max-w-2xl w-full text-center" style={{ background: 'var(--negative-soft)', color: 'var(--negative)' }}>{error}</p>}

      <Link to="/login" className="mt-8 text-sm hover:underline" style={{ color: 'var(--text-secondary)' }}>
        {t('pricing.goLogin')} →
      </Link>
    </div>
  );
}
