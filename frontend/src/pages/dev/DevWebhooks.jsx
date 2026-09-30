import { useState, useEffect, useCallback } from 'react';
import { Loader2, Plus, Send, Eye, RefreshCw, Trash2, Power, ChevronDown, ChevronUp, RotateCw } from 'lucide-react';
import { devApi } from '../../middleware/api';
import { apiErrorMessage, isConnectivityError } from '../../middleware/errors';
import { useLang } from '../../context/LangContext';
import { useToast } from '../../context/ToastContext';
import { formatTime, parseDbDate, shortDateTime } from '../../utils/dates';
import PageHeader from '../../components/PageHeader';
import ErrorState from '../../components/ErrorState';
import Skeleton from '../../components/Skeleton';
import CodeBlock from '../../components/dev/CodeBlock';
import ConfirmModal from '../../components/dev/ConfirmModal';
import { Section, Badge, ErrorBox, Notice, Field } from '../../components/ui';

const VERIFY = `// Node.js (Express): comprobar la firma de Nokfi
import crypto from 'node:crypto';

app.post('/nokfi', express.raw({ type: 'application/json' }), (req, res) => {
  const header = req.get('Nokfi-Signature') || '';          // t=…,v1=…
  const { t, v1 } = Object.fromEntries(header.split(',').map(p => p.split('=')));
  const expected = crypto.createHmac('sha256', process.env.NOKFI_WEBHOOK_SECRET)
    .update(\`\${t}.\${req.body}\`).digest('hex');
  const fresh = Math.abs(Date.now() / 1000 - Number(t)) < 300;
  const ok = fresh && v1 && v1.length === expected.length
    && crypto.timingSafeEqual(Buffer.from(v1), Buffer.from(expected));
  if (!ok) return res.status(400).end();
  const event = JSON.parse(req.body);   // { id, type, created_at, livemode, data }
  // Guarda event.id: si llega dos veces (reintento), ignóralo.
  res.status(200).end();
});`;

/**
 * Sesión 9 — Desarrolladores › Webhooks: alta de endpoints, eventos, secreto
 * de firma, "Enviar prueba" y registro de envíos con reenvío.
 */
export default function DevWebhooks() {
  const { t, lang } = useLang();
  const toast = useToast();
  const [data, setData] = useState(null);
  const [failure, setFailure] = useState(null);
  const [url, setUrl] = useState('');
  const [description, setDescription] = useState('');
  const [all, setAll] = useState(true);
  const [events, setEvents] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [created, setCreated] = useState(null);
  const [open, setOpen] = useState(null);

  const load = useCallback(async () => {
    setFailure(null);
    const res = await devApi.webhooks();
    if (res.ok) setData(res.data); else setFailure(res);
  }, []);
  useEffect(() => { load(); }, [load]);

  const toggle = (ev) => { setError(null); setEvents(list => (list.includes(ev) ? list.filter(x => x !== ev) : [...list, ev])); };

  const create = async (e) => {
    e.preventDefault();
    if (!all && !events.length) { setError(t('dev.whPickEvents')); return; }
    setSaving(true); setError(null);
    const res = await devApi.createWebhook({ url: url.trim(), description: description.trim(), events: all ? '*' : events });
    setSaving(false);
    if (!res.ok) { setError(apiErrorMessage(t, res)); return; }
    setCreated(res.data); setUrl(''); setDescription(''); setAll(true); setEvents([]);
    load();
  };

  if (failure) return <ErrorState offline={isConnectivityError(failure)} message={apiErrorMessage(t, failure)} onRetry={load} />;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={t('dev.whTitle')} description={t('dev.whDesc')} />
      {!data ? <Skeleton className="h-48" /> : (
        <>
          {!data.live_events && <Notice>{t('dev.whTestOnly')}</Notice>}

          {created && (
            <section className="card p-4 flex flex-col gap-2 anim-fade" style={{ background: 'var(--positive-soft)' }}>
              <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{t('dev.whCreated')}</p>
              <CodeBlock text={created.secret} label={t('dev.whSecret')} />
              <button onClick={() => setCreated(null)} className="text-xs self-start hover:underline" style={{ color: 'var(--text-secondary)' }}>{t('config.api.savedIt')}</button>
            </section>
          )}

          <Section title={t('dev.whNew')}>
            <form onSubmit={create} className="flex flex-col gap-3">
              <Field label={t('dev.whUrl')} htmlFor="wh-url" hint={t('dev.whUrlHint')}>
                <input id="wh-url" type="url" required value={url} onChange={(e) => { setUrl(e.target.value); setError(null); }} placeholder="https://" className="input" maxLength={500} />
              </Field>
              <Field label={t('dev.whDescription')} htmlFor="wh-desc">
                <input id="wh-desc" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={120} className="input" />
              </Field>
              <fieldset className="flex flex-col gap-2">
                <legend className="field-label">{t('dev.whEvents')}</legend>
                <label className="flex items-center gap-2 text-sm" style={{ color: 'var(--text-primary)' }}>
                  <input type="checkbox" checked={all} onChange={(e) => { setAll(e.target.checked); setError(null); }} /> {t('dev.whAllEvents')}
                </label>
                {!all && (
                  <div className="flex flex-col gap-1.5 pl-6">
                    {data.event_types.map(ev => (
                      <label key={ev} className="flex items-start gap-2 text-sm" style={{ color: 'var(--text-primary)' }}>
                        <input type="checkbox" className="mt-1" checked={events.includes(ev)} onChange={() => toggle(ev)} />
                        <span>{t(`dev.ev_${ev.replace('.', '_')}`)} <code className="text-xs" style={{ color: 'var(--text-muted)' }}>{ev}</code></span>
                      </label>
                    ))}
                  </div>
                )}
              </fieldset>
              <button type="submit" disabled={saving} className="btn btn-primary self-start">{saving ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />} {t('dev.whCreate')}</button>
              {error && <ErrorBox>{error}</ErrorBox>}
            </form>
          </Section>

          {data.webhooks.length > 0 && (
            <Section title={t('dev.whList')}>
              <ul className="flex flex-col -mx-2">
                {data.webhooks.map((w, i) => (
                  <Endpoint key={w.id} w={w} first={i === 0} open={open === w.id} onToggle={() => setOpen(open === w.id ? null : w.id)} onChange={load} t={t} lang={lang} toast={toast} />
                ))}
              </ul>
            </Section>
          )}

          <Section title={t('dev.whVerifyTitle')}>
            <p className="text-sm mb-3" style={{ color: 'var(--text-secondary)' }}>{t('dev.whVerifyText')}</p>
            <CodeBlock text={VERIFY} />
            <p className="text-xs mt-2" style={{ color: 'var(--text-muted)' }}>{t('dev.whRetries')}</p>
          </Section>
        </>
      )}
    </div>
  );
}

/** Error de entrega legible: http_500 → "El servidor respondió HTTP 500". */
export function deliveryError(t, code) {
  const c = String(code || '');
  const m = c.match(/^http_(\d{3})$/);
  if (m) return t('dev.whErr_http', { status: m[1] });
  const map = { timeout: 'timeout', blocked_address: 'blocked', enotfound: 'dns', eai_again: 'dns', econnrefused: 'refused', econnreset: 'refused', endpoint_disabled: 'disabled', payload_expired: 'expired' };
  if (map[c]) return t(`dev.whErr_${map[c]}`);
  if (/cert|tls|ssl/i.test(c)) return t('dev.whErr_tls');
  return t('dev.whErr_other', { code: c || '—' });
}

function Endpoint({ w, first, open, onToggle, onChange, t, lang, toast }) {
  const [busy, setBusy] = useState(null);
  const [secret, setSecret] = useState(null);
  const [confirm, setConfirm] = useState(null); // 'rotate' | 'delete'
  const s = w.last_7_days;

  const act = async (name, fn) => { setBusy(name); const r = await fn(); setBusy(null); return r; };
  const sendTest = async () => {
    const r = await act('test', () => devApi.testWebhook(w.id));
    if (!r.ok) return toast.error(apiErrorMessage(t, r));
    if (r.data.ok) toast.success(t('dev.whTestOk', { status: r.data.status, ms: r.data.ms }));
    else toast.error(t('dev.whTestFail', { error: deliveryError(t, r.data.error) }));
    onChange();
  };
  const reveal = async () => {
    if (secret) return setSecret(null);
    const r = await act('secret', () => devApi.secret(w.id));
    if (r.ok) setSecret(r.data.secret); else toast.error(apiErrorMessage(t, r));
  };
  const rotate = async () => {
    const r = await act('rotate', () => devApi.rotateSecret(w.id));
    setConfirm(null);
    if (r.ok) { setSecret(r.data.secret); toast.success(t('dev.whRotated')); } else toast.error(apiErrorMessage(t, r));
  };
  const setEnabled = async () => {
    const r = await act('enable', () => devApi.updateWebhook(w.id, { enabled: !w.enabled }));
    if (r.ok) onChange(); else toast.error(apiErrorMessage(t, r));
  };
  const remove = async () => {
    const r = await act('delete', () => devApi.deleteWebhook(w.id));
    setConfirm(null);
    if (r.ok) { toast.success(t('dev.whDeleted')); onChange(); } else toast.error(apiErrorMessage(t, r));
  };

  const spin = (name, Icon) => (busy === name ? <Loader2 size={14} className="animate-spin" /> : <Icon size={14} />);
  return (
    <li className="px-2 py-3 flex flex-col gap-2" style={{ borderTop: first ? 'none' : '1px solid var(--border)' }}>
      <div className="flex flex-wrap items-start gap-x-3 gap-y-1">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-mono truncate" style={{ color: 'var(--text-primary)' }} title={w.url}>{w.url}</p>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
            {w.description ? `${w.description} · ` : ''}
            {w.events[0] === '*' ? t('dev.whAllEvents') : w.events.map(ev => t(`dev.ev_${ev.replace('.', '_')}`)).join(', ')}
          </p>
        </div>
        {w.enabled
          ? <Badge tone="positive">{t('dev.whEnabled')}</Badge>
          : <Badge tone="warning">{w.disabled_reason === 'too_many_failures' ? t('dev.whAutoDisabled') : t('dev.whDisabled')}</Badge>}
      </div>
      <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
        {s.deliveries ? t('dev.whStats', { n: s.deliveries, failed: s.failed }) : t('dev.whNoDeliveries')}
        {s.pending ? ` · ${t('dev.whPending', { n: s.pending })}` : ''}
      </p>
      <div className="flex flex-wrap gap-1.5">
        <button onClick={sendTest} disabled={!!busy || !w.enabled} className="btn btn-secondary btn-sm">{spin('test', Send)} {t('dev.whTest')}</button>
        <button onClick={() => { onToggle(); if (!open) onChange(); }} className="btn btn-ghost btn-sm">{open ? <ChevronUp size={14} /> : <ChevronDown size={14} />} {t('dev.whDeliveries')}</button>
        <button onClick={reveal} disabled={!!busy} className="btn btn-ghost btn-sm">{spin('secret', Eye)} {secret ? t('dev.whHideSecret') : t('dev.whShowSecret')}</button>
        <button onClick={() => setConfirm('rotate')} disabled={!!busy} className="btn btn-ghost btn-sm">{spin('rotate', RefreshCw)} {t('dev.whRotate')}</button>
        <button onClick={setEnabled} disabled={!!busy} className="btn btn-ghost btn-sm">{spin('enable', Power)} {w.enabled ? t('dev.whDisable') : t('dev.whEnable')}</button>
        <button onClick={() => setConfirm('delete')} disabled={!!busy} className="btn btn-ghost btn-sm !px-2" aria-label={t('dev.whDelete')} title={t('dev.whDelete')}>{spin('delete', Trash2)}</button>
      </div>
      {secret && <CodeBlock text={secret} label={t('dev.whSecret')} />}
      {open && <Deliveries endpointId={w.id} t={t} lang={lang} toast={toast} onChange={onChange} />}
      {confirm === 'rotate' && <ConfirmModal title={t('dev.whRotate')} text={t('dev.whRotateConfirm')} cta={t('dev.whRotate')} busy={busy === 'rotate'} onConfirm={rotate} onClose={() => setConfirm(null)} />}
      {confirm === 'delete' && <ConfirmModal title={t('dev.whDelete')} text={t('dev.whDeleteConfirm')} cta={t('dev.whDelete')} danger busy={busy === 'delete'} onConfirm={remove} onClose={() => setConfirm(null)} />}
    </li>
  );
}

function Deliveries({ endpointId, t, lang, toast, onChange }) {
  const [list, setList] = useState(null);
  const [busy, setBusy] = useState(null);
  const load = useCallback(async () => {
    const r = await devApi.deliveries({ endpoint_id: endpointId, limit: 30 });
    setList(r.ok ? r.data.deliveries : []);
  }, [endpointId]);
  useEffect(() => { load(); }, [load]);

  const resend = async (d) => {
    setBusy(d.id);
    const r = await devApi.resend(d.id);
    setBusy(null);
    if (!r.ok) return toast.error(apiErrorMessage(t, r));
    if (r.data.ok) toast.success(t('dev.whTestOk', { status: r.data.status, ms: r.data.ms })); else toast.error(t('dev.whTestFail', { error: deliveryError(t, r.data.error) }));
    load(); onChange();
  };

  if (!list) return <Skeleton className="h-16" />;
  if (!list.length) return <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{t('dev.whNoDeliveries')}</p>;
  return (
    <ul className="rounded-lg text-xs" style={{ background: 'var(--surface-2)' }}>
      {list.map((d, i) => {
        const next = d.next_attempt_at ? parseDbDate(d.next_attempt_at) : null;
        return (
          <li key={d.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2" style={{ borderTop: i ? '1px solid var(--border)' : 'none' }}>
            <code className="min-w-[9rem]" style={{ color: 'var(--text-primary)' }}>{d.event_type}</code>
            {d.status === 'delivered' && <Badge tone="positive">{t('dev.whDelivered')}</Badge>}
            {d.status === 'pending' && <Badge tone="warning">{next ? t('dev.whRetryAt', { time: formatTime(next, lang) }) : t('dev.whPendingOne')}</Badge>}
            {d.status === 'failed' && <Badge tone="negative">{t('dev.whFailed')}</Badge>}
            {!d.livemode && <Badge tone="accent">{t('dev.testBadge')}</Badge>}
            <span style={{ color: 'var(--text-muted)' }}>
              {d.status === 'delivered' ? `HTTP ${d.last_status}` : d.last_error ? deliveryError(t, d.last_error) : ''}{d.last_ms != null ? ` · ${d.last_ms} ms` : ''} · {t('dev.whAttempts', { n: d.attempts })}
            </span>
            <span className="flex-1 text-right tabular" style={{ color: 'var(--text-muted)' }}>{shortDateTime(d.created_at, lang)}</span>
            {d.resendable && d.status !== 'pending' && (
              <button onClick={() => resend(d)} disabled={busy === d.id} className="btn btn-ghost btn-sm !h-7">{busy === d.id ? <Loader2 size={13} className="animate-spin" /> : <RotateCw size={13} />} {t('dev.whResend')}</button>
            )}
          </li>
        );
      })}
    </ul>
  );
}
