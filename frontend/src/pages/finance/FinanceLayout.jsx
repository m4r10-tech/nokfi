import { NavLink, Outlet, useOutletContext } from 'react-router-dom';
import { BookOpen, Landmark, HandCoins, Droplets, LineChart, CalendarDays } from 'lucide-react';
import { useLang } from '../../context/LangContext';
import PageHeader from '../../components/PageHeader';

/**
 * Finanzas (sesión 4) — el núcleo de valor del "director financiero de
 * bolsillo": libro de facturas (V1), impuestos (V2), cobros (V4), fugas (V5),
 * previsión de caja (V3) y calendario fiscal (C4). Cada pestaña es una ruta
 * propia (/app/finanzas/<tab>) para que "atrás" y los enlaces funcionen.
 */
export const FINANCE_TABS = [
  { to: 'libro', icon: BookOpen, key: 'finance.tabLedger' },
  { to: 'impuestos', icon: Landmark, key: 'finance.tabTaxes' },
  { to: 'cobros', icon: HandCoins, key: 'finance.tabReceivables' },
  { to: 'fugas', icon: Droplets, key: 'finance.tabLeaks' },
  { to: 'prevision', icon: LineChart, key: 'finance.tabForecast' },
  { to: 'calendario', icon: CalendarDays, key: 'finance.tabCalendar' }
];

export default function FinanceLayout() {
  const { t } = useLang();
  const ctx = useOutletContext();
  return (
    <div className="max-w-5xl">
      <PageHeader title={t('finance.title')} description={t('finance.subtitle')} />
      <nav aria-label={t('finance.title')} className="-mx-4 px-4 md:mx-0 md:px-0 mb-5 overflow-x-auto">
        <div className="inline-flex gap-1 rounded-xl p-1" style={{ background: 'var(--surface-1)', border: '1px solid var(--border)' }}>
          {FINANCE_TABS.map(({ to, icon: Icon, key }) => (
            <NavLink key={to} to={`/app/finanzas/${to}`}
              className={({ isActive }) => `inline-flex items-center gap-1.5 rounded-lg px-3 h-9 text-sm font-medium whitespace-nowrap ${isActive ? 'tab-active' : ''}`}
              style={({ isActive }) => (isActive
                ? { background: 'var(--surface-2)', color: 'var(--text-primary)', boxShadow: '0 0 0 1px var(--border-strong)' }
                : { color: 'var(--text-secondary)' })}>
              <Icon size={15} /> {t(key)}
            </NavLink>
          ))}
        </div>
      </nav>
      <Outlet context={ctx} />
      <p className="text-xs mt-8" style={{ color: 'var(--text-muted)' }}>{t('finance.disclaimer')}</p>
    </div>
  );
}
