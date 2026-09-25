import { NavLink, Link } from 'react-router-dom';
import { LogOut, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import Logo from './Logo';
import { NAV_ITEMS } from './navItems';
import { useAuth } from '../context/AuthContext';
import { useLang } from '../context/LangContext';

/**
 * Sidebar de escritorio (md+). En móvil no se renderiza: ahí manda la
 * BottomNav (Tanda M). Plegable (Tanda N): en modo plegado solo iconos, con
 * tooltip nativo (title) y aria-label; el estado lo guarda DashboardLayout.
 */
export default function Sidebar({ collapsed, onToggle, companyName }) {
  const { logout, license } = useAuth();
  const { t } = useLang();
  const who = companyName || license?.email || '';

  return (
    <aside
      className="hidden md:flex shrink-0 h-screen sticky top-0 flex-col py-4 overflow-hidden"
      style={{
        width: collapsed ? 72 : 240,
        paddingLeft: collapsed ? 12 : 16, paddingRight: collapsed ? 12 : 16,
        background: 'var(--surface-1)', borderRight: '1px solid var(--border)',
        transition: 'width var(--dur-base) var(--ease-out), padding var(--dur-base) var(--ease-out)'
      }}>
      <div className={`flex items-center mb-6 ${collapsed ? 'flex-col gap-2' : 'h-10 justify-between pl-1.5'}`}>
        <Link to="/app/home" aria-label="Nokfi" className="rounded-lg">
          {collapsed ? <Logo variant="icon" size="md" /> : <Logo size="sm" />}
        </Link>
        <button onClick={onToggle} className="btn btn-ghost btn-sm !px-2"
          aria-label={t(collapsed ? 'nav.expand' : 'nav.collapse')} title={t(collapsed ? 'nav.expand' : 'nav.collapse')}>
          {collapsed ? <PanelLeftOpen size={17} /> : <PanelLeftClose size={17} />}
        </button>
      </div>

      <nav className="flex-1 flex flex-col gap-0.5">
        {NAV_ITEMS.map(({ to, icon: Icon, key }) => (
          <NavLink key={to} to={to} title={collapsed ? t(key) : undefined} aria-label={collapsed ? t(key) : undefined}
            className={`nav-item flex items-center gap-3 rounded-lg text-sm font-medium h-10 ${collapsed ? 'justify-center' : 'px-3'}`}>
            <Icon size={18} className="shrink-0" />
            {!collapsed && <span className="truncate">{t(key)}</span>}
          </NavLink>
        ))}
      </nav>

      <div className="flex flex-col gap-1 pt-3" style={{ borderTop: '1px solid var(--border)' }}>
        {who && (
          <div className={`flex items-center gap-2.5 py-1.5 ${collapsed ? 'justify-center' : 'px-1.5'}`} title={collapsed ? who : undefined}>
            <span className="shrink-0 w-8 h-8 rounded-full grid place-items-center text-xs font-semibold uppercase"
              style={{ background: 'var(--accent-soft)', color: 'var(--accent-text)' }}>
              {who.trim().charAt(0)}
            </span>
            {!collapsed && (
              <div className="min-w-0">
                <p className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>{who}</p>
                {license?.plan && (
                  <p className="text-xs uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>{license.plan}</p>
                )}
              </div>
            )}
          </div>
        )}
        <button onClick={logout} title={collapsed ? t('nav.logout') : undefined} aria-label={t('nav.logout')}
          className={`nav-item flex items-center gap-3 rounded-lg text-sm font-medium h-10 ${collapsed ? 'justify-center' : 'px-3'}`}>
          <LogOut size={18} className="shrink-0" />
          {!collapsed && t('nav.logout')}
        </button>
      </div>
    </aside>
  );
}
