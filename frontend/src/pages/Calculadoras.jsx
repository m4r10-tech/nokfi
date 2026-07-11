import { useState, useMemo } from 'react';

const TABS = [
  { id: 'equilibrio', label: 'Punto de equilibrio' },
  { id: 'margen', label: 'Margen bruto/neto' },
  { id: 'roi', label: 'ROI' }
];

export default function Calculadoras() {
  const [tab, setTab] = useState('equilibrio');

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-semibold mb-6" style={{ color: 'var(--text-primary)' }}>Calculadoras financieras</h1>

      <div className="flex gap-2 mb-6">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className="rounded-lg px-4 py-2 text-sm font-medium transition-colors"
            style={tab === t.id
              ? { background: 'var(--accent)', color: '#fff' }
              : { background: 'var(--surface-1)', color: 'var(--text-secondary)', border: '0.5px solid var(--border)' }}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'equilibrio' && <PuntoEquilibrio />}
      {tab === 'margen' && <MargenCalc />}
      {tab === 'roi' && <RoiCalc />}
    </div>
  );
}

function Panel({ children }) {
  return <div className="rounded-xl p-6 flex flex-col gap-4" style={{ background: 'var(--surface-1)', border: '0.5px solid var(--border)' }}>{children}</div>;
}

function NumField({ label, value, onChange }) {
  return (
    <div>
      <label className="block text-xs font-medium mb-1.5 uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>{label}</label>
      <input type="number" value={value} onChange={(e) => onChange(Number(e.target.value))}
        className="w-full rounded-lg px-3 py-2 text-sm outline-none"
        style={{ background: 'var(--surface-2)', border: '0.5px solid var(--border-strong)', color: 'var(--text-primary)' }} />
    </div>
  );
}

function Result({ label, value }) {
  return (
    <div className="rounded-lg p-4" style={{ background: 'var(--accent-soft)' }}>
      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{label}</p>
      <p className="text-2xl font-semibold" style={{ color: 'var(--accent)' }}>{value}</p>
    </div>
  );
}

function PuntoEquilibrio() {
  const [fixed, setFixed] = useState(3000);
  const [price, setPrice] = useState(25);
  const [variableCost, setVariableCost] = useState(10);

  const units = useMemo(() => {
    const margin = price - variableCost;
    return margin > 0 ? Math.ceil(fixed / margin) : 0;
  }, [fixed, price, variableCost]);

  return (
    <Panel>
      <NumField label="Costes fijos (€)" value={fixed} onChange={setFixed} />
      <NumField label="Precio de venta unitario (€)" value={price} onChange={setPrice} />
      <NumField label="Coste variable unitario (€)" value={variableCost} onChange={setVariableCost} />
      <Result label="Unidades necesarias para cubrir costes" value={units.toLocaleString('es-ES')} />
    </Panel>
  );
}

function MargenCalc() {
  const [revenue, setRevenue] = useState(10000);
  const [cogs, setCogs] = useState(4000);
  const [opex, setOpex] = useState(2500);

  const { gross, net } = useMemo(() => {
    const grossMargin = revenue > 0 ? ((revenue - cogs) / revenue) * 100 : 0;
    const netMargin = revenue > 0 ? ((revenue - cogs - opex) / revenue) * 100 : 0;
    return { gross: grossMargin.toFixed(1), net: netMargin.toFixed(1) };
  }, [revenue, cogs, opex]);

  return (
    <Panel>
      <NumField label="Ingresos (€)" value={revenue} onChange={setRevenue} />
      <NumField label="Coste de ventas / COGS (€)" value={cogs} onChange={setCogs} />
      <NumField label="Gastos operativos (€)" value={opex} onChange={setOpex} />
      <div className="grid grid-cols-2 gap-3">
        <Result label="Margen bruto" value={`${gross}%`} />
        <Result label="Margen neto" value={`${net}%`} />
      </div>
    </Panel>
  );
}

function RoiCalc() {
  const [investment, setInvestment] = useState(5000);
  const [profit, setProfit] = useState(1500);

  const roi = useMemo(() => (investment > 0 ? ((profit / investment) * 100).toFixed(1) : '0'), [investment, profit]);

  return (
    <Panel>
      <NumField label="Inversión inicial (€)" value={investment} onChange={setInvestment} />
      <NumField label="Beneficio obtenido (€)" value={profit} onChange={setProfit} />
      <Result label="ROI" value={`${roi}%`} />
    </Panel>
  );
}
