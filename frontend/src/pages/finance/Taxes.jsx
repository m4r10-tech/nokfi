import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Landmark, PiggyBank, Loader2, CalendarDays, Info } from 'lucide-react';
import { financeApi } from '../../middleware/api';
import { apiErrorMessage, isConnectivityError } from '../../middleware/errors';
import { useLang } from '../../context/LangContext';
import { useToast } from '../../context/ToastContext';
import ErrorState from '../../components/ErrorState';
import Skeleton from '../../components/Skeleton';
import { Section, Kpi, Segmented, Notice } from '../../components/ui';
import { eur, isoDate, currentQuarter } from '../../utils/money';

/**
 * V2 — Cuánto apartar para Hacienda (sesión 4). Estimación del IVA trimestral
 * (303: repercutido − soportado) y del pago fraccionado de IRPF (130: 20 % del
 * rendimiento neto acumulado − pagos anteriores − retenciones). SIEMPRE como
 * estimación orientativa: no es asesoramiento fiscal. Régimen general.
 */
export default function Taxes() {
  const { t, lang } = useLang();
  const toast = useToast();
  const cq = currentQuarter();
  const [year, setYear] = useState(cq.year);
  const [quarter, setQuarter] = useState(cq.quarter);
  const [data, setData] = useState(null);
  const [failure, setFailure] = useState(null);
  const [reserve, setReserve] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setFailure(null); setData(null);
    const res = await financeApi.taxes(year, quarter);
    if (res.ok) { setData(res.data); setReserve(String(res.data.summary.reserved || '')); }
    else setFailure(res);
  }, [year, quarter]);
  useEffect(() => { load(); }, [load]);

  const saveReserve = async (e) => {
    e.preventDefault();
    setSaving(true);
    const res = await financeApi.setReserve(year, quarter, Number(reserve) || 0);
    setSaving(false);
    if (res.ok) { toast.success(t('config.saved')); load(); } else toast.error(apiErrorMessage(t, res));
  };

  if (failure) return <ErrorState offline={isConnectivityError(failure)} message={apiErrorMessage(t, failure)} onRetry={load} />;

  const s = data?.summary;
  const pct = s && s.total_estimated > 0 ? Math.min(100, (s.reserved / s.total_estimated) * 100) : 100;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <select value={year} onChange={(e) => setYear(Number(e.target.value))} className="input !w-auto !h-9 text-sm" aria-label={t('finance.year')}>
          {[cq.year, cq.year - 1, cq.year - 2].map(y => <option key={y} value={y}>{y}</option>)}
        </select>
        <Segmented value={quarter} onChange={setQuarter} size="sm" label={t('finance.quarter')}
          options={[1, 2, 3, 4].map(n => ({ value: n, label: `${n}T` }))} />
      </div>

      {!data ? (
        <div className="grid sm:grid-cols-2 gap-3"><Skeleton className="h-40" /><Skeleton className="h-40" /></div>
      ) : (
        <>
          {!data.legal_form && (
            <Notice icon={Info}>{t('finance.taxes.noLegalForm')} <Link to="/app/configuracion" className="link">{t('nav.settings')}</Link></Notice>
          )}

          <section className="card p-5 md:p-6 flex flex-col gap-4" style={{ borderColor: 'var(--border-strong)' }}>
            <div className="flex items-start gap-3">
              <span className="w-10 h-10 rounded-xl grid place-items-center shrink-0" style={{ background: 'var(--accent-soft)', color: 'var(--accent-text)' }}><PiggyBank size={19} /></span>
              <div className="min-w-0">
                <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{t('finance.taxes.headline').replace('{q}', `${quarter}T ${year}`)}</p>
                <p className="text-3xl font-semibold tabular tracking-tight mt-1" style={{ color: 'var(--text-primary)' }}>≈ {eur(s.total_estimated, lang)}</p>
                <p className="text-xs mt-1 flex items-center gap-1.5" style={{ color: 'var(--text-muted)' }}>
                  <CalendarDays size={12} /> {t('finance.taxes.dueBy').replace('{date}', isoDate(s.due_date, lang, { day: 'numeric', month: 'long', year: 'numeric' }))}
                </p>
              </div>
            </div>
            <div>
              <div className="flex justify-between text-xs mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                <span>{t('finance.taxes.reserved').replace('{v}', eur(s.reserved, lang))}</span>
                <span className="tabular">{s.missing > 0 ? t('finance.taxes.missing').replace('{v}', eur(s.missing, lang)) : t('finance.taxes.covered')}</span>
              </div>
              <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--surface-2)' }}>
                <div className="h-full rounded-full" style={{ width: `${pct}%`, background: pct >= 100 ? 'var(--positive)' : 'var(--warning)', transition: 'width 600ms var(--ease-out)' }} />
              </div>
            </div>
            <form onSubmit={saveReserve} className="flex flex-col sm:flex-row gap-2 sm:items-end">
              <label className="flex-1">
                <span className="field-label">{t('finance.taxes.setAside')}</span>
                <input type="number" min="0" step="0.01" inputMode="decimal" value={reserve} onChange={(e) => setReserve(e.target.value)} className="input" />
              </label>
              <button type="submit" disabled={saving} className="btn btn-secondary">{saving && <Loader2 size={14} className="animate-spin" />} {t('common.save')}</button>
            </form>
            {s.vat_refund > 0 && <Notice tone="positive">{t(quarter === 4 ? 'finance.taxes.vatRefund' : 'finance.taxes.vatCompensate', { v: eur(s.vat_refund, lang) })}</Notice>}
          </section>

          <div className="grid md:grid-cols-2 gap-4">
            <Section title={t('finance.taxes.vatTitle')}>
              <div className="grid grid-cols-2 gap-2">
                <Kpi label={t('finance.taxes.vatOutput')} value={eur(s.vat.output, lang)} />
                <Kpi label={t('finance.taxes.vatInput')} value={eur(s.vat.input, lang)} />
              </div>
              <Row label={t('finance.taxes.result')} value={eur(s.vat.result, lang)} strong />
              <p className="text-xs mt-2" style={{ color: 'var(--text-muted)' }}>{t('finance.taxes.vatExplain')}</p>
            </Section>
            {s.irpf130 ? (
              <Section title={t('finance.taxes.irpfTitle')}>
                <Row label={t('finance.taxes.accIncome')} value={eur(s.irpf130.income, lang)} />
                <Row label={t('finance.taxes.accExpense')} value={eur(s.irpf130.expense, lang)} />
                <Row label={t('finance.taxes.netIncome')} value={eur(s.irpf130.net, lang)} />
                <Row label={t('finance.taxes.twentyPct')} value={eur(s.irpf130.gross, lang)} />
                <Row label={t('finance.taxes.prevPayments')} value={`− ${eur(s.irpf130.previous_payments, lang)}`} />
                <Row label={t('finance.taxes.withholdings')} value={`− ${eur(s.irpf130.withholdings, lang)}`} />
                <Row label={t('finance.taxes.result')} value={eur(s.irpf130.result, lang)} strong />
              </Section>
            ) : (
              <Section title={t('finance.taxes.irpfTitle')}>
                <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{t('finance.taxes.companyNote')}</p>
              </Section>
            )}
          </div>
          <Notice icon={Landmark}>{t('finance.taxes.legal')}</Notice>
        </>
      )}
    </div>
  );
}

function Row({ label, value, strong }) {
  return (
    <div className="flex justify-between gap-3 py-1.5 text-sm" style={{ borderTop: strong ? '1px solid var(--border)' : 'none', marginTop: strong ? 6 : 0 }}>
      <span style={{ color: strong ? 'var(--text-primary)' : 'var(--text-secondary)', fontWeight: strong ? 600 : 400 }}>{label}</span>
      <span className="tabular" style={{ color: 'var(--text-primary)', fontWeight: strong ? 600 : 400 }}>{value}</span>
    </div>
  );
}
