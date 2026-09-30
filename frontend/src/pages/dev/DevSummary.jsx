import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { KeyRound, AlertTriangle, Check, Play, Webhook } from 'lucide-react';
import { keysApi } from '../../middleware/api';
import { apiErrorMessage, isConnectivityError } from '../../middleware/errors';
import { useLang } from '../../context/LangContext';
import { formatDateTime, parseDbDate, localeOf } from '../../utils/dates';
import { num } from '../../utils/money';
import PageHeader from '../../components/PageHeader';
import ErrorState from '../../components/ErrorState';
import Skeleton from '../../components/Skeleton';
import { Kpi, Section } from '../../components/ui';
import DevLocked from './DevLocked';

/**
 * Sesión 7 — Desarrolladores › Resumen: llamadas de hoy, cuota (compartida
 * con la web), claves activas y el último error, más los primeros pasos para
 * tener un flujo funcionando.
 */
export default function DevSummary() {
  const { t, lang } = useLang();
  const [data, setData] = useState(null);
  const [failure, setFailure] = useState(null);

  const load = useCallback(async () => {
    setFailure(null);
    const res = await keysApi.summary();
    if (res.ok) setData(res.data); else setFailure(res);
  }, []);
  useEffect(() => { load(); }, [load]);

  if (failure) return <ErrorState offline={isConnectivityError(failure)} message={apiErrorMessage(t, failure)} onRetry={load} />;

  const e = data?.last_error;
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={t('dev.summaryTitle')} description={t('dev.summaryDesc')} />
      {!data ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">{[0, 1, 2, 3].map(i => <Skeleton key={i} className="h-24" />)}</div>
      ) : (
        <>
          {!data.available && <DevLocked />}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
            <Kpi label={t('dev.callsToday')} value={num(data.calls_today, lang, 0)}
              hint={data.errors_today > 0 ? t('dev.errorsToday', { n: data.errors_today }) : undefined} tone={data.errors_today > 0 ? 'var(--warning)' : undefined} />
            <Kpi label={t('dev.quota')} value={`${num(data.quota.used_today, lang, 0)} / ${num(data.quota.daily, lang, 0)}`} hint={t('dev.quotaHint')} />
            <Kpi label={t('dev.keysActive')} value={num(data.keys_active, lang, 0)} />
            <Kpi label={t('dev.lastCall')} value={data.last_call_at ? shortWhen(data.last_call_at, lang) : '—'} />
          </div>

          <Section title={t('dev.lastError')}>
            {e ? (
              <div className="flex items-start gap-3 text-sm">
                <AlertTriangle size={16} className="mt-0.5 shrink-0" style={{ color: 'var(--warning)' }} />
                <div className="min-w-0">
                  <p style={{ color: 'var(--text-primary)' }}><code>{e.method} {e.path}</code> → {e.status}{e.error_code ? ` · ${e.error_code}` : ''}</p>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{formatDateTime(e.created_at, lang)}{e.key_name ? ` · ${e.key_name}` : ''}</p>
                </div>
              </div>
            ) : (
              <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{t('dev.lastErrorNone')}</p>
            )}
          </Section>

          <Section title={t('dev.startTitle')}>
            <ol className="flex flex-col gap-3 text-sm">
              {[
                { n: 1, text: t('dev.step1'), to: '/app/dev/claves', icon: KeyRound, cta: t('dev.step1Cta'), done: data.keys_total > 0 },
                { n: 2, text: t('dev.step2'), to: '/app/dev/playground', icon: Play, cta: t('dev.step2Cta'), done: !!data.last_call_at },
                { n: 3, text: t('dev.step3'), to: '/app/dev/webhooks', icon: Webhook, cta: t('dev.step3Cta'), done: data.webhooks_total > 0 }
              ].map(s => (
                <li key={s.n} className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
                  <span className="shrink-0 w-6 h-6 rounded-full grid place-items-center text-xs font-semibold"
                    style={s.done ? { background: 'var(--positive-soft)', color: 'var(--positive)' } : { background: 'var(--surface-2)', color: 'var(--text-secondary)' }}>
                    {s.done ? <Check size={13} strokeWidth={3} aria-label={t('dev.stepDone')} /> : s.n}
                  </span>
                  <span className="flex-1" style={{ color: s.done ? 'var(--text-muted)' : 'var(--text-primary)' }}>{s.text}</span>
                  {!s.done && s.to && <Link to={s.to} className="btn btn-secondary btn-sm self-start"><s.icon size={14} /> {s.cta}</Link>}
                </li>
              ))}
            </ol>
          </Section>
        </>
      )}
    </div>
  );
}

/** Hoy → "19:05"; otro día → "28 sept 19:05" (cabe en la tarjeta). */
function shortWhen(s, lang) {
  const d = parseDbDate(s);
  if (!d) return '—';
  const loc = localeOf(lang);
  const time = d.toLocaleTimeString(loc, { hour: '2-digit', minute: '2-digit' });
  return d.toDateString() === new Date().toDateString() ? time : `${d.toLocaleDateString(loc, { day: 'numeric', month: 'short' })} ${time}`;
}
