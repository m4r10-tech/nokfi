import { useState, useEffect, useRef, useCallback } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { MoreHorizontal, LogOut, Moon, Sun, X } from 'lucide-react';
import { NAV_ITEMS } from './navItems';
import { useAuth } from '../context/AuthContext';
import { useLang } from '../context/LangContext';
import { useTheme } from '../context/ThemeContext';

/**
 * Navegación móvil (Tanda M, sesión 3) — barra inferior tipo app (<768px).
 * 4 destinos fijos + "Más", que abre una hoja inferior con el resto
 * (Calculadoras, Configuración), el cambio de tema y cerrar sesión.
 * La clase `.bottom-nav` la usa index.css para subir los toasts por encima.
 */
export default function BottomNav({ companyName }) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const { pathname } = useLocation();
  const { t } = useLang();
  const barItems = NAV_ITEMS.filter(i => i.mobile === 'bar');
  const moreItems = NAV_ITEMS.filter(i => i.mobile === 'more');
  const moreActive = moreItems.some(i => pathname.startsWith(i.to));
  const closeSheet = useCallback(() => setSheetOpen(false), []);

  // Cerrar la hoja al navegar.
  useEffect(() => { setSheetOpen(false); }, [pathname]);

  return (
    <>
      <nav aria-label={t('nav.mainNav')}
        className="bottom-nav md:hidden fixed bottom-0 inset-x-0 z-40 safe-bottom"
        style={{ background: 'var(--surface-1)', borderTop: '1px solid var(--border)' }}>
        <div className="grid grid-cols-5" style={{ height: 'var(--bottom-nav-h)' }}>
          {barItems.map(({ to, icon: Icon, key, shortKey }) => (
            <NavLink key={to} to={to} className="bottom-nav-item">
              <Icon size={21} strokeWidth={1.9} />
              <span>{t(shortKey || key)}</span>
            </NavLink>
          ))}
          <button onClick={() => setSheetOpen(true)} aria-haspopup="dialog" aria-expanded={sheetOpen}
            className={`bottom-nav-item ${moreActive ? 'active' : ''}`}>
            <MoreHorizontal size={21} strokeWidth={1.9} />
            <span>{t('nav.more')}</span>
          </button>
        </div>
      </nav>

      {sheetOpen && <MoreSheet items={moreItems} companyName={companyName} onClose={closeSheet} />}
    </>
  );
}

function MoreSheet({ items, companyName, onClose }) {
  const { t } = useLang();
  const { logout, license } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const panelRef = useRef(null);

  // Escape cierra, scroll del fondo bloqueado y foco dentro de la hoja.
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    panelRef.current?.focus();
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prevOverflow; };
  }, [onClose]);

  return (
    <div className="md:hidden fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label={t('nav.more')}>
      <div className="absolute inset-0 anim-fade" style={{ background: 'var(--overlay)' }} onClick={onClose} />
      <div ref={panelRef} tabIndex={-1}
        className="absolute inset-x-0 bottom-0 rounded-t-2xl px-4 pt-2 pb-4 safe-bottom outline-none"
        style={{ background: 'var(--surface-1)', borderTop: '1px solid var(--border)', animation: 'sheet-up var(--dur-slow) var(--ease-out) both' }}>
        <div className="mx-auto mb-3 h-1 w-10 rounded-full" style={{ background: 'var(--border-strong)' }} />

        <div className="flex items-center justify-between mb-2 px-1">
          <div className="min-w-0">
            <p className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>{companyName || license?.email}</p>
            {license?.plan && <p className="text-xs uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>{license.plan}</p>}
          </div>
          <button onClick={onClose} className="btn btn-ghost btn-sm !px-2" aria-label={t('common.close')}><X size={18} /></button>
        </div>

        <div className="flex flex-col gap-1">
          {items.map(({ to, icon: Icon, key }) => (
            <NavLink key={to} to={to} className="nav-item flex items-center gap-3 rounded-xl px-3 h-12 text-[15px] font-medium">
              <Icon size={19} /> {t(key)}
            </NavLink>
          ))}
          <button onClick={toggleTheme} className="nav-item flex items-center gap-3 rounded-xl px-3 h-12 text-[15px] font-medium">
            {theme === 'dark' ? <Sun size={19} /> : <Moon size={19} />}
            {t(theme === 'dark' ? 'nav.lightMode' : 'nav.darkMode')}
          </button>
          <div className="my-1 h-px" style={{ background: 'var(--border)' }} />
          <button onClick={logout} className="flex items-center gap-3 rounded-xl px-3 h-12 text-[15px] font-medium"
            style={{ color: 'var(--negative)' }}>
            <LogOut size={19} /> {t('nav.logout')}
          </button>
        </div>
      </div>
    </div>
  );
}
