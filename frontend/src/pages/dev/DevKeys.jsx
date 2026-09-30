import { useState, useEffect, useCallback } from 'react';
import { KeyRound, Copy, Loader2, Code2, Trash2 } from 'lucide-react';
import { keysApi } from '../../middleware/api';
import { apiErrorMessage, isConnectivityError } from '../../middleware/errors';
import { useLang } from '../../context/LangContext';
import { useToast } from '../../context/ToastContext';
import { formatDateTime } from '../../utils/dates';
import PageHeader from '../../components/PageHeader';
import ErrorState from '../../components/ErrorState';
import Skeleton from '../../components/Skeleton';
import { Section, ErrorBox, Badge, Segmented } from '../../components/ui';
import DevLocked from './DevLocked';
import ConfirmModal from '../../components/dev/ConfirmModal';

/**
 * Sesión 7 — Desarrolladores › Claves (antes en Configuración). La clave se
 * muestra una sola vez; se guarda solo su hash. Cada clave lleva el nombre
 * del cliente o del flujo (opción A para agencias) y su uso de hoy.
 * Sesión 9: claves de prueba (nk_test_, todos los planes) y cliente.
 */
export default function DevKeys() {
  const { t, lang } = useLang();
  const toast = useToast();
  const [data, setData] = useState(null);
  const [failure, setFailure] = useState(null);
  const [name, setName] = useState('');
  const [client, setClient] = useState('');
  const [mode, setMode] = useState('live');
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState(null);
  const [error, setError] = useState(null);
  const [revoking, setRevoking] = useState(null);

  const load = useCallback(async () => {
    setFailure(null);
    const res = await keysApi.list();
    if (res.ok) setData(res.data); else setFailure(res);
  }, []);
  useEffect(() => { load(); }, [load]);

  const create = async (e) => {
    e.preventDefault();
    setCreating(true); setError(null);
    const res = await keysApi.create(name.trim(), { mode: data.available ? mode : 'test', client: client.trim() });
    setCreating(false);
    if (res.ok) { setCreated(res.data.key); setName(''); setClient(''); load(); }
    else setError(apiErrorMessage(t, res));
  };
  const revoke = async () => {
    const res = await keysApi.revoke(revoking.id);
    setRevoking(null);
    if (res.ok) { toast.success(t('config.api.revoked')); load(); } else toast.error(apiErrorMessage(t, res));
  };
  const copy = async () => { try { await navigator.clipboard.writeText(created); toast.success(t('common.copied')); } catch { /* sin portapapeles */ } };

  if (failure) return <ErrorState offline={isConnectivityError(failure)} message={apiErrorMessage(t, failure)} onRetry={load} />;
  const active = data ? data.keys.filter(k => !k.revoked_at) : [];

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={t('dev.keysTitle')} description={t('config.api.desc')} />
      {!data ? <Skeleton className="h-40" /> : (
        <>
          {!data.available && <DevLocked />}
          {created && (
            <section className="card p-4 flex flex-col gap-2 anim-fade" style={{ background: 'var(--positive-soft)' }}>
              <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{t('config.api.createdOnce')}</p>
              <div className="flex items-center gap-2 rounded-lg pl-3 pr-1.5 py-1.5" style={{ background: 'var(--surface-1)', border: '1px solid var(--border-strong)' }}>
                <code className="flex-1 text-xs break-all" style={{ color: 'var(--text-primary)' }}>{created}</code>
                <button onClick={copy} className="btn btn-ghost btn-sm !px-2.5" aria-label={t('common.copy')}><Copy size={15} /></button>
              </div>
              <button onClick={() => setCreated(null)} className="text-xs self-start hover:underline" style={{ color: 'var(--text-secondary)' }}>{t('config.api.savedIt')}</button>
            </section>
          )}

          <Section title={t('dev.newKey')}>
            <form onSubmit={create} className="flex flex-col gap-3">
              {data.available && (
                <div className="flex flex-col items-start gap-1.5">
                  <Segmented value={mode} onChange={setMode} label={t('dev.modeLabel')}
                    options={[{ value: 'live', label: t('dev.modeLive') }, { value: 'test', label: t('dev.modeTest') }]} />
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{mode === 'live' ? t('dev.modeLiveHint') : t('dev.modeTestHint')}</p>
                </div>
              )}
              {!data.available && <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{t('dev.testOnlyNotice')}</p>}
              <div className="flex flex-col sm:flex-row gap-2">
                <input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder={t('config.api.namePlaceholder')} aria-label={t('config.api.namePlaceholder')} className="input flex-1" />
                <input value={client} onChange={(e) => setClient(e.target.value)} maxLength={60} placeholder={t('dev.clientPlaceholder')} aria-label={t('dev.clientLabel')} className="input sm:w-48" />
                <button type="submit" disabled={creating} className="btn btn-primary">{creating ? <Loader2 size={15} className="animate-spin" /> : <KeyRound size={15} />} {t('config.api.create')}</button>
              </div>
            </form>
            <p className="text-xs mt-2" style={{ color: 'var(--text-muted)' }}>{t('dev.keyNameHint')}</p>
            {error && <ErrorBox>{error}</ErrorBox>}
          </Section>

          {active.length > 0 && (
            <Section title={t('dev.activeKeys')}>
              <ul className="flex flex-col -mx-2">
                {active.map((k, i) => (
                  <li key={k.id} className="flex items-center gap-3 px-2 py-2.5" style={{ borderTop: i ? '1px solid var(--border)' : 'none' }}>
                    <Code2 size={15} className="shrink-0" style={{ color: 'var(--accent-text)' }} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm truncate" style={{ color: 'var(--text-primary)' }}>{k.name || t('config.api.unnamed')} <code className="text-xs" style={{ color: 'var(--text-muted)' }}>{k.prefix}…</code></p>
                      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{k.client ? `${k.client} · ` : ''}{k.last_used_at ? t('config.api.lastUsed').replace('{date}', formatDateTime(k.last_used_at, lang)) : t('config.api.neverUsed')}</p>
                    </div>
                    {k.mode === 'test' && <Badge tone="accent">{t('dev.testBadge')}</Badge>}
                    <Badge tone={k.calls_today ? 'accent' : 'muted'}>{t('dev.callsTodayKey', { n: k.calls_today || 0 })}</Badge>
                    <button onClick={() => setRevoking(k)} className="btn btn-ghost btn-sm !px-2" aria-label={t('config.api.revoke')} title={t('config.api.revoke')}><Trash2 size={14} /></button>
                  </li>
                ))}
              </ul>
            </Section>
          )}
        </>
      )}
      {revoking && <ConfirmModal title={t('config.api.revoke')} text={t('config.api.confirmRevoke')} cta={t('config.api.revoke')} danger onConfirm={revoke} onClose={() => setRevoking(null)} />}
    </div>
  );
}
