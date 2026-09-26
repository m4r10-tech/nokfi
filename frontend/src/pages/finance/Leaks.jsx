import { useState, useEffect, useCallback } from 'react';
import { Droplets, TrendingUp, Copy as CopyIcon, Repeat, Trash2 } from 'lucide-react';
import { financeApi, ledgerApi } from '../../middleware/api';
import { apiErrorMessage, isConnectivityError } from '../../middleware/errors';
import { useLang } from '../../context/LangContext';
import { useToast } from '../../context/ToastContext';
import ErrorState from '../../components/ErrorState';
import EmptyState from '../../components/EmptyState';
import Skeleton from '../../components/Skeleton';
import { Section, Badge } from '../../components/ui';
import { eur, isoDate, num } from '../../utils/money';

/**
 * V5 — Detector de dinero que se escapa (sesión 4): suscripciones y gastos
 * recurrentes, cargos duplicados y subidas de precio de proveedores, sobre
 * los gastos del libro. El contador "te ha ayudado a detectar X € este mes"
 * suma SOLO importes identificados (duplicados + sobrecoste de subidas de
 * este mes), nunca ahorros supuestos.
 */
export default function Leaks() {
  const { t, lang } = useLang();
  const toast = useToast();
  const [data, setData] = useState(null);
  const [failure, setFailure] = useState(null);

  const load = useCallback(async () => {
    setFailure(null);
    const res = await financeApi.leaks();
    if (res.ok) setData(res.data); else setFailure(res);
  }, []);
  useEffect(() => { load(); }, [load]);

  const removeDuplicate = async (d) => {
    if (!window.confirm(t('finance.leaks.confirmRemove'))) return;
    const res = await ledgerApi.remove(d.id);
    if (res.ok) { toast.success(t('finance.deleted')); load(); } else toast.error(apiErrorMessage(t, res));
  };

  if (failure) return <ErrorState offline={isConnectivityError(failure)} message={apiErrorMessage(t, failure)} onRetry={load} />;
  if (!data) return <div className="grid gap-3"><Skeleton className="h-28" /><Skeleton className="h-40" /></div>;

  const nothing = !data.recurring.length && !data.increases.length && !data.duplicates.length;

  return (
    <div className="flex flex-col gap-4">
      <section className="card p-5 flex items-center gap-4" style={{ borderColor: 'var(--border-strong)' }}>
        <span className="w-11 h-11 rounded-xl grid place-items-center shrink-0" style={{ background: 'var(--positive-soft)', color: 'var(--positive)' }}><Droplets size={20} /></span>
        <div className="min-w-0">
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{t('finance.leaks.counter')}</p>
          <p className="text-2xl font-semibold tabular" style={{ color: 'var(--text-primary)' }}>{eur(data.detected_this_month, lang)}</p>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{t('finance.leaks.counterNote')}</p>
        </div>
      </section>

      {nothing ? (
        <EmptyState icon={Droplets} title={t('finance.leaks.emptyTitle')} description={t('finance.leaks.emptyDesc')} />
      ) : (
        <>
          {data.increases.length > 0 && (
            <Section title={t('finance.leaks.increases')}>
              <ul className="flex flex-col gap-2">
                {data.increases.map((x, i) => (
                  <li key={i} className="rounded-xl p-3 flex items-start gap-3" style={{ background: 'var(--surface-2)' }}>
                    <TrendingUp size={17} className="mt-0.5 shrink-0" style={{ color: 'var(--negative)' }} />
                    <div className="flex-1 min-w-0 text-sm">
                      <p style={{ color: 'var(--text-primary)' }}>
                        {t('finance.leaks.increaseLine').replace('{name}', x.party_name).replace('{pct}', num(x.pct, lang, 1)).replace('{since}', isoDate(x.since, lang, { month: 'short', year: 'numeric' }))}
                      </p>
                      <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                        {eur(x.from, lang)} → {eur(x.to, lang)} · {t('finance.leaks.extraPerMonth').replace('{v}', eur(x.monthly_extra, lang))}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {data.duplicates.length > 0 && (
            <Section title={t('finance.leaks.duplicates')}>
              <ul className="flex flex-col gap-2">
                {data.duplicates.map((d, i) => (
                  <li key={i} className="rounded-xl p-3 flex items-center gap-3" style={{ background: 'var(--surface-2)' }}>
                    <CopyIcon size={16} className="shrink-0" style={{ color: 'var(--warning)' }} />
                    <div className="flex-1 min-w-0 text-sm">
                      <p className="truncate" style={{ color: 'var(--text-primary)' }}>{d.party_name} · {eur(d.total, lang)}</p>
                      <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                        {isoDate(d.invoice_date, lang)} · {t(d.reason === 'same_number' ? 'finance.leaks.sameNumber' : 'finance.leaks.sameAmount')}
                      </p>
                    </div>
                    <button onClick={() => removeDuplicate(d)} className="btn btn-ghost btn-sm"><Trash2 size={14} /> {t('finance.leaks.removeEntry')}</button>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {data.recurring.length > 0 && (
            <Section title={t('finance.leaks.recurring')} aside={<Badge tone="accent">{t('finance.leaks.perMonth').replace('{v}', eur(data.recurring_monthly_total, lang))}</Badge>}>
              <ul className="flex flex-col -mx-2">
                {data.recurring.map((r, i) => (
                  <li key={i} className="flex items-center gap-3 px-2 py-2.5" style={{ borderTop: i ? '1px solid var(--border)' : 'none' }}>
                    <Repeat size={15} className="shrink-0" style={{ color: 'var(--accent-text)' }} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm truncate" style={{ color: 'var(--text-primary)' }}>{r.party_name}</p>
                      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{t('finance.leaks.months').replace('{n}', r.months)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold tabular" style={{ color: 'var(--text-primary)' }}>{eur(r.monthly, lang)}</p>
                      <p className="text-xs tabular" style={{ color: 'var(--text-muted)' }}>{t('finance.leaks.perYear').replace('{v}', eur(r.yearly, lang))}</p>
                    </div>
                  </li>
                ))}
              </ul>
              <p className="text-xs mt-3" style={{ color: 'var(--text-muted)' }}>{t('finance.leaks.recurringHint')}</p>
            </Section>
          )}
        </>
      )}
    </div>
  );
}
