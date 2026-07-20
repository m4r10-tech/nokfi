import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, Check } from 'lucide-react';
import { paymentsApi } from '../middleware/api';
import { useLang } from '../context/LangContext';
import Logo from '../components/Logo';

/**
 * Página pública de precios — flujo de ALTA de una suscripción (Fase 3).
 * El usuario entra su email, elige uno de los 3 planes y se le redirige al
 * Checkout de Stripe (modo subscription). Tras pagar, Stripe lo devuelve a
 * /reveal, donde ve su clave recién creada (el webhook la genera).
 */

const PLANS = [
  { id: 'mini', name: 'Mini', price: '10', highlight: false },
  { id: 'pro',  name: 'Pro',  price: '25', highlight: true },
  { id: 'max',  name: 'Max',  price: '40', highlight: false }
];

export default function Pricing() {
  const { t } = useLang();
  const [email, setEmail] = useState('');
  const [loadingPlan, setLoadingPlan] = useState(null); // plan id en curso, o null
  const [error, setError] = useState(null);

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

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 w-full max-w-2xl">
        {PLANS.map(plan => (
          <div key={plan.id} className="rounded-xl p-5 flex flex-col gap-3"
               style={{
                 background: 'var(--surface-1)',
                 border: plan.highlight ? '0.5px solid var(--accent)' : '0.5px solid var(--border)'
               }}>
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{plan.name}</span>
              {plan.highlight &&
                <span className="text-[10px] font-medium uppercase tracking-wide rounded-full px-2 py-0.5"
                      style={{ background: 'var(--accent)', color: '#fff' }}>·</span>}
            </div>
            <div className="flex items-baseline gap-1">
              <span className="text-3xl font-bold" style={{ color: 'var(--text-primary)' }}>€{plan.price}</span>
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{t('pricing.monthSuffix')}</span>
            </div>
            <ul className="flex flex-col gap-1.5 text-sm" style={{ color: 'var(--text-secondary)' }}>
              {t(`pricing.features.${plan.id}`).map((f, i) => (
                <li key={i} className="flex items-start gap-2">
                  <Check size={14} className="mt-0.5 shrink-0" style={{ color: 'var(--positive)' }} />
                  <span>{f}</span>
                </li>
              ))}
            </ul>
            <button onClick={() => subscribe(plan.id)} disabled={loadingPlan !== null}
              className="mt-1 rounded-lg py-2 text-sm font-medium flex items-center justify-center gap-2 disabled:opacity-60 transition-opacity"
              style={{ background: plan.highlight ? 'var(--accent)' : 'var(--surface-2)', color: plan.highlight ? '#fff' : 'var(--text-primary)', border: plan.highlight ? 'none' : '0.5px solid var(--border-strong)' }}>
              {loadingPlan === plan.id && <Loader2 size={15} className="animate-spin" />}
              {t('pricing.cta')}
            </button>
          </div>
        ))}
      </div>

      {error && <p className="mt-5 text-sm rounded-lg px-3 py-2 max-w-2xl w-full text-center" style={{ background: 'var(--negative-soft)', color: 'var(--negative)' }}>{error}</p>}

      <Link to="/login" className="mt-8 text-sm hover:underline" style={{ color: 'var(--text-secondary)' }}>
        {t('pricing.goLogin')} →
      </Link>
    </div>
  );
}
