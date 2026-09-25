import { useState, useEffect, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Loader2, Lock, Mail, ArrowRight } from 'lucide-react';
import { paymentsApi } from '../middleware/api';
import { apiErrorMessage } from '../middleware/errors';
import { useLang } from '../context/LangContext';
import PlanCards from '../components/PlanCards';
import FormField from '../components/FormField';
import { FormMessage } from '../components/AuthShell';
import { PublicHeader, PublicFooter } from '../components/PublicChrome';
import { useShake } from '../hooks/useShake';
import { usePlans } from '../hooks/usePlans';
import { usePageMeta } from '../hooks/usePageMeta';
import { localeOf } from '../utils/dates';
import { EMAIL_REGEX } from '../utils/license';

/**
 * Página pública de precios — flujo de ALTA de una suscripción (Fase 3).
 *
 * Sesión 3 (Tanda P): el orden era al revés (email ANTES de ver los planes).
 * Ahora: 1) el usuario elige plan → 2) aparece el paso de email con el
 * resumen del plan → 3) Checkout de Stripe (modo subscription). Tras pagar,
 * Stripe lo devuelve a /reveal, donde ve su clave (el webhook la genera).
 * `?plan=<id>` (desde la home pública) preselecciona el plan.
 *
 * Los precios NO se hardcodean: vienen de GET /api/payments/plans (usePlans),
 * que los lee del .env del backend (PLAN_PRICE_*_EUR) → SIEMPRE mostramos lo
 * que Stripe cobra. Si el catálogo no carga, los botones se deshabilitan.
 * La llamada de pago es EXACTAMENTE la de antes: stripeCheckout(email, planId).
 */
export default function Pricing() {
  const { t, lang } = useLang();
  const [searchParams] = useSearchParams();
  const [selectedId, setSelectedId] = useState(null);
  const [email, setEmail] = useState('');
  const [loadingPlan, setLoadingPlan] = useState(null); // plan id en curso, o null
  const [error, setError] = useState(null); // { msg, field? }
  const { plans, failed, notLoaded } = usePlans(); // catálogo desde /plans (anti-drift)
  const checkoutRef = useRef(null);
  const emailRef = useRef(null);
  const [formRef, shake] = useShake();
  usePageMeta(t('meta.pricingTitle'), t('meta.pricingDesc'));

  const selected = plans.find(p => p.id === selectedId) || null;


  // Volver desde Stripe con "atrás" (bfcache) restauraría el spinner activo.
  useEffect(() => {
    const onShow = (e) => { if (e.persisted) setLoadingPlan(null); };
    window.addEventListener('pageshow', onShow);
    return () => window.removeEventListener('pageshow', onShow);
  }, []);

  const choose = (planId) => {
    setSelectedId(planId);
    setError(null);
    // Espera al render del panel de checkout antes de desplazar/enfocar.
    requestAnimationFrame(() => {
      checkoutRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setTimeout(() => emailRef.current?.focus({ preventScroll: true }), 350);
    });
  };

  // Preselección desde ?plan= (solo si el plan existe en el catálogo real),
  // una sola vez: lleva directamente al paso del email.
  const preselected = useRef(false);
  useEffect(() => {
    const wanted = searchParams.get('plan');
    if (!preselected.current && wanted && plans.some(p => p.id === wanted)) {
      preselected.current = true;
      choose(wanted);
    }
  }, [plans, searchParams]); // eslint-disable-line react-hooks/exhaustive-deps

  const subscribe = async (e) => {
    e.preventDefault();
    if (!selected || loadingPlan) return;
    setError(null);
    const trimmed = email.trim();
    if (!trimmed || !EMAIL_REGEX.test(trimmed)) {
      setError({ msg: t('pricing.invalidEmail'), field: 'email' });
      shake();
      emailRef.current?.focus();
      return;
    }
    setLoadingPlan(selected.id);
    const res = await paymentsApi.stripeCheckout(trimmed, selected.id);
    if (res.ok && res.data.checkout_url) {
      // El spinner se mantiene hasta que el navegador sale hacia Stripe
      // (evita un segundo clic que crearía otra sesión de checkout).
      window.location.href = res.data.checkout_url;
      return;
    }
    setLoadingPlan(null);
    shake();
    if (res.data.error === 'stripe_not_configured') setError({ msg: t('pricing.checkoutError') });
    else if (res.data.error === 'invalid_email') setError({ msg: t('pricing.invalidEmail'), field: 'email' });
    else setError({ msg: apiErrorMessage(t, res, 'pricing.checkoutError') });
  };

  const price = selected
    ? Number(selected.price).toLocaleString(localeOf(lang), { style: 'currency', currency: 'EUR', minimumFractionDigits: Number.isInteger(Number(selected.price)) ? 0 : 2 })
    : '';

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--bg-base)' }}>
      <PublicHeader />

      <main className="flex-1 w-full max-w-6xl mx-auto px-4 pt-8 md:pt-14 pb-16 flex flex-col items-center">
        <div className="text-center mb-10 md:mb-12 anim-enter">
          <h1 className="text-3xl md:text-4xl font-semibold tracking-tight" style={{ color: 'var(--text-primary)' }}>{t('pricing.title')}</h1>
          <p className="text-base mt-3 max-w-lg mx-auto" style={{ color: 'var(--text-secondary)' }}>{t('pricing.subtitle')}</p>
        </div>

        <PlanCards plans={plans} notLoaded={notLoaded} failed={failed} selectedId={selectedId}
          ctaLabel={t('pricing.choose')} onChoose={choose} loadingId={loadingPlan} />

        {/* Paso 2 — email + ir a Stripe. Solo aparece con un plan elegido. */}
        {selected && (
          <section ref={checkoutRef} className="w-full max-w-md mt-10 scroll-mt-24" aria-labelledby="checkout-title">
            <form ref={formRef} onSubmit={subscribe} noValidate className="card anim-enter p-5 sm:p-6 flex flex-col gap-4"
              style={{ borderColor: 'var(--border-strong)' }}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>{t('pricing.step2')}</p>
                  <h2 id="checkout-title" className="text-lg font-semibold mt-1" style={{ color: 'var(--text-primary)' }}>
                    {selected.name} · <span className="tabular">{price}</span><span className="text-sm font-normal" style={{ color: 'var(--text-muted)' }}>{t('pricing.monthSuffix')}</span>
                  </h2>
                  <p className="text-sm mt-1" style={{ color: selected.trial ? 'var(--positive)' : 'var(--text-secondary)' }}>
                    {selected.trial ? t('pricing.trialToday') : t('pricing.billedMonthly')}
                  </p>
                </div>
              </div>

              <FormField ref={emailRef} id="pricing-email" label={t('pricing.emailLabel')} icon={Mail} type="email"
                inputMode="email" autoComplete="email" autoCapitalize="none" spellCheck={false}
                placeholder={t('login.emailPlaceholder')} value={email} onChange={(e) => setEmail(e.target.value)}
                invalid={error?.field === 'email'} />
              <p className="text-xs -mt-2" style={{ color: 'var(--text-muted)' }}>{t('pricing.emailHint')}</p>

              {error && <FormMessage>{error.msg}</FormMessage>}

              <button type="submit" disabled={loadingPlan != null} className="btn btn-primary w-full">
                {loadingPlan ? <Loader2 size={16} className="animate-spin" /> : <Lock size={15} />}
                {t('pricing.continueToPayment')}
                {!loadingPlan && <ArrowRight size={15} />}
              </button>
              <p className="text-xs text-center flex items-center justify-center gap-1.5" style={{ color: 'var(--text-muted)' }}>
                {t('pricing.stripeTrust')}
              </p>
            </form>
          </section>
        )}

        <div className="mt-12 flex flex-col sm:flex-row items-center gap-3 sm:gap-6 text-sm">
          <Link to="/home#faq" className="hover:underline" style={{ color: 'var(--text-secondary)' }}>{t('pricing.faqLink')} →</Link>
          <Link to="/login" className="hover:underline" style={{ color: 'var(--text-secondary)' }}>{t('pricing.goLogin')} →</Link>
        </div>
      </main>

      <PublicFooter />
    </div>
  );
}
