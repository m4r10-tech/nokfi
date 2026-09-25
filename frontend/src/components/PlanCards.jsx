import { Loader2, Check, AlertCircle } from 'lucide-react';
import { useLang } from '../context/LangContext';
import { localeOf } from '../utils/dates';
import Skeleton from './Skeleton';

/**
 * PlanCards — rejilla de las 3 tarjetas de plan (mini / pro / max).
 *
 * Componente puramente presentacional, compartido por /pricing (donde se hace
 * el checkout de Stripe) y la home pública: mismo render de precio, badge de
 * prueba, features y CTA. Anti-drift: los datos vienen SIEMPRE de
 * /api/payments/plans vía usePlans — aquí no hay ni un precio escrito.
 *
 * Props:
 *   - plans:     [{ id, name, price:String, highlight, trial }]  (de usePlans)
 *   - notLoaded: true durante la primera carga → skeletons con la forma real.
 *   - failed:    true si el catálogo no cargó (aviso de error, CTA deshabilitado).
 *   - ctaLabel:  texto del botón de cada tarjeta.
 *   - onChoose:  (planId) => void.
 *   - selectedId: plan elegido (en /pricing) → tarjeta marcada.
 *   - loadingId: id del plan con checkout en curso (o null). Mientras no sea null
 *                se deshabilitan TODAS las tarjetas (anti-doble-envío) y solo la
 *                que coincide muestra el spinner.
 *
 * Móvil: tarjetas apiladas con el plan destacado PRIMERO (order-first).
 * Sección 19: solo variables CSS de tema, nunca hex.
 */
export default function PlanCards({ plans = [], notLoaded = false, failed = false, ctaLabel, onChoose, loadingId = null, selectedId = null }) {
  const { t, lang } = useLang();
  const fmtPrice = (p) => {
    const n = Number(p);
    return Number.isFinite(n)
      ? n.toLocaleString(localeOf(lang), { style: 'currency', currency: 'EUR', minimumFractionDigits: Number.isInteger(n) ? 0 : 2 })
      : `€${p}`;
  };

  if (plans.length === 0 && notLoaded && !failed) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 w-full max-w-5xl" aria-busy="true" aria-label={t('pricing.loading')}>
        {[0, 1, 2].map(i => (
          <div key={i} className="card p-6 flex flex-col gap-4">
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-9 w-24" />
            <div className="flex flex-col gap-2.5 mt-1">{[0, 1, 2, 3].map(j => <Skeleton key={j} className="h-3.5" style={{ width: `${80 - j * 8}%` }} />)}</div>
            <Skeleton className="h-11 w-full mt-2 !rounded-[10px]" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 w-full max-w-5xl md:items-stretch">
        {plans.map((plan, i) => {
          const selected = selectedId === plan.id;
          const features = t(`pricing.features.${plan.id}`);
          return (
            <div key={plan.id}
              className={`card anim-enter relative p-6 flex flex-col ${plan.highlight ? 'order-first md:order-none' : ''}`}
              style={{
                '--i': i,
                borderColor: selected ? 'var(--accent)' : plan.highlight ? 'var(--border-strong)' : 'var(--border)',
                boxShadow: selected ? '0 0 0 1px var(--accent)' : plan.highlight ? 'var(--shadow-lg)' : 'none',
                background: plan.highlight ? 'var(--surface-2)' : 'var(--surface-1)',
                transition: 'border-color var(--dur-base) var(--ease-std), box-shadow var(--dur-base) var(--ease-std)'
              }}>
              <div className="flex items-center justify-between gap-2 min-h-[24px]">
                <span className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>{plan.name}</span>
                {plan.highlight && (
                  <span className="text-[11px] font-semibold uppercase tracking-wide rounded-full px-2.5 py-1"
                    style={{ background: 'var(--accent)', color: 'var(--on-accent)' }}>{t('pricing.recommended')}</span>
                )}
              </div>

              <div className="flex items-baseline gap-1 mt-4">
                <span className="text-4xl font-semibold tracking-tight tabular" style={{ color: 'var(--text-primary)' }}>{fmtPrice(plan.price)}</span>
                <span className="text-sm" style={{ color: 'var(--text-muted)' }}>{t('pricing.monthSuffix')}</span>
              </div>
              <div className="mt-2 md:h-6">
                {plan.trial && (
                  <span className="inline-flex text-xs font-medium rounded-full px-2.5 py-1"
                    style={{ color: 'var(--positive)', background: 'var(--positive-soft)' }}>
                    {t('pricing.trialBadge')}
                  </span>
                )}
              </div>

              <ul className="flex flex-col gap-2.5 text-sm mt-5 mb-6 flex-1" style={{ color: 'var(--text-secondary)' }}>
                {/* #18 (sesión 2): si la key de features no existe, t() devuelve la
                    propia key (string) y .map reventaba la página entera de pricing.
                    Guard Array.isArray → sin features simplemente no se listan. */}
                {(Array.isArray(features) ? features : []).map((f, j) => (
                  <li key={j} className="flex items-start gap-2.5">
                    <Check size={16} className="mt-0.5 shrink-0" style={{ color: 'var(--positive)' }} />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>

              <button onClick={() => onChoose?.(plan.id)} disabled={loadingId != null || plans.length === 0}
                aria-pressed={selectedId != null ? selected : undefined}
                className={`btn w-full ${plan.highlight || selected ? 'btn-primary' : 'btn-secondary'}`}>
                {loadingId === plan.id
                  ? <Loader2 size={16} className="animate-spin" />
                  : selected && <Check size={16} />}
                {selected ? t('pricing.selected') : ctaLabel}
              </button>
            </div>
          );
        })}
      </div>

      {failed && (
        <p role="alert" className="mt-5 text-sm rounded-lg px-3 py-2.5 max-w-2xl w-full flex items-center justify-center gap-2 text-center"
           style={{ background: 'var(--negative-soft)', color: 'var(--negative)' }}>
          <AlertCircle size={15} className="shrink-0" /> {t('pricing.plansLoadError')}
        </p>
      )}
    </>
  );
}
