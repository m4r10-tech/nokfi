import { useState, useEffect, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Loader2, CheckCircle2, KeyRound, Copy, Check, AlertCircle } from 'lucide-react';
import { paymentsApi } from '../middleware/api';
import { useLang } from '../context/LangContext';
import { usePageMeta } from '../hooks/usePageMeta';
import Logo from '../components/Logo';

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
  const [state, setState] = useState('loading'); // loading | success | pending | not_found
  const [data, setData] = useState(null);        // { key, email, plan }
  const [copied, setCopied] = useState(false);
  const attempts = useRef(0);
  const timer = useRef(null);
  const { t } = useLang();
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
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* clipboard no disponible */ }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ background: 'var(--bg-base)' }}>
      <div className="w-full max-w-sm">
        <div className="flex justify-center mb-8"><Logo size="lg" /></div>
        <div className="rounded-2xl p-8" style={{ background: 'var(--surface-1)', border: '0.5px solid var(--border)' }}>
          {state === 'loading' && (
            <div className="flex flex-col items-center gap-3 py-6 text-center">
              <Loader2 size={32} className="animate-spin" style={{ color: 'var(--accent)' }} />
              <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{t('common.loading')}</p>
            </div>
          )}

          {state === 'pending' && (
            <div className="flex flex-col items-center gap-3 py-6 text-center">
              <Loader2 size={32} className="animate-spin" style={{ color: 'var(--accent)' }} />
              <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{t('reveal.pending')}</p>
            </div>
          )}

          {state === 'not_found' && (
            <div className="flex flex-col items-center gap-3 py-6 text-center">
              <AlertCircle size={40} style={{ color: 'var(--negative)' }} />
              <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{t('reveal.notFound')}</p>
            </div>
          )}

          {state === 'success' && data && (
            <div className="flex flex-col gap-4">
              <div className="text-center">
                <CheckCircle2 size={40} className="mx-auto mb-3" style={{ color: 'var(--positive)' }} />
                <h1 className="text-xl font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>{t('reveal.title')}</h1>
                <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{t('reveal.subtitle')}</p>
              </div>

              <div>
                <p className="text-xs font-medium uppercase tracking-wide mb-1.5 flex items-center gap-1.5"
                   style={{ color: 'var(--text-muted)' }}>
                  <KeyRound size={12} /> {t('reveal.yourKey')}
                </p>
                <div className="flex items-center gap-2 rounded-lg px-3 py-3"
                     style={{ background: 'var(--surface-2)', border: '0.5px solid var(--border-strong)' }}>
                  <code className="flex-1 font-mono text-base tracking-wide break-all"
                        style={{ color: 'var(--text-primary)' }}>{data.key}</code>
                  <button onClick={copyKey}
                    className="shrink-0 rounded-md p-2 transition-colors"
                    style={{ background: 'var(--surface-1)', color: copied ? 'var(--positive)' : 'var(--text-secondary)' }}
                    title={copied ? t('common.copied') : t('common.copy')}>
                    {copied ? <Check size={16} /> : <Copy size={16} />}
                  </button>
                </div>
                <p className="text-xs mt-2" style={{ color: 'var(--text-muted)' }}>{t('reveal.alsoEmailed')}</p>
              </div>

              <button onClick={() => navigate('/login')}
                className="mt-2 rounded-lg py-2.5 text-sm font-medium"
                style={{ background: 'var(--accent)', color: '#fff' }}>
                {t('reveal.goLogin')}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
