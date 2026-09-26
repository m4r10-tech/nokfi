import { useState, useEffect, useCallback } from 'react';
import { useOutletContext } from 'react-router-dom';
import { AlertTriangle, Wallet, CheckCircle2 } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { financeApi } from '../../middleware/api';
import { apiErrorMessage, isConnectivityError } from '../../middleware/errors';
import { useLang } from '../../context/LangContext';
import ErrorState from '../../components/ErrorState';
import Skeleton from '../../components/Skeleton';
import { Section, Kpi, Segmented, Notice, Field } from '../../components/ui';
import { eur, isoDate } from '../../utils/money';

/**
 * V3 — Previsión de caja a 30/60/90 días con escenarios (sesión 4).
 * Saldo actual (manual) + cobros pendientes (V4) − pagos pendientes −
 * gastos recurrentes (V5) − impuestos previstos (V2) → curva y aviso
 * "el día X bajas de Y €". Cálculo determinista en el backend.
 * Escenarios: contratar (coste mensual), retraso de cobros, ingresos extra.
 */
export default function Forecast() {
  const { profile, updateProfile } = useOutletContext();
  const { t, lang } = useLang();
  const [days, setDays] = useState(90);
  const [scenario, setScenario] = useState({ hire: '', delay: '', extra: '' });
  const [applied, setApplied] = useState({});
  const [data, setData] = useState(null);
  const [failure, setFailure] = useState(null);
  const [balance, setBalance] = useState('');
  const [threshold, setThreshold] = useState('');

  const load = useCallback(async () => {
    setFailure(null);
    const res = await financeApi.forecast({ days, ...applied });
    if (res.ok) setData(res.data); else setFailure(res);
  }, [days, applied]);
  useEffect(() => { load(); }, [load, profile.cashBalance, profile.cashAlertThreshold]);
  useEffect(() => {
    setBalance(profile.cashBalance ?? '');
    setThreshold(profile.cashAlertThreshold || '');
  }, [profile.cashBalance, profile.cashAlertThreshold]);

  const saveBalance = (e) => {
    e.preventDefault();
    updateProfile({ cashBalance: balance === '' ? null : Number(balance), cashAlertThreshold: Number(threshold) || 0 });
    setTimeout(load, 900); // el perfil se guarda con debounce (600 ms)
  };

  if (failure) return <ErrorState offline={isConnectivityError(failure)} message={apiErrorMessage(t, failure)} onRetry={load} />;

  const balanceForm = (
    <form onSubmit={saveBalance} className="grid sm:grid-cols-[1fr_1fr_auto] gap-2 sm:items-end">
      <Field label={t('finance.forecast.balance')} htmlFor="fc-balance">
        <input id="fc-balance" type="number" step="0.01" inputMode="decimal" value={balance} onChange={(e) => setBalance(e.target.value)} className="input" required />
      </Field>
      <Field label={t('finance.forecast.threshold')} htmlFor="fc-threshold">
        <input id="fc-threshold" type="number" min="0" step="1" inputMode="decimal" value={threshold} onChange={(e) => setThreshold(e.target.value)} className="input" />
      </Field>
      <button type="submit" className="btn btn-primary">{t('common.save')}</button>
    </form>
  );

  if (!data) return <div className="grid gap-3"><Skeleton className="h-24" /><Skeleton className="h-72" /></div>;

  if (data.needs_balance) {
    return (
      <Section title={t('finance.forecast.startTitle')}>
        <p className="text-sm mb-4" style={{ color: 'var(--text-secondary)' }}>{t('finance.forecast.startDesc')}</p>
        {balanceForm}
      </Section>
    );
  }

  const chart = data.series.map(p => ({ ...p, label: isoDate(p.date, lang, { day: 'numeric', month: 'short' }) }));
  const tone = (v) => (v < data.threshold ? 'var(--negative)' : undefined);

  return (
    <div className="flex flex-col gap-4">
      {data.first_below ? (
        <Notice tone="warning" icon={AlertTriangle}>
          {t('finance.forecast.alert').replace('{date}', isoDate(data.first_below.date, lang, { day: 'numeric', month: 'long' })).replace('{v}', eur(data.threshold, lang))}
          {' '}{t('finance.forecast.minAt').replace('{v}', eur(data.min.balance, lang)).replace('{date}', isoDate(data.min.date, lang, { day: 'numeric', month: 'long' }))}
        </Notice>
      ) : (
        <Notice tone="positive" icon={CheckCircle2}>{t('finance.forecast.ok').replace('{v}', eur(data.threshold, lang)).replace('{n}', data.days)}</Notice>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
        <Kpi icon={Wallet} label={t('finance.forecast.today')} value={eur(data.start, lang)} hint={data.balance_date ? t('finance.forecast.updated').replace('{date}', isoDate(data.balance_date, lang)) : undefined} />
        <Kpi label={t('finance.forecast.inDays').replace('{n}', 30)} value={eur(data.at30, lang)} tone={tone(data.at30)} />
        <Kpi label={t('finance.forecast.inDays').replace('{n}', 60)} value={eur(data.at60, lang)} tone={tone(data.at60)} />
        <Kpi label={t('finance.forecast.inDays').replace('{n}', 90)} value={eur(data.at90, lang)} tone={tone(data.at90)} />
      </div>

      <Section title={t('finance.forecast.curve')} aside={
        <Segmented value={days} onChange={setDays} size="sm" options={[30, 60, 90].map(d => ({ value: d, label: t('finance.days', { n: d }) }))} />
      }>
        <div className="h-[260px] sm:h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chart}>
              <defs>
                <linearGradient id="fcFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#3B82F6" stopOpacity={0.35} /><stop offset="100%" stopColor="#3B82F6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} interval={Math.ceil(chart.length / 7)} />
              <YAxis tick={{ fontSize: 11, fill: 'var(--text-muted)' }} width={70} tickFormatter={(v) => eur(v, lang, { decimals: 0 })} />
              <Tooltip formatter={(v) => eur(v, lang)} contentStyle={{ background: 'var(--surface-1)', border: '1px solid var(--border-strong)', borderRadius: 10, fontSize: 12 }} />
              <ReferenceLine y={data.threshold} stroke="#EF4444" strokeDasharray="4 4" />
              <Area type="stepAfter" dataKey="balance" stroke="#3B82F6" strokeWidth={2} fill="url(#fcFill)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </Section>

      <div className="grid md:grid-cols-2 gap-4">
        <Section title={t('finance.forecast.scenarios')}>
          <form onSubmit={(e) => { e.preventDefault(); setApplied({ hire: scenario.hire, delay: scenario.delay, extra: scenario.extra }); }} className="flex flex-col gap-3">
            <Field label={t('finance.forecast.hire')} htmlFor="sc-hire" hint={t('finance.forecast.hireHint')}>
              <input id="sc-hire" type="number" min="0" step="50" inputMode="decimal" value={scenario.hire} onChange={(e) => setScenario(s => ({ ...s, hire: e.target.value }))} className="input" placeholder="1600" />
            </Field>
            <Field label={t('finance.forecast.delay')} htmlFor="sc-delay">
              <input id="sc-delay" type="number" min="0" max="180" step="5" value={scenario.delay} onChange={(e) => setScenario(s => ({ ...s, delay: e.target.value }))} className="input" placeholder="30" />
            </Field>
            <Field label={t('finance.forecast.extra')} htmlFor="sc-extra" hint={t('finance.forecast.extraHint')}>
              <input id="sc-extra" type="number" min="0" step="50" inputMode="decimal" value={scenario.extra} onChange={(e) => setScenario(s => ({ ...s, extra: e.target.value }))} className="input" />
            </Field>
            <div className="flex gap-2">
              <button type="submit" className="btn btn-primary btn-sm">{t('finance.forecast.apply')}</button>
              {Object.values(applied).some(Boolean) && (
                <button type="button" onClick={() => { setScenario({ hire: '', delay: '', extra: '' }); setApplied({}); }} className="btn btn-ghost btn-sm">{t('finance.forecast.reset')}</button>
              )}
            </div>
          </form>
        </Section>
        <Section title={t('finance.forecast.movements')}>
          {data.flows.length === 0 ? (
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{t('finance.forecast.noMovements')}</p>
          ) : (
            <ul className="flex flex-col max-h-72 overflow-y-auto -mx-1">
              {data.flows.slice(0, 40).map((f, i) => (
                <li key={i} className="flex items-center justify-between gap-3 px-1 py-1.5 text-sm" style={{ borderTop: i ? '1px solid var(--border)' : 'none' }}>
                  <span className="min-w-0">
                    <span className="block truncate" style={{ color: 'var(--text-primary)' }}>{f.kind.startsWith('scenario') ? t(`finance.forecast.flow_${f.kind}`) : f.label || t(`finance.forecast.flow_${f.kind}`)}</span>
                    <span className="block text-xs" style={{ color: 'var(--text-muted)' }}>{isoDate(f.date, lang)} · {t(`finance.forecast.flow_${f.kind}`)}</span>
                  </span>
                  <span className="tabular font-medium shrink-0" style={{ color: f.amount >= 0 ? 'var(--positive)' : 'var(--text-primary)' }}>{f.amount >= 0 ? '+' : ''}{eur(f.amount, lang)}</span>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>

      <Section title={t('finance.forecast.updateBalance')}>{balanceForm}</Section>
      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{t('finance.forecast.method')}</p>
    </div>
  );
}

