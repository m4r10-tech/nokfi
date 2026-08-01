import { Link } from 'react-router-dom';
import { Loader2, Check } from 'lucide-react';
import { useLang } from '../context/LangContext';

/**
 * PlanCards — rejilla de las 3 tarjetas de plan (mini / pro / max).
 *
 * Componente puramente presentacional, extraído de Pricing.jsx para que tanto la
 * página de precios (donde se hace el checkout de Stripe) como la landing pública
 * reusen EXACTAMENTE el mismo render: precio, cuota, badge '14 días gratis',
 * features con checkmarks y botón de CTA. Mismo anti-drift (los datos vienen de
 * /api/payments/plans vía usePlans) — solo cambia el CTA según el consumidor.
 *
 * Props:
 *   - plans:    [{ id, name, price:String, highlight, trial }]  (de usePlans)
 *   - notLoaded: true durante la primera carga (muestra "Cargando planes…").
 *   - failed:   true si el catálogo no cargó (badge de error, cta deshabilitado).
 *   - ctaLabel: texto del botón de cada tarjeta (ej. "Suscribirme").
 *   - onChoose: (planId) => void  — qué hace el botón (en /pricing lanza checkout;
 *                en la landing navega a /pricing para meter el email).
 *   - loadingId: id del plan con checkout en curso (o null). Mientras no sea null
 *                se deshabilitan TODAS las tarjetas (anti-doble-envío, igual que en
 *                /pricing) y solo la que coincide muestra el spinner. La landing
 *                pasa null → botones limpios siempre.
 *
 * Sección 21 del proyecto: solo variables CSS de tema (var(--*)), nunca hex, para
 * que el contraste funcione en modo oscuro y claro automáticamente.
 */
export default function PlanCards({ plans = [], notLoaded = false, failed = false, ctaLabel, onChoose, loadingId = null }) {
  const { t } = useLang();

  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 w-full max-w-2xl">
        {plans.map(plan => (
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
            {plan.trial && (
              <span className="text-[11px] font-medium rounded-full px-2 py-0.5 self-start"
                    style={{ color: 'var(--accent)', background: 'var(--surface-2)', border: '0.5px solid var(--accent)' }}>
                {t('pricing.trialBadge')}
              </span>
            )}
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
            <button onClick={() => onChoose?.(plan.id)} disabled={loadingId != null || plans.length === 0}
              className="mt-1 rounded-lg py-2 text-sm font-medium flex items-center justify-center gap-2 disabled:opacity-60 transition-opacity"
              style={{ background: plan.highlight ? 'var(--accent)' : 'var(--surface-2)', color: plan.highlight ? '#fff' : 'var(--text-primary)', border: plan.highlight ? 'none' : '0.5px solid var(--border-strong)' }}>
              {loadingId === plan.id && <Loader2 size={15} className="animate-spin" />}
              {ctaLabel}
            </button>
          </div>
        ))}
      </div>

      {plans.length === 0 && !failed && notLoaded && (
        <p className="mt-5 text-sm" style={{ color: 'var(--text-secondary)' }}>{t('pricing.loading')}</p>
      )}
      {failed && (
        <p className="mt-5 text-sm rounded-lg px-3 py-2 max-w-2xl w-full text-center"
           style={{ background: 'var(--negative-soft)', color: 'var(--negative)' }}>
          {t('pricing.plansLoadError')}
        </p>
      )}
    </>
  );
}
