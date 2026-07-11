import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard, ClipboardList, FileSpreadsheet, History,
  Calculator, FileOutput, Settings, LogOut
} from 'lucide-react';
import Logo from './Logo';
import { useAuth } from '../context/AuthContext';
import { useLang } from '../context/LangContext';

const NAV_ITEMS = [
  { to: '/app/home', icon: LayoutDashboard, key: 'nav.home' },
  { to: '/app/cuestionario', icon: ClipboardList, key: 'nav.questionnaire' },
  { to: '/app/excel', icon: FileSpreadsheet, key: 'nav.excel' },
  { to: '/app/historial', icon: History, key: 'nav.history' },
  { to: '/app/calculadoras', icon: Calculator, key: 'nav.calculators' },
  { to: '/app/informes', icon: FileOutput, key: 'nav.reports' },
  { to: '/app/configuracion', icon: Settings, key: 'nav.settings' }
];

export default function Sidebar() {
  const { logout } = useAuth();
  const { t } = useLang();

  return (
    <aside className="w-60 shrink-0 h-screen sticky top-0 flex flex-col p-4"
      style={{ background: 'var(--surface-1)', borderRight: '0.5px solid var(--border)' }}>
      <div className="px-2 py-3 mb-4"><Logo /></div>

      <nav className="flex-1 flex flex-col gap-1">
        {NAV_ITEMS.map(({ to, icon: Icon, key }) => (
          <NavLink key={to} to={to}
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors"
            style={({ isActive }) => ({
              background: isActive ? 'var(--accent-soft)' : 'transparent',
              color: isActive ? 'var(--accent)' : 'var(--text-secondary)'
            })}>
            <Icon size={18} />
            {t(key)}
          </NavLink>
        ))}
      </nav>

      <button onClick={logout} className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium"
        style={{ color: 'var(--text-muted)' }}>
        <LogOut size={18} />
        {t('nav.logout')}
      </button>
    </aside>
  );
}
