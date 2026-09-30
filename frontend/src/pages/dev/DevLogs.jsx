import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { devApi, keysApi } from '../../middleware/api';
import { apiErrorMessage, isConnectivityError } from '../../middleware/errors';
import { useLang } from '../../context/LangContext';
import { formatDateTime } from '../../utils/dates';
import PageHeader from '../../components/PageHeader';
import ErrorState from '../../components/ErrorState';
import Skeleton from '../../components/Skeleton';
import { Section, Segmented, Badge } from '../../components/ui';

/**
 * Sesión 9 — Desarrolladores › Registro de llamadas: fecha, clave, llamada,
 * resultado y duración. Sin el contenido de los documentos. 90 días.
 * ?client=… llega desde Clientes.
 */
export default function DevLogs() {
  const { t, lang } = useLang();
  const [params] = useSearchParams();
  const client = params.get('client') ?? '';
  const [result, setResult] = useState('');
  const [mode, setMode] = useState('');
  const [keyId, setKeyId] = useState('');
  const [keys, setKeys] = useState([]);
  const [calls, setCalls] = useState(null);
  const [next, setNext] = useState(null);
  const [more, setMore] = useState(false);
  const [failure, setFailure] = useState(null);

  useEffect(() => { keysApi.list().then(r => { if (r.ok) setKeys(r.data.keys); }); }, []);

  const filters = { result, mode, key_id: keyId, client, limit: 50 };
  const load = useCallback(async () => {
    setFailure(null); setCalls(null);
    const r = await devApi.calls({ result, mode, key_id: keyId, client, limit: 50 });
    if (r.ok) { setCalls(r.data.calls); setNext(r.data.next_before); } else setFailure(r);
  }, [result, mode, keyId, client]);
  useEffect(() => { load(); }, [load]);

  const loadMore = async () => {
    setMore(true);
    const r = await devApi.calls({ ...filters, before: next });
    setMore(false);
    if (r.ok) { setCalls(c => [...c, ...r.data.calls]); setNext(r.data.next_before); }
  };

  if (failure) return <ErrorState offline={isConnectivityError(failure)} message={apiErrorMessage(t, failure)} onRetry={load} />;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={t('dev.logsTitle')} description={t('dev.logsDesc')} />
      <Section>
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <Segmented size="sm" value={result} onChange={setResult} label={t('dev.logsResult')}
            options={[{ value: '', label: t('dev.logsAll') }, { value: 'ok', label: t('dev.logsOk') }, { value: 'error', label: t('dev.logsErrors') }]} />
          <Segmented size="sm" value={mode} onChange={setMode} label={t('dev.modeLabel')}
            options={[{ value: '', label: t('dev.logsAllModes') }, { value: 'live', label: t('dev.modeLive') }, { value: 'test', label: t('dev.modeTest') }]} />
          <select value={keyId} onChange={(e) => setKeyId(e.target.value)} className="input !h-8 !w-auto text-xs" aria-label={t('dev.logsKey')}>
            <option value="">{t('dev.logsAllKeys')}</option>
            {keys.map(k => <option key={k.id} value={k.id}>{k.name || t('config.api.unnamed')} ({k.prefix}…){k.revoked_at ? ` · ${t('dev.revoked')}` : ''}</option>)}
            <option value="playground">Playground</option>
          </select>
          {client && <Badge tone="accent">{t('dev.logsClient', { name: client === '__none__' ? t('dev.noClient') : client })}</Badge>}
        </div>

        {!calls ? <Skeleton className="h-40" /> : !calls.length ? (
          <p className="text-sm py-6 text-center" style={{ color: 'var(--text-secondary)' }}>{t('dev.logsEmpty')}</p>
        ) : (
          <>
            <ul className="flex flex-col -mx-2 text-sm">
              {calls.map((c, i) => (
                <li key={c.id} className="grid grid-cols-[auto_1fr_auto] sm:grid-cols-[9.5rem_1fr_9rem_4.5rem] items-center gap-x-3 gap-y-0.5 px-2 py-2" style={{ borderTop: i ? '1px solid var(--border)' : 'none' }}>
                  <Badge tone={c.status >= 400 ? 'negative' : 'positive'}>{c.status}</Badge>
                  <div className="min-w-0 sm:order-2">
                    <p className="truncate" style={{ color: 'var(--text-primary)' }}><code className="text-xs">{c.method} {c.path.replace('/api/v1', '') || '/'}</code>{c.error_code ? <span className="text-xs" style={{ color: 'var(--negative)' }}> · {c.error_code}</span> : null}</p>
                    <p className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>
                      {c.key_id ? `${c.key_name || t('config.api.unnamed')} (${c.key_prefix}…)` : 'Playground'}{c.client ? ` · ${c.client}` : ''}{!c.livemode ? ` · ${t('dev.testBadge')}` : ''}
                    </p>
                  </div>
                  <span className="text-xs tabular text-right sm:order-4" style={{ color: 'var(--text-muted)' }}>{c.ms} ms</span>
                  <span className="text-xs col-span-3 sm:col-span-1 sm:order-1" style={{ color: 'var(--text-secondary)' }}>{formatDateTime(c.created_at, lang)}</span>
                </li>
              ))}
            </ul>
            {next && (
              <button onClick={loadMore} disabled={more} className="btn btn-ghost btn-sm mt-2">{more && <Loader2 size={14} className="animate-spin" />} {t('dev.logsMore')}</button>
            )}
          </>
        )}
      </Section>
    </div>
  );
}
