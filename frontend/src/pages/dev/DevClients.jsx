import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { KeyRound, ArrowRight } from 'lucide-react';
import { devApi, keysApi } from '../../middleware/api';
import { apiErrorMessage, isConnectivityError } from '../../middleware/errors';
import { useLang } from '../../context/LangContext';
import { useToast } from '../../context/ToastContext';
import { shortDateTime } from '../../utils/dates';
import { num } from '../../utils/money';
import PageHeader from '../../components/PageHeader';
import ErrorState from '../../components/ErrorState';
import Skeleton from '../../components/Skeleton';
import { Section, Badge, Kpi } from '../../components/ui';

/**
 * Sesión 9 — Desarrolladores › Clientes (opción B): las claves agrupadas por
 * cliente final, con las llamadas y los errores de cada uno. Para agencias y
 * freelancers que montan automatizaciones para varios negocios.
 */
export default function DevClients() {
  const { t, lang } = useLang();
  const toast = useToast();
  const [data, setData] = useState(null);
  const [failure, setFailure] = useState(null);

  const load = useCallback(async () => {
    setFailure(null);
    const r = await devApi.clients();
    if (r.ok) setData(r.data.clients); else setFailure(r);
  }, []);
  useEffect(() => { load(); }, [load]);

  const move = async (k, client) => {
    const r = await keysApi.setClient(k.id, client);
    if (r.ok) { toast.success(t('dev.clientSaved')); load(); } else toast.error(apiErrorMessage(t, r));
  };

  if (failure) return <ErrorState offline={isConnectivityError(failure)} message={apiErrorMessage(t, failure)} onRetry={load} />;
  const names = data ? data.map(g => g.client).filter(Boolean) : [];

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={t('dev.clientsTitle')} description={t('dev.clientsDesc')} />
      {!data ? <Skeleton className="h-48" /> : !data.length ? (
        <Section>
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{t('dev.clientsEmpty')}</p>
          <Link to="/app/dev/claves" className="btn btn-secondary btn-sm mt-3"><KeyRound size={14} /> {t('dev.step1Cta')}</Link>
        </Section>
      ) : data.map(g => (
        <Section key={g.client || '__none__'} title={g.client || t('dev.noClient')} aside={
          <Link to={`/app/dev/registro?client=${encodeURIComponent(g.client || '__none__')}`} className="text-xs link inline-flex items-center gap-1">{t('dev.clientLogs')} <ArrowRight size={12} /></Link>
        }>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 mb-3">
            <Kpi label={t('dev.callsToday')} value={num(g.calls_today, lang, 0)} hint={g.errors_today ? t('dev.errorsToday', { n: g.errors_today }) : undefined} tone={g.errors_today ? 'var(--warning)' : undefined} />
            <Kpi label={t('dev.calls30d')} value={num(g.calls_30d, lang, 0)} hint={g.errors_30d ? t('dev.errorsToday', { n: g.errors_30d }) : undefined} />
            <Kpi label={t('dev.clientKeys')} value={num(g.keys.filter(k => !k.revoked_at).length, lang, 0)} />
            <Kpi label={t('dev.lastCall')} value={g.last_call_at ? shortDateTime(g.last_call_at, lang) : '—'} />
          </div>
          <ul className="flex flex-col -mx-2">
            {g.keys.map((k, i) => (
              <li key={k.id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-2 py-2" style={{ borderTop: i ? '1px solid var(--border)' : 'none', opacity: k.revoked_at ? 0.6 : 1 }}>
                <p className="flex-1 min-w-[10rem] text-sm truncate" style={{ color: 'var(--text-primary)' }}>
                  {k.name || t('config.api.unnamed')} <code className="text-xs" style={{ color: 'var(--text-muted)' }}>{k.prefix}…</code>
                </p>
                {k.mode === 'test' && <Badge tone="accent">{t('dev.testBadge')}</Badge>}
                {k.revoked_at && <Badge>{t('dev.revoked')}</Badge>}
                <ClientPicker value={g.client} names={names} onSave={(c) => move(k, c)} t={t} />
              </li>
            ))}
          </ul>
        </Section>
      ))}
    </div>
  );
}

/** Campo con sugerencias (datalist) para mover una clave a otro cliente. */
function ClientPicker({ value, names, onSave, t }) {
  const [v, setV] = useState(value);
  const [id] = useState(() => `clients-${Math.random().toString(36).slice(2, 8)}`);
  const dirty = v.trim() !== value;
  return (
    <form onSubmit={(e) => { e.preventDefault(); if (dirty) onSave(v.trim()); }} className="flex items-center gap-1.5">
      <input value={v} onChange={(e) => setV(e.target.value)} list={id} maxLength={60} placeholder={t('dev.clientPlaceholder')} aria-label={t('dev.clientLabel')} className="input !h-8 text-xs !w-40" />
      <datalist id={id}>{names.map(n => <option key={n} value={n} />)}</datalist>
      {dirty && <button type="submit" className="btn btn-secondary btn-sm !h-8">{t('common.save')}</button>}
    </form>
  );
}
