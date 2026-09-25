import { useState } from 'react';
import { useLang } from '../context/LangContext';
import { localeOf } from '../utils/dates';
import PageHeader from '../components/PageHeader';

const TABS = ['equilibrio', 'margen', 'roi'];

/**
 * Calculadoras financieras (cálculo 100% local, sin IA ni backend).
 * Sesión 3: los campos guardan el TEXTO tecleado (antes Number(value) dejaba
 * un "0" pegado al borrar el campo) y el cálculo se hace sobre el número.
 */
export default function Calculadoras() {
  const [tab, setTab] = useState('equilibrio');
  const { t } = useLang();

  return (
    <div className="max-w-2xl">
      <PageHeader title={t('calc.title')} description={t('calc.subtitle')} />

      <div role="tablist" className="flex gap-1 rounded-xl p-1 mb-5 overflow-x-auto"
        style={{ background: 'var(--surface-1)', border: '1px solid var(--border)' }}>
        {TABS.map(id => (
          <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)}
            className="flex-1 whitespace-nowrap rounded-lg px-3 h-9 text-sm font-medium"
            style={{
              ...(tab === id
                ? { background: 'var(--surface-2)', color: 'var(--text-primary)', boxShadow: '0 0 0 1px var(--border-strong)' }
                : { color: 'var(--text-secondary)' }),
              transition: 'background-color var(--dur-fast) var(--ease-std), color var(--dur-fast) var(--ease-std)'
            }}>
            {t(`calc.tab_${id}`)}
          </button>
        ))}
      </div>

      <div key={tab} className="anim-enter">
        {tab === 'equilibrio' && <PuntoEquilibrio />}
        {tab === 'margen' && <MargenCalc />}
        {tab === 'roi' && <RoiCalc />}
      </div>
    </div>
  );
}

const num = (v) => { const n = parseFloat(String(v).replace(',', '.')); return Number.isFinite(n) ? n : 0; };

function useFmt() {
  const { lang } = useLang();
  const loc = localeOf(lang);
  return {
    eur: (n) => n.toLocaleString(loc, { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 }),
    int: (n) => n.toLocaleString(loc),
    pct: (n) => `${n.toLocaleString(loc, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %`
  };
}

function Panel({ children }) {
  return <div className="card p-4 sm:p-6 flex flex-col gap-4">{children}</div>;
}

function NumField({ id, label, value, onChange, suffix = '€' }) {
  return (
    <div>
      <label htmlFor={id} className="field-label">{label}</label>
      <div className="relative">
        <input id={id} type="text" inputMode="decimal" autoComplete="off" value={value}
          onChange={(e) => onChange(e.target.value.replace(/[^\d.,-]/g, ''))}
          className="input tabular !pr-9" />
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm pointer-events-none" style={{ color: 'var(--text-muted)' }}>{suffix}</span>
      </div>
    </div>
  );
}

function Result({ label, value, hint, tone = 'accent' }) {
  return (
    <div className="rounded-xl p-4" style={{ background: `var(--${tone}-soft)` }} aria-live="polite">
      <p className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>{label}</p>
      <p className="text-2xl font-semibold tabular mt-0.5" style={{ color: tone === 'accent' ? 'var(--accent-text)' : `var(--${tone})` }}>{value}</p>
      {hint && <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>{hint}</p>}
    </div>
  );
}

function PuntoEquilibrio() {
  const { t } = useLang();
  const f = useFmt();
  const [fixed, setFixed] = useState('3000');
  const [price, setPrice] = useState('25');
  const [variableCost, setVariableCost] = useState('10');

  const margin = num(price) - num(variableCost);
  const units = margin > 0 ? Math.ceil(num(fixed) / margin) : null;

  return (
    <Panel>
      <NumField id="c-fixed" label={t('calc.fixedCosts')} value={fixed} onChange={setFixed} />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <NumField id="c-price" label={t('calc.unitPrice')} value={price} onChange={setPrice} />
        <NumField id="c-var" label={t('calc.unitVariable')} value={variableCost} onChange={setVariableCost} />
      </div>
      {units == null
        ? <Result tone="warning" label={t('calc.breakEvenUnits')} value="—" hint={t('calc.noMargin')} />
        : <Result label={t('calc.breakEvenUnits')} value={f.int(units)}
            hint={t('calc.breakEvenRevenue').replace('{v}', f.eur(units * num(price)))} />}
    </Panel>
  );
}

function MargenCalc() {
  const { t } = useLang();
  const f = useFmt();
  const [revenue, setRevenue] = useState('10000');
  const [cogs, setCogs] = useState('4000');
  const [opex, setOpex] = useState('2500');

  const r = num(revenue);
  const gross = r > 0 ? ((r - num(cogs)) / r) * 100 : 0;
  const net = r > 0 ? ((r - num(cogs) - num(opex)) / r) * 100 : 0;

  return (
    <Panel>
      <NumField id="m-rev" label={t('calc.revenue')} value={revenue} onChange={setRevenue} />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <NumField id="m-cogs" label={t('calc.cogs')} value={cogs} onChange={setCogs} />
        <NumField id="m-opex" label={t('calc.opex')} value={opex} onChange={setOpex} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Result label={t('calc.grossMargin')} value={f.pct(gross)} tone={gross < 0 ? 'negative' : 'accent'} />
        <Result label={t('calc.netMargin')} value={f.pct(net)} tone={net < 0 ? 'negative' : 'accent'}
          hint={f.eur(r - num(cogs) - num(opex))} />
      </div>
    </Panel>
  );
}

function RoiCalc() {
  const { t } = useLang();
  const f = useFmt();
  const [investment, setInvestment] = useState('5000');
  const [profit, setProfit] = useState('1500');

  const inv = num(investment);
  const roi = inv > 0 ? (num(profit) / inv) * 100 : 0;

  return (
    <Panel>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <NumField id="r-inv" label={t('calc.investment')} value={investment} onChange={setInvestment} />
        <NumField id="r-profit" label={t('calc.profit')} value={profit} onChange={setProfit} />
      </div>
      <Result label="ROI" value={f.pct(roi)} tone={roi < 0 ? 'negative' : 'accent'} />
    </Panel>
  );
}
