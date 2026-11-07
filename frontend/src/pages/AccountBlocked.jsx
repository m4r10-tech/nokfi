import { useState } from 'react';
import { Lock, Loader2 } from 'lucide-react';
import { paymentsApi } from '../middleware/api';
import { apiErrorMessage } from '../middleware/errors';
import { useLang } from '../context/LangContext';
import { usePlans } from '../hooks/usePlans';
import { localeOf } from '../utils/dates';
import { FormMessage } from '../components/AuthShell';

/**
 * S15b (U4) — Cuenta bloqueada por una renovación rechazada.
 *
 * El login devuelve 403 account_blocked con un token que SOLO sirve para pagar
 * un plan nuevo (POST /api/payments/stripe/resume-checkout). Al pagar, el
 * webhook reactiva la misma cuenta (misma clave y mismos datos) y Stripe vuelve
 * a /login?resumed=1. Se pinta dentro del AuthShell de /login.
 */
export default function AccountBlocked({ token, currentPlan, onBack }) {
  const { t, lang } = useLang();
  const { plans } = usePlans();
  const [selected, setSelected] = useState(currentPlan || 'mini');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const money = (eur) => Number(eur).toLocaleString(localeOf(lang), { style: 'currency', currency: 'EUR', minimumFractionDigits: Number.isInteger(Number(eur)) ? 0 : 2 });

  const pay = async () => {
    setBusy(true); setError(null);
    const res = await paymentsApi.resumeCheckout(token, selected, lang);
    if (res.ok && res.data.checkout_url) { window.location.href = res.data.checkout_url; return; }
    setBusy(false);
    setError(res.status === 401 ? t('login.blockedExpired') : apiErrorMessage(t, res));
  };

  return (
    <div className="flex flex-col gap-4 anim-scale">
      <div className="text-center">
        <div className="mx-auto mb-3 w-fit rounded-full p-3" style={{ background: 'var(--negative-soft)', color: 'var(--negative)' }}><Lock size={26} /></div>
        <h1 className="text-xl font-semibold tracking-tight mb-1" style={{ color: 'var(--text-primary)' }}>{t('login.blockedTitle')}</h1>
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{t('login.blockedBody')}</p>
      </div>

      <div>
        <p className="text-sm font-medium mb-2" style={{ color: 'var(--text-primary)' }}>{t('login.blockedPick')}</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2" role="radiogroup" aria-label={t('login.blockedPick')}>
          {plans.map(p => {
            const on = selected === p.id;
            return (
              <button key={p.id} type="button" role="radio" aria-checked={on} onClick={() => setSelected(p.id)}
                className="rounded-lg px-3 py-2.5 text-left min-h-[44px]"
                style={{ border: `1px solid ${on ? 'var(--accent)' : 'var(--border)'}`, background: on ? 'var(--accent-soft)' : 'var(--surface-2)' }}>
                <span className="block text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{p.name}</span>
                <span className="block text-xs" style={{ color: 'var(--text-secondary)' }}>{money(p.price)}</span>
              </button>
            );
          })}
        </div>
        <p className="text-xs mt-2" style={{ color: 'var(--text-muted)' }}>{t('login.blockedPayNote')}</p>
      </div>

      {error && <FormMessage tone="negative">{error}</FormMessage>}

      <button type="button" onClick={pay} disabled={busy || !plans.length} className="btn btn-primary w-full">
        {busy && <Loader2 size={16} className="animate-spin" />} {t('login.blockedResume')}
      </button>
      <button type="button" onClick={onBack} className="text-sm hover:underline" style={{ color: 'var(--text-secondary)' }}>
        {t('login.blockedBack')}
      </button>
    </div>
  );
}
