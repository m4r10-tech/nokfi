import { useEffect, useState } from 'react';
import { BookOpen } from 'lucide-react';
import { useLang } from '../context/LangContext';
import { formatNumber } from '../utils/money';
import {
  VAT_RATES, WITHHOLDINGS, AUTONOMO_TABLE, AUTONOMO_TABLE_YEAR, AUTONOMO_FLAT_RATE, AUTONOMO_GENERIC_EXPENSES,
  EMPLOYER_RATES, EMPLOYER_RATES_YEAR, BASE_MAX_MONTHLY, WORK_HOURS_YEAR, autonomoQuota
} from '../utils/spainRates';
import { Segmented } from './ui';

/**
 * Calculadoras (cálculo 100 % local, sin IA ni backend). Las usan la app
 * (/app/calculadoras, con `ledger` = medias del libro para prellenar) y las
 * páginas públicas de la sesión 12 (sin `ledger`).
 */

/** "1.234,56", "1234,56" o "1234.56" → número. */
const num = (v) => {
  let s = String(v ?? '').trim();
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
};
const filled = (...vs) => vs.every(v => String(v ?? '').trim() !== '');
const toField = (n) => (n ? String(Math.round(n)) : '');

/** Rellena campos vacíos con el libro una sola vez. */
function usePrefill(ledger, fill) {
  const [done, setDone] = useState(false);
  useEffect(() => {
    if (done || !ledger) return;
    setDone(true);
    if (ledger.months) fill(ledger);
  }, [ledger, done, fill]);
}

function useFmt() {
  const { lang } = useLang();
  return {
    eur: (n) => formatNumber(n, lang, { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    int: (n) => formatNumber(n, lang),
    pct: (n) => `${formatNumber(n, lang, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %`,
    rate: (n) => formatNumber(n, lang, { maximumFractionDigits: 2 })
  };
}

function Panel({ title, children, note }) {
  return (
    <div className="card p-4 sm:p-6 flex flex-col gap-4">
      {title && <h2 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>{title}</h2>}
      {children}
      {note && <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{note}</p>}
    </div>
  );
}

function NumField({ id, label, value, onChange, suffix = '€', hint, placeholder = '0' }) {
  return (
    <div>
      <label htmlFor={id} className="field-label">{label}</label>
      <div className="relative">
        <input id={id} type="text" inputMode="decimal" autoComplete="off" value={value} placeholder={placeholder}
          onChange={(e) => onChange(e.target.value.replace(/[^\d.,-]/g, ''))}
          className="input tabular !pr-9" />
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm pointer-events-none" style={{ color: 'var(--text-muted)' }}>{suffix}</span>
      </div>
      {hint && <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>{hint}</p>}
    </div>
  );
}

function FromLedger({ ledger, show }) {
  const { t } = useLang();
  if (!show || !ledger?.months) return null;
  return (
    <p className="text-xs flex items-center gap-1.5 -mt-1" style={{ color: 'var(--text-muted)' }}>
      <BookOpen size={13} /> {t('calc.fromLedger', { n: ledger.months })}
    </p>
  );
}

/** Resultado principal + desglose en líneas. */
function Result({ label, value, hint, tone = 'accent', lines }) {
  const { t } = useLang();
  const empty = value == null;
  return (
    <div className="rounded-xl p-4" style={{ background: empty ? 'var(--surface-2)' : `var(--${tone}-soft)` }} aria-live="polite">
      <p className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>{label}</p>
      <p className="text-2xl font-semibold tabular mt-0.5" style={{ color: empty ? 'var(--text-muted)' : tone === 'accent' ? 'var(--accent-text)' : `var(--${tone})` }}>{empty ? '—' : value}</p>
      {empty ? <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>{hint || t('calc.empty')}</p>
        : hint && <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>{hint}</p>}
      {!empty && lines?.length > 0 && (
        <dl className="mt-3 pt-3 flex flex-col gap-1.5 text-sm" style={{ borderTop: '1px solid var(--border)' }}>
          {lines.map(([k, v, strong]) => (
            <div key={k} className="flex justify-between gap-3">
              <dt style={{ color: strong ? 'var(--text-primary)' : 'var(--text-secondary)', fontWeight: strong ? 600 : 400 }}>{k}</dt>
              <dd className="tabular shrink-0" style={{ color: 'var(--text-primary)', fontWeight: strong ? 600 : 400 }}>{v}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}

const r2 = (n) => Math.round(n * 100) / 100;

/* ── IVA ── */
export function IvaCalc() {
  const { t } = useLang();
  const f = useFmt();
  const [amount, setAmount] = useState('');
  const [mode, setMode] = useState('add');
  const [rate, setRate] = useState(21);
  const a = num(amount);
  const base = mode === 'add' ? a : a / (1 + rate / 100);
  const vat = base * rate / 100;
  const total = mode === 'add' ? a + vat : a;

  return (
    <Panel title={t('calc.tab_iva')} note={t('calc.iva.rateHint')}>
      <Segmented value={mode} onChange={setMode} size="sm" options={[{ value: 'add', label: t('calc.iva.modeAdd') }, { value: 'remove', label: t('calc.iva.modeRemove') }]} />
      <NumField id="iva-amount" label={t(mode === 'add' ? 'calc.iva.amountNet' : 'calc.iva.amountGross')} value={amount} onChange={setAmount} />
      <div>
        <p className="field-label">{t('calc.iva.rate')}</p>
        <Segmented value={rate} onChange={setRate} size="sm" options={VAT_RATES.map(r => ({ value: r, label: `${r} %` }))} />
      </div>
      <Result label={t(mode === 'add' ? 'calc.iva.total' : 'calc.iva.base')} value={filled(amount) ? f.eur(r2(mode === 'add' ? total : base)) : null}
        lines={[[t('calc.iva.base'), f.eur(r2(base))], [t('calc.iva.vat', { r: rate }), f.eur(r2(vat))], [t('calc.iva.total'), f.eur(r2(total)), true]]} />
    </Panel>
  );
}

/* ── Retención de IRPF en una factura ── */
export function IrpfCalc() {
  const { t } = useLang();
  const f = useFmt();
  const [base, setBase] = useState('');
  const [vatRate, setVatRate] = useState(21);
  const [wh, setWh] = useState(15);
  const b = num(base);
  const vat = r2(b * vatRate / 100), ret = r2(b * wh / 100), total = r2(b + vat - ret);

  return (
    <Panel title={t('calc.tab_irpf')} note={t(wh ? 'calc.irpf.whHint' : 'calc.irpf.noWhHint')}>
      <NumField id="irpf-base" label={t('calc.irpf.base')} value={base} onChange={setBase} />
      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <p className="field-label">{t('calc.irpf.vatRate')}</p>
          <Segmented value={vatRate} onChange={setVatRate} size="sm" options={VAT_RATES.map(r => ({ value: r, label: `${r} %` }))} />
        </div>
        <div>
          <label htmlFor="irpf-wh" className="field-label">{t('calc.irpf.withholding')}</label>
          <select id="irpf-wh" value={wh} onChange={(e) => setWh(Number(e.target.value))} className="input">
            {WITHHOLDINGS.map(w => <option key={w} value={w}>{t(`calc.irpf.w${w}`)}</option>)}
          </select>
        </div>
      </div>
      <Result label={t('calc.irpf.toCollect')} value={filled(base) ? f.eur(total) : null}
        lines={[[t('calc.irpf.baseLine'), f.eur(b)], [t('calc.irpf.plusVat', { r: vatRate }), `+ ${f.eur(vat)}`], [t('calc.irpf.minusWh', { r: wh }), `− ${f.eur(ret)}`], [t('calc.irpf.toCollect'), f.eur(total), true]]} />
    </Panel>
  );
}

/* ── Cuota de autónomos (cotización por ingresos reales) ── */
export function AutonomoCalc({ ledger }) {
  const { t } = useLang();
  const f = useFmt();
  const [income, setIncome] = useState('');
  const [expenses, setExpenses] = useState('');
  const [flat, setFlat] = useState(false);
  const [prefilled, setPrefilled] = useState(false);
  usePrefill(ledger, (l) => { setIncome(toField(l.income)); setExpenses(toField(l.expense)); setPrefilled(true); });

  const net = Math.max(0, (num(income) - num(expenses)) * (1 - AUTONOMO_GENERIC_EXPENSES));
  const q = autonomoQuota(net);
  const quota = flat ? AUTONOMO_FLAT_RATE : q.quota;

  return (
    <Panel title={t('calc.tab_autonomo')} note={t('calc.autonomo.note', { y: AUTONOMO_TABLE_YEAR })}>
      <FromLedger ledger={ledger} show={prefilled} />
      <div className="grid sm:grid-cols-2 gap-4">
        <NumField id="aut-income" label={t('calc.autonomo.income')} value={income} onChange={setIncome} />
        <NumField id="aut-exp" label={t('calc.autonomo.expenses')} value={expenses} onChange={setExpenses} />
      </div>
      <label className="flex items-center gap-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
        <input type="checkbox" checked={flat} onChange={(e) => setFlat(e.target.checked)} className="w-4 h-4" /> {t('calc.autonomo.flat')}
      </label>
      <Result label={t('calc.autonomo.quota')} value={filled(income) ? f.eur(quota) : null}
        hint={flat ? t('calc.autonomo.flatHint', { v: f.eur(AUTONOMO_FLAT_RATE) }) : t('calc.autonomo.bracket', { n: q.bracket, total: AUTONOMO_TABLE.length })}
        lines={[[t('calc.autonomo.netYield'), f.eur(r2(net))], [t('calc.autonomo.perYear'), f.eur(quota * 12), true]]} />
    </Panel>
  );
}

/* ── Coste real de un empleado ── */
export function EmpleadoCalc() {
  const { t } = useLang();
  const f = useFmt();
  const [salary, setSalary] = useState('');
  const [contract, setContract] = useState('indef');
  const [atep, setAtep] = useState('1,5');
  const gross = num(salary);
  const base = Math.min(gross / 12, BASE_MAX_MONTHLY) * 12;
  const R = EMPLOYER_RATES;
  const parts = [
    ['cc', R.cc], ['unemployment', contract === 'indef' ? R.unemployment_indef : R.unemployment_temp],
    ['fogasa', R.fogasa], ['fp', R.fp], ['mei', R.mei], ['atep', num(atep)]
  ].map(([k, rate]) => [k, rate, r2(base * rate / 100)]);
  const ss = parts.reduce((s, [, , v]) => s + v, 0);
  const total = gross + ss;

  return (
    <Panel title={t('calc.tab_empleado')} note={t('calc.empleado.note', { y: EMPLOYER_RATES_YEAR })}>
      <NumField id="emp-salary" label={t('calc.empleado.salary')} value={salary} onChange={setSalary} />
      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <p className="field-label">{t('calc.empleado.contract')}</p>
          <Segmented value={contract} onChange={setContract} size="sm" options={[{ value: 'indef', label: t('calc.empleado.indef') }, { value: 'temp', label: t('calc.empleado.temp') }]} />
        </div>
        <NumField id="emp-atep" label={t('calc.empleado.atep')} value={atep} onChange={setAtep} suffix="%" hint={t('calc.empleado.atepHint')} />
      </div>
      <Result label={t('calc.empleado.totalYear')} value={filled(salary) ? f.eur(total) : null}
        hint={filled(salary) ? `${t('calc.empleado.perMonth', { v: f.eur(total / 12) })} · ${t('calc.empleado.perHour', { v: f.eur(total / WORK_HOURS_YEAR), h: f.int(WORK_HOURS_YEAR) })}` : null}
        lines={[
          [t('calc.empleado.salaryLine'), f.eur(gross)],
          ...parts.map(([k, rate, v]) => [`${t(`calc.empleado.${k === 'atep' ? 'atep_line' : k}`)} (${f.rate(rate)} %)`, f.eur(v)]),
          [t('calc.empleado.ssCompany'), f.eur(ss), true]
        ]} />
      {gross / 12 > BASE_MAX_MONTHLY && <p className="text-xs -mt-2" style={{ color: 'var(--text-muted)' }}>{t('calc.empleado.capped')}</p>}
    </Panel>
  );
}

/* ── Precio por hora ── */
export function HoraCalc({ ledger }) {
  const { t } = useLang();
  const f = useFmt();
  const [fixed, setFixed] = useState('');
  const [salary, setSalary] = useState('');
  const [quota, setQuota] = useState('');
  const [hours, setHours] = useState('');
  const [margin, setMargin] = useState('10');
  const [prefilled, setPrefilled] = useState(false);
  usePrefill(ledger, (l) => { setFixed(toField(l.expense)); setPrefilled(true); });

  const h = num(hours);
  const cost = num(fixed) + num(salary) + num(quota);
  const price = h > 0 ? (cost / h) * (1 + num(margin) / 100) : null;

  return (
    <Panel title={t('calc.tab_hora')}>
      <FromLedger ledger={ledger} show={prefilled} />
      <div className="grid sm:grid-cols-2 gap-4">
        <NumField id="h-fixed" label={t('calc.hora.fixed')} value={fixed} onChange={setFixed} />
        <NumField id="h-salary" label={t('calc.hora.salary')} value={salary} onChange={setSalary} />
        <NumField id="h-quota" label={t('calc.hora.quota')} value={quota} onChange={setQuota} />
        <NumField id="h-margin" label={t('calc.hora.margin')} value={margin} onChange={setMargin} suffix="%" />
      </div>
      <NumField id="h-hours" label={t('calc.hora.hours')} value={hours} onChange={setHours} suffix="h" hint={t('calc.hora.hoursHint')} />
      <Result label={t('calc.hora.result')} value={price != null && cost > 0 ? f.eur(price) : null}
        hint={price != null && cost > 0 ? t('calc.hora.withVat', { v: f.eur(price * 1.21) }) : h > 0 ? null : t('calc.hora.noHours')}
        lines={[[t('calc.hora.costMonth'), f.eur(cost)], [t('calc.hora.costHour'), f.eur(h > 0 ? cost / h : 0)]]} />
    </Panel>
  );
}

/* ── Punto de equilibrio (por unidades o por horas) ── */
export function PuntoEquilibrio({ ledger }) {
  const { t } = useLang();
  const f = useFmt();
  const [by, setBy] = useState('hours');
  const [fixed, setFixed] = useState('');
  const [price, setPrice] = useState('');
  const [variableCost, setVariableCost] = useState('');
  const [prefilled, setPrefilled] = useState(false);
  usePrefill(ledger, (l) => { setFixed(toField(l.expense)); setPrefilled(true); });

  const margin = num(price) - num(variableCost);
  const units = margin > 0 ? Math.ceil(num(fixed) / margin) : null;
  const ready = filled(fixed, price);

  return (
    <Panel title={t('calc.tab_equilibrio')}>
      <Segmented value={by} onChange={setBy} size="sm" options={[{ value: 'hours', label: t('calc.byHours') }, { value: 'units', label: t('calc.byUnits') }]} />
      <FromLedger ledger={ledger} show={prefilled} />
      <NumField id="c-fixed" label={t('calc.fixedCosts')} value={fixed} onChange={setFixed} />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <NumField id="c-price" label={t(by === 'hours' ? 'calc.hourPrice' : 'calc.unitPrice')} value={price} onChange={setPrice} />
        <NumField id="c-var" label={t(by === 'hours' ? 'calc.hourVariable' : 'calc.unitVariable')} value={variableCost} onChange={setVariableCost} />
      </div>
      {ready && units == null
        ? <Result tone="warning" label={t(by === 'hours' ? 'calc.breakEvenHours' : 'calc.breakEvenUnits')} value="—" hint={t('calc.noMargin')} />
        : <Result label={t(by === 'hours' ? 'calc.breakEvenHours' : 'calc.breakEvenUnits')} value={ready ? f.int(units) : null}
            hint={ready ? t('calc.breakEvenRevenue', { v: f.eur(units * num(price)) }) : null} />}
    </Panel>
  );
}

export function MargenCalc() {
  const { t } = useLang();
  const f = useFmt();
  const [revenue, setRevenue] = useState('');
  const [cogs, setCogs] = useState('');
  const [opex, setOpex] = useState('');

  const r = num(revenue);
  const gross = r > 0 ? ((r - num(cogs)) / r) * 100 : 0;
  const net = r > 0 ? ((r - num(cogs) - num(opex)) / r) * 100 : 0;
  const ready = r > 0;

  return (
    <Panel title={t('calc.tab_margen')}>
      <NumField id="m-rev" label={t('calc.revenue')} value={revenue} onChange={setRevenue} />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <NumField id="m-cogs" label={t('calc.cogs')} value={cogs} onChange={setCogs} />
        <NumField id="m-opex" label={t('calc.opex')} value={opex} onChange={setOpex} />
      </div>
      <div className="grid sm:grid-cols-2 gap-3">
        <Result label={t('calc.grossMargin')} value={ready ? f.pct(gross) : null} tone={gross < 0 ? 'negative' : 'accent'} />
        <Result label={t('calc.netMargin')} value={ready ? f.pct(net) : null} tone={net < 0 ? 'negative' : 'accent'}
          hint={ready ? f.eur(r - num(cogs) - num(opex)) : null} />
      </div>
    </Panel>
  );
}

export function RoiCalc() {
  const { t } = useLang();
  const f = useFmt();
  const [investment, setInvestment] = useState('');
  const [profit, setProfit] = useState('');

  const inv = num(investment);
  const roi = inv > 0 ? (num(profit) / inv) * 100 : 0;

  return (
    <Panel title={t('calc.tab_roi')}>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <NumField id="r-inv" label={t('calc.investment')} value={investment} onChange={setInvestment} />
        <NumField id="r-profit" label={t('calc.profit')} value={profit} onChange={setProfit} />
      </div>
      <Result label="ROI" value={inv > 0 && filled(profit) ? f.pct(roi) : null} tone={roi < 0 ? 'negative' : 'accent'} />
    </Panel>
  );
}
