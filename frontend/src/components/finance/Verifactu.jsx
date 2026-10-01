import { useState, useEffect, useCallback } from 'react';
import { ShieldCheck, Loader2, RefreshCw, Link2, AlertTriangle, Wrench } from 'lucide-react';
import { invoicingApi } from '../../middleware/api';
import { useLang } from '../../context/LangContext';
import { useToast } from '../../context/ToastContext';
import { Modal, ErrorBox, Notice, Kpi, Segmented, Badge } from '../ui';
import Skeleton from '../Skeleton';
import { invoiceError, verifactuState } from './invoiceUtils';
import { isoDate } from '../../utils/money';

/**
 * Sesión 11 (tanda 4): estado de VERI*FACTU — registros de facturación con
 * huella encadenada, su envío a la AEAT (o el aviso de que está desactivado),
 * subsanación de los rechazados y comprobación de la cadena.
 */
export default function Verifactu({ onClose, onOpenInvoice }) {
  const { t, lang } = useLang();
  const toast = useToast();
  const [filter, setFilter] = useState('all');
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(null); // id del registro, 'retry' o 'chain'
  const [chain, setChain] = useState(null);

  const load = useCallback(async () => {
    const res = await invoicingApi.verifactu(filter);
    if (res.ok) setData(res.data); else setError(invoiceError(t, res));
  }, [filter, t]);
  useEffect(() => { load(); }, [load]);

  const resubmit = async (id) => {
    setBusy(id); setError(null);
    const res = await invoicingApi.verifactuResubmit(id);
    setBusy(null);
    if (!res.ok) { setError(invoiceError(t, res)); return; }
    toast.success(t('verifactu.resubmitted'));
    load();
  };
  const retry = async () => {
    setBusy('retry');
    const res = await invoicingApi.verifactuRetry();
    setBusy(null);
    if (res.ok) { toast.success(t('verifactu.retried')); load(); } else setError(invoiceError(t, res));
  };
  const checkChain = async () => {
    setBusy('chain');
    const res = await invoicingApi.verifactuChain();
    setBusy(null);
    if (res.ok) setChain(res.data); else setError(invoiceError(t, res));
  };

  const s = data?.summary;
  const lastError = data?.records.find(r => r.status === 'pending' && r.last_error)?.last_error;

  return (
    <Modal title={t('verifactu.title')} onClose={onClose} wide footer={<>
      <button onClick={checkChain} disabled={busy === 'chain' || !s?.total} className="btn btn-secondary sm:mr-auto">
        {busy === 'chain' ? <Loader2 size={15} className="animate-spin" /> : <Link2 size={15} />} {t('verifactu.checkChain')}
      </button>
      <button onClick={onClose} className="btn btn-primary">{t('common.close')}</button>
    </>}>
      <div className="flex flex-col gap-4 text-sm">
        <p style={{ color: 'var(--text-secondary)' }}>{t('verifactu.intro')}</p>
        {data && (
          <Notice tone={data.env === 'off' ? 'info' : data.sending ? 'positive' : 'warning'} icon={data.env === 'off' || data.sending ? ShieldCheck : AlertTriangle}>
            {data.env === 'off' || !data.enabled ? t('verifactu.env.off') : t(`verifactu.env.${data.env}`)}
            {data.enabled && data.reason && data.reason !== 'disabled' && <span className="block mt-1">{t(`verifactu.reason.${data.reason}`)}</span>}
          </Notice>
        )}
        {chain && (
          <Notice tone={chain.ok ? 'positive' : 'warning'} icon={chain.ok ? ShieldCheck : AlertTriangle}>
            {chain.ok ? t('verifactu.chainOk', { n: chain.count }) : t('verifactu.chainBroken', { id: chain.id })}
          </Notice>
        )}
        {s && s.total > 0 && (
          <div className="grid grid-cols-3 gap-2 sm:gap-3">
            <Kpi label={t('verifactu.kpi.accepted')} value={String(s.accepted)} />
            <Kpi label={t('verifactu.kpi.pending')} value={String(s.pending)} />
            <Kpi label={t('verifactu.kpi.errors')} value={String(s.errors)} tone={s.errors ? 'var(--negative)' : undefined} />
          </div>
        )}
        {lastError && data.sending && (
          <div className="flex flex-wrap items-center gap-2 rounded-xl px-3 py-2" style={{ background: 'var(--warning-soft)' }}>
            <span className="text-xs mr-auto break-all" style={{ color: 'var(--text-primary)' }}>{t('verifactu.lastError', { e: lastError })}</span>
            <button onClick={retry} disabled={busy === 'retry'} className="btn btn-secondary btn-sm">
              {busy === 'retry' ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} {t('verifactu.retry')}
            </button>
          </div>
        )}
        {s && s.total > 0 && (
          <Segmented value={filter} onChange={setFilter} size="sm" options={['all', 'pending', 'sent', 'errors'].map(v => ({ value: v, label: t(`verifactu.filter.${v}`) }))} />
        )}
        {error && <ErrorBox>{error}</ErrorBox>}
        {!data ? (
          <div className="flex flex-col gap-2">{[0, 1, 2].map(i => <Skeleton key={i} className="h-10" />)}</div>
        ) : data.records.length === 0 ? (
          <p className="py-6 text-center" style={{ color: 'var(--text-secondary)' }}>{s.total ? t('history.noResults') : t('verifactu.empty')}</p>
        ) : (
          <ul className="flex flex-col -mx-1">
            {data.records.map(r => {
              const st = verifactuState(r);
              const fixable = r.type === 'alta' && ['rejected', 'accepted_errors'].includes(r.status) && !r.fixed_by;
              return (
                <li key={r.id} className="flex items-start gap-2 sm:gap-3 px-1 py-2.5" style={{ borderTop: '1px solid var(--border)' }}>
                  <div className="flex-1 min-w-0">
                    <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <button onClick={() => onOpenInvoice(r.invoice_id)} className="font-medium hover:underline" style={{ color: 'var(--text-primary)' }}>{r.number}</button>
                      <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{t(`verifactu.type.${r.type}`)} · #{r.id} · {isoDate(r.generated_at.slice(0, 10), lang)}</span>
                    </p>
                    <p className="text-[11px] font-mono truncate" style={{ color: 'var(--text-muted)' }} title={r.hash}>{t('verifactu.hash')} {r.hash.slice(0, 16)}…</p>
                    {r.error_message && <p className="text-xs mt-0.5" style={{ color: r.status === 'rejected' ? 'var(--negative)' : 'var(--text-secondary)' }}>{r.error_code} · {r.error_message}</p>}
                    {r.fixed_by && <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{t('verifactu.fixedBy', { id: r.fixed_by })}</p>}
                  </div>
                  <div className="flex flex-col items-end gap-1.5 shrink-0">
                    <Badge tone={st.tone}>{t(`verifactu.status.${st.key}`)}</Badge>
                    {fixable && (
                      <button onClick={() => resubmit(r.id)} disabled={busy === r.id} className="btn btn-secondary btn-sm">
                        {busy === r.id ? <Loader2 size={14} className="animate-spin" /> : <Wrench size={14} />} {t('verifactu.resubmit')}
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Modal>
  );
}
