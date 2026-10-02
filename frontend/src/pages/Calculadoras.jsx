import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useLang } from '../context/LangContext';
import { ledgerApi } from '../middleware/api';
import PageHeader from '../components/PageHeader';
import { IvaCalc, IrpfCalc, AutonomoCalc, EmpleadoCalc, HoraCalc, PuntoEquilibrio, MargenCalc, RoiCalc } from '../components/calculators';

/**
 * Calculadoras (cálculo 100 % local, sin IA ni backend).
 * Sesión 10: las que busca un dueño en España (IVA, retención, cuota de
 * autónomos, coste de un empleado, precio por hora) delante; sin valores de
 * ejemplo que parezcan datos; prellenadas con la media mensual del libro.
 * ?c=<id> abre una calculadora concreta (enlaces de los informes).
 */
const GROUPS = [
  ['gTaxes', ['iva', 'irpf']],
  ['gWork', ['autonomo', 'empleado', 'hora']],
  ['gProfit', ['equilibrio', 'margen', 'roi']]
];
const ALL = GROUPS.flatMap(([, ids]) => ids);

export default function Calculadoras() {
  const { t } = useLang();
  const [params, setParams] = useSearchParams();
  const tab = ALL.includes(params.get('c')) ? params.get('c') : 'iva';
  const setTab = (id) => setParams({ c: id }, { replace: true });
  const ledger = useLedgerAverages();

  const Calc = { iva: IvaCalc, irpf: IrpfCalc, autonomo: AutonomoCalc, empleado: EmpleadoCalc, hora: HoraCalc, equilibrio: PuntoEquilibrio, margen: MargenCalc, roi: RoiCalc }[tab];

  return (
    <div className="max-w-4xl">
      <PageHeader title={t('calc.title')} description={t('calc.subtitle')} />
      <div className="grid md:grid-cols-[190px_minmax(0,1fr)] gap-4 md:gap-6">
        <nav aria-label={t('calc.title')} className="no-scrollbar flex md:flex-col gap-1 overflow-x-auto -mx-4 px-4 md:mx-0 md:px-0 pb-1 md:pb-0">
          {GROUPS.map(([g, ids]) => (
            <div key={g} className="flex md:flex-col gap-1 shrink-0 md:mb-3">
              <p className="hidden md:block text-xs font-medium px-2.5 mb-1" style={{ color: 'var(--text-muted)' }}>{t(`calc.${g}`)}</p>
              {ids.map(id => (
                <button key={id} onClick={() => setTab(id)} aria-current={tab === id ? 'page' : undefined}
                  className="whitespace-nowrap text-left rounded-lg px-2.5 h-9 text-sm font-medium"
                  style={{
                    ...(tab === id ? { background: 'var(--accent-soft)', color: 'var(--accent-text)' } : { color: 'var(--text-secondary)' }),
                    transition: 'background-color var(--dur-fast) var(--ease-std), color var(--dur-fast) var(--ease-std)'
                  }}>
                  {t(`calc.tab_${id}`)}
                </button>
              ))}
            </div>
          ))}
        </nav>
        <div key={tab} className="anim-enter min-w-0"><Calc ledger={ledger} /></div>
      </div>
    </div>
  );
}

/**
 * Media mensual de ingresos y gastos (bases, sin IVA) del libro en los
 * últimos 12 meses, contando desde el primer mes con apuntes.
 */
function useLedgerAverages() {
  const [avg, setAvg] = useState(null);
  useEffect(() => {
    const d = new Date();
    const from = `${d.getFullYear() - 1}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
    ledgerApi.list({ from }).then(res => {
      const entries = res.ok ? res.data.entries || [] : [];
      if (!entries.length) return setAvg({ months: 0 });
      const first = entries.map(e => e.invoice_date).sort()[0];
      const [fy, fm] = first.split('-').map(Number);
      const months = Math.max(1, (d.getFullYear() - fy) * 12 + (d.getMonth() + 1 - fm) + 1);
      const sum = (type) => entries.filter(e => e.type === type).reduce((s, e) => s + (Number(e.base) || 0), 0);
      setAvg({ months, income: sum('income') / months, expense: sum('expense') / months });
    });
  }, []);
  return avg;
}
