import { useState, useEffect, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Loader2, CheckCircle2, KeyRound, Copy, AlertCircle } from 'lucide-react';
import { paymentsApi } from '../middleware/api';
import { useLang } from '../context/LangContext';
import { usePageMeta } from '../hooks/usePageMeta';
import AuthShell from '../components/AuthShell';
import { useToast } from '../context/ToastContext';

/**
 * /reveal?session_id=...
 *
 * Página a la que vuelve el navegador tras completar el Stripe Checkout
 * (el success_url apunta aquí con {CHECKOUT_SESSION_ID}). Muestra la clave
 * recién comprada en la web — además del email, que el webhook ya envió.
 *
 * El webhook puede tardar unos segundos en procesarse y crear la licencia,
 * así que ante un 404 se reintenta con backoff: hasta 5 intentos con espera
 * creciente (3s × intento → 3/6/9/12s entre intentos, ~30s de margen total).
 * #20 (sesión 2): antes era UN solo reintento a los 3s — un webhook lento
 * (cola de Stripe, cold start) dejaba al usuario en "not_found" con la clave
 * ya creada unos segundos después.
 */
export default function Reveal() {
  const [searchParams] = useSearchParams();
  const session_id = searchParams.get('session_id');
  const { t } = useLang();
  usePageMeta(t('meta.revealTitle'));
  return <RevealStep session_id={session_id} />;
}

function RevealStep({ session_id }) {
  const [state, setState] = useState('loading'); // loading | success | pending | not_found | already
  const [data, setData] = useState(null);        // { key, email, plan }
  const attempts = useRef(0);
  const timer = useRef(null);
  const { t } = useLang();
  const toast = useToast();
  const navigate = useNavigate();

  const MAX_ATTEMPTS = 5; // #20: backoff 3s×intento → 3/6/9/12s entre intentos

  useEffect(() => {
    let cancelled = false;
    if (!session_id) { setState('not_found'); return; }

    const fetchOnce = async () => {
      attempts.current += 1;
      const { ok, data } = await paymentsApi.reveal(session_id);
      if (cancelled) return;
      if (ok && data.key) {
        setData(data);
        setState('success');
        return;
      }
      // S15b (P6): la clave se muestra una sola vez; después solo queda el email.
      if (data.error === 'already_revealed') {
        setData({ email: data.email });
        setState('already');
        return;
      }
      // 404: el webhook puede no haber llegado todavía → reintenta con backoff
      // creciente manteniendo el estado 'pending' (spinner + mensaje de espera).
      if (data.error === 'not_found' && attempts.current < MAX_ATTEMPTS) {
        setState('pending');
        timer.current = setTimeout(() => { if (!cancelled) fetchOnce(); }, 3000 * attempts.current);
        return;
      }
      setState('not_found');
    };

    fetchOnce();
    return () => { cancelled = true; clearTimeout(timer.current); };
  }, [session_id]);

  const copyKey = async () => {
    try {
      await navigator.clipboard.writeText(data.key);
      toast.success(t('config.keyCopied'));
    } catch { /* clipboard no disponible */ }
  };

  return (
    <AuthShell>
      {(state === 'loading' || state === 'pending') && (
        <div className="flex flex-col items-center gap-3 py-6 text-center" aria-live="polite">
          <Loader2 size={30} className="animate-spin" style={{ color: 'var(--accent-text)' }} />
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{t(state === 'pending' ? 'reveal.pending' : 'common.loading')}</p>
        </div>
      )}

      {state === 'not_found' && (
        <div className="flex flex-col items-center gap-3 py-6 text-center anim-scale">
          <div className="rounded-full p-3" style={{ background: 'var(--negative-soft)', color: 'var(--negative)' }}><AlertCircle size={26} /></div>
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{t('reveal.notFound')}</p>
        </div>
      )}

      {state === 'already' && (
        <div className="flex flex-col items-center gap-4 py-6 text-center anim-scale">
          <div className="rounded-full p-3" style={{ background: 'var(--accent-soft)', color: 'var(--accent-text)' }}><KeyRound size={26} /></div>
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{t('reveal.alreadyShown')}</p>
          <button onClick={() => navigate('/login', { state: { email: data?.email || '' } })} className="btn btn-primary w-full">
            {t('reveal.goLogin')}
          </button>
        </div>
      )}

      {state === 'success' && data && (
        <div className="flex flex-col gap-5 anim-scale">
          <div className="text-center">
            <div className="mx-auto mb-3 w-fit rounded-full p-3" style={{ background: 'var(--positive-soft)', color: 'var(--positive)' }}><CheckCircle2 size={28} /></div>
            <h1 className="text-xl font-semibold tracking-tight mb-1" style={{ color: 'var(--text-primary)' }}>{t(data.blocked ? 'reveal.titleBlocked' : data.trial ? 'reveal.titleTrial' : 'reveal.title')}</h1>
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{t(data.blocked ? 'reveal.subtitleBlocked' : data.trial ? 'reveal.subtitleTrial' : 'reveal.subtitle')}</p>
          </div>

          <div>
            <p className="section-title mb-1.5 flex items-center gap-1.5"
               style={{ color: 'var(--text-muted)' }}>
              <KeyRound size={12} /> {t('reveal.yourKey')}
            </p>
            <div className="flex items-center gap-2 rounded-lg pl-3 pr-1.5 py-1.5"
                 style={{ background: 'var(--surface-2)', border: '1px solid var(--border-strong)' }}>
              <code className="flex-1 font-mono text-base tracking-wide break-all"
                    style={{ color: 'var(--text-primary)' }}>{data.key}</code>
              <button onClick={copyKey} className="btn btn-ghost btn-sm !px-2.5" aria-label={t('common.copy')} title={t('common.copy')}>
                <Copy size={16} />
              </button>
            </div>
            <p className="text-xs mt-2" style={{ color: 'var(--text-muted)' }}>{t('reveal.alsoEmailed')}</p>
          </div>

          {/* P9: el login llega con el email y la clave ya puestos (por estado de la
              navegación, no en la URL). */}
          <button onClick={() => navigate('/login', { state: { email: data.email, key: data.key } })} className="btn btn-primary w-full">
            {t('reveal.goLogin')}
          </button>
        </div>
      )}
    </AuthShell>
  );
}
