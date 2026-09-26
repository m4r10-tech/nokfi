import { useState, useEffect, useCallback } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import { BarChart3, Info, ExternalLink, CheckCircle2, AlertTriangle, Minus } from 'lucide-react';
import { financeApi } from '../../middleware/api';
import { apiErrorMessage, isConnectivityError } from '../../middleware/errors';
import { useLang } from '../../context/LangContext';
import ErrorState from '../../components/ErrorState';
import EmptyState from '../../components/EmptyState';
import Skeleton from '../../components/Skeleton';
import { Section, Notice, Badge } from '../../components/ui';
import { eur, num, isoDate } from '../../utils/money';

/**
 * V7 — Comparación con tu sector (sesión 4). Referencias REALES del INE
 * (Estadística Estructural de Empresas), con fuente y año visibles, frente a
 * las cifras de tu libro de los últimos 12 meses. Si el sector no está
 * cubierto, se dice: nunca cifras inventadas.
 */
const VERDICT = {
  better: { tone: 'positive', icon: CheckCircle2 },
  similar: { tone: 'muted', icon: Minus },
  worse: { tone: 'warning', icon: AlertTriangle }
};

export default function Benchmark() {
  const { profile } = useOutletContext();
  const { t, lang } = useLang();
  const [data, setData] = useState(null);
  const [failure, setFailure] = useState(null);

  const load = useCallback(async () => {
    setFailure(null);
    const res = await financeApi.benchmark();
    if (res.ok) setData(res.data); else setFailure(res);
  }, []);
  useEffect(() => { load(); }, [load, profile.sector, profile.size]);

  if (failure) return <ErrorState offline={isConnectivityError(failure)} message={apiErrorMessage(t, failure)} onRetry={load} />;
  if (!data) return <div className="grid gap-3"><Skeleton className="h-24" /><Skeleton className="h-56" /></div>;

  const source = data.source;
  const sourceLine = (
    <p className="text-xs flex flex-wrap items-center gap-1" style={{ color: 'var(--text-muted)' }}>
      {t('finance.bench.source').replace('{name}', source.name).replace('{year}', source.year)}
      <a href={source.url} target="_blank" rel="noopener noreferrer" className="link inline-flex items-center gap-0.5">INE <ExternalLink size={11} /></a>
    </p>
  );

  if (!data.available) {
    return (
      <div className="flex flex-col gap-4">
        <EmptyState icon={BarChart3}
          title={t(data.reason === 'missing_profile' ? 'finance.bench.missingTitle' : 'finance.bench.notCoveredTitle')}
          description={t(data.reason === 'missing_profile' ? 'finance.bench.missingDesc' : 'finance.bench.notCoveredDesc')}>
          <Link to="/app/configuracion" className="btn btn-secondary">{t('nav.settings')}</Link>
        </EmptyState>
        {sourceLine}
      </div>
    );
  }

  const ref = data.reference;
  const y = data.yours;
  return (
    <div className="flex flex-col gap-4">
      <Section title={t('finance.bench.title')}>
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          {t('finance.bench.comparing')
            .replace('{activity}', ref.activity).replace('{cnae}', ref.cnae)
            .replace('{size}', t(`finance.bench.size_${ref.size}`))}
        </p>
        {!y.available && <div className="mt-3"><Notice icon={Info}>{t('finance.bench.noLedger')}</Notice></div>}

        <div className="mt-4 overflow-x-auto -mx-4 sm:mx-0">
          <table className="w-full text-sm min-w-[480px]">
            <thead>
              <tr className="text-left text-xs" style={{ color: 'var(--text-muted)' }}>
                <th className="p-2 font-medium">{t('finance.bench.metric')}</th>
                <th className="p-2 font-medium text-right">{t('finance.bench.yours')}</th>
                <th className="p-2 font-medium text-right">{t('finance.bench.sector')}</th>
                <th className="p-2" />
              </tr>
            </thead>
            <tbody>
              {data.metrics.map(m => {
                const v = m.verdict && VERDICT[m.verdict];
                const Icon = v?.icon;
                return (
                  <tr key={m.key} style={{ borderTop: '1px solid var(--border)' }}>
                    <td className="p-2">
                      <span className="block font-medium" style={{ color: 'var(--text-primary)' }}>{t(`finance.bench.m_${m.key}`)}</span>
                      <span className="block text-xs" style={{ color: 'var(--text-muted)' }}>{t(`finance.bench.h_${m.key}`)}</span>
                    </td>
                    <td className="p-2 text-right tabular font-semibold" style={{ color: 'var(--text-primary)' }}>{m.yours == null ? '—' : `${num(m.yours, lang, 1)} %`}</td>
                    <td className="p-2 text-right tabular" style={{ color: 'var(--text-secondary)' }}>{m.sector == null ? '—' : `${num(m.sector, lang, 1)} %`}</td>
                    <td className="p-2 text-right">{v && <Badge tone={v.tone}><Icon size={11} /> {t(`finance.bench.v_${m.verdict}_${m.higher_is_better ? 'up' : 'down'}`)}</Badge>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {y.available && (
          <p className="text-xs mt-3" style={{ color: 'var(--text-muted)' }}>
            {t('finance.bench.period').replace('{from}', isoDate(y.from, lang)).replace('{to}', isoDate(y.to, lang)).replace('{v}', eur(y.income, lang, { decimals: 0 }))}
          </p>
        )}
      </Section>

      {data.revenue_per_company_eur != null && (
        <Section title={t('finance.bench.contextTitle')}>
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            {t('finance.bench.revenuePerCompany').replace('{v}', eur(data.revenue_per_company_eur, lang, { decimals: 0 })).replace('{n}', num(ref.companies, lang, 0))}
          </p>
        </Section>
      )}

      <Notice icon={Info}>
        {t('finance.bench.limits')}
        {data.owner_pay_included && <> {t('finance.bench.ownerPay')}</>}
      </Notice>
      {sourceLine}
    </div>
  );
}
