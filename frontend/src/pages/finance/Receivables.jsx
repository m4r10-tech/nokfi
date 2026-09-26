import { useState, useEffect, useCallback } from 'react';
import { HandCoins, Mail, Check, Loader2, Copy } from 'lucide-react';
import { financeApi, ledgerApi } from '../../middleware/api';
import { apiErrorMessage, isConnectivityError } from '../../middleware/errors';
import { useLang } from '../../context/LangContext';
import { useToast } from '../../context/ToastContext';
import ErrorState from '../../components/ErrorState';
import EmptyState from '../../components/EmptyState';
import Skeleton from '../../components/Skeleton';
import { Section, Kpi, Segmented, Modal, Badge, ErrorBox } from '../../components/ui';
import { eur, isoDate } from '../../utils/money';

/**
 * V4 — Cobros pendientes y morosos (sesión 4). Facturas emitidas sin cobrar
 * (del libro), días de retraso, días medios de cobro por cliente y un email
 * de reclamación redactado por la IA (tono: amable → firme → formal), listo
 * para copiar o abrir en el correo. El email lo genera el asistente gratuito
 * (no gasta cuota de análisis).
 */
const LEVEL_TONE = { ok: 'muted', medium: 'warning', high: 'negative', critical: 'negative' };

export default function Receivables() {
  const { t, lang } = useLang();
  const toast = useToast();
  const [data, setData] = useState(null);
  const [failure, setFailure] = useState(null);
  const [emailFor, setEmailFor] = useState(null);

  const load = useCallback(async () => {
    setFailure(null);
    const res = await financeApi.receivables();
    if (res.ok) setData(res.data); else setFailure(res);
  }, []);
  useEffect(() => { load(); }, [load]);

  const markCollected = async (p) => {
    const res = await ledgerApi.update(p.id, { paid: true });
    if (res.ok) { toast.success(t('finance.receivables.collectedToast')); load(); } else toast.error(apiErrorMessage(t, res));
  };

  if (failure) return <ErrorState offline={isConnectivityError(failure)} message={apiErrorMessage(t, failure)} onRetry={load} />;
  if (!data) return <div className="grid gap-3"><Skeleton className="h-24" /><Skeleton className="h-48" /></div>;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-3">
        <Kpi label={t('finance.receivables.pending')} value={eur(data.total, lang)} hint={t('finance.receivables.invoices').replace('{n}', data.pending.length)} />
        <Kpi label={t('finance.receivables.overdue60')} value={eur(data.overdue_60, lang)} tone={data.overdue_60 > 0 ? 'var(--negative)' : undefined} />
        <Kpi className="col-span-2 lg:col-span-1" label={t('finance.receivables.avgDays')} value={data.avg_collection_days == null ? '—' : t('finance.days').replace('{n}', data.avg_collection_days)} />
      </div>

      {data.pending.length === 0 ? (
        <EmptyState icon={HandCoins} title={t('finance.receivables.emptyTitle')} description={t('finance.receivables.emptyDesc')} />
      ) : (
        <Section title={t('finance.receivables.listTitle')}>
          <ul className="flex flex-col -mx-2">
            {data.pending.map(p => (
              <li key={p.id} className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 px-2 py-3" style={{ borderTop: '1px solid var(--border)' }}>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>{p.party_name || p.party_nif || '—'}</p>
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    {p.invoice_number ? `${p.invoice_number} · ` : ''}{isoDate(p.invoice_date, lang)}
                    {p.client_avg_days != null && ` · ${t('finance.receivables.clientAvg').replace('{n}', p.client_avg_days)}`}
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge tone={LEVEL_TONE[p.level]}>{t('finance.receivables.age').replace('{n}', p.days_outstanding)}</Badge>
                  <span className="text-sm font-semibold tabular" style={{ color: 'var(--text-primary)' }}>{eur(p.total, lang)}</span>
                  <button onClick={() => setEmailFor(p)} className="btn btn-secondary btn-sm"><Mail size={14} /> {t('finance.receivables.claim')}</button>
                  <button onClick={() => markCollected(p)} className="btn btn-ghost btn-sm"><Check size={14} /> {t('finance.collected')}</button>
                </div>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {emailFor && <ClaimEmail item={emailFor} onClose={() => setEmailFor(null)} />}
    </div>
  );
}

function ClaimEmail({ item, onClose }) {
  const { t, lang } = useLang();
  const toast = useToast();
  const [tone, setTone] = useState(item.days_outstanding > 60 ? 'formal' : item.days_outstanding > 30 ? 'firm' : 'friendly');
  const [draft, setDraft] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const generate = async () => {
    setLoading(true); setError(null);
    const res = await financeApi.collectionEmail(item.id, tone, lang);
    setLoading(false);
    if (res.ok) setDraft(res.data); else setError(apiErrorMessage(t, res));
  };
  useEffect(() => { generate(); }, [tone]); // eslint-disable-line react-hooks/exhaustive-deps

  const copy = async () => {
    try { await navigator.clipboard.writeText(`${draft.subject}\n\n${draft.body}`); toast.success(t('common.copied')); } catch { /* sin portapapeles */ }
  };
  const mailto = draft ? `mailto:?subject=${encodeURIComponent(draft.subject)}&body=${encodeURIComponent(draft.body)}` : '#';

  return (
    <Modal title={t('finance.receivables.claimTitle').replace('{name}', item.party_name || '')} onClose={onClose} wide
      footer={draft && <>
        <button onClick={copy} className="btn btn-secondary"><Copy size={15} /> {t('common.copy')}</button>
        <a href={mailto} className="btn btn-primary"><Mail size={15} /> {t('finance.receivables.openMail')}</a>
      </>}>
      <div className="flex flex-col gap-3">
        <Segmented value={tone} onChange={setTone} size="sm" options={[
          { value: 'friendly', label: t('finance.receivables.toneFriendly') },
          { value: 'firm', label: t('finance.receivables.toneFirm') },
          { value: 'formal', label: t('finance.receivables.toneFormal') }
        ]} />
        {loading && <p className="text-sm flex items-center gap-2" style={{ color: 'var(--text-secondary)' }}><Loader2 size={15} className="animate-spin" /> {t('finance.receivables.writing')}</p>}
        {error && <ErrorBox>{error}</ErrorBox>}
        {draft && !loading && (
          <>
            <input value={draft.subject} onChange={(e) => setDraft(d => ({ ...d, subject: e.target.value }))} className="input font-medium" aria-label={t('finance.receivables.subject')} />
            <textarea value={draft.body} onChange={(e) => setDraft(d => ({ ...d, body: e.target.value }))} rows={12} className="input resize-y !leading-relaxed" aria-label={t('finance.receivables.body')} />
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{t('finance.receivables.reviewNote')}</p>
          </>
        )}
      </div>
    </Modal>
  );
}
