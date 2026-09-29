import { useNavigate, useLocation } from 'react-router-dom';
import { Briefcase, Code2 } from 'lucide-react';
import { useLang } from '../context/LangContext';
import { spaceOf, SPACE_KEY } from './navItems';

/**
 * Sesión 7 — selector de espacio: Negocio (/app/…) o Desarrolladores
 * (/app/dev/…). Misma cuenta y mismo plan; cambia el menú. El último espacio
 * se recuerda en este navegador (DashboardLayout lo restaura al entrar).
 */
export default function SpaceSwitcher({ collapsed = false }) {
  const { t } = useLang();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const current = spaceOf(pathname);
  const go = (space) => {
    if (space === current) return;
    try { localStorage.setItem(SPACE_KEY, space); } catch { /* storage bloqueado */ }
    navigate(space === 'dev' ? '/app/dev' : '/app/home');
  };
  const options = [
    { value: 'business', icon: Briefcase, label: t('nav.spaceBusiness') },
    { value: 'dev', icon: Code2, label: t('nav.spaceDev') }
  ];

  if (collapsed) {
    const other = options.find(o => o.value !== current);
    return (
      <button onClick={() => go(other.value)} className="btn btn-ghost btn-sm !px-2 w-full" title={other.label} aria-label={other.label}>
        <other.icon size={17} />
      </button>
    );
  }
  return (
    <div role="radiogroup" aria-label={t('nav.space')} className="grid grid-cols-2 gap-1 rounded-lg p-0.5"
      style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
      {options.map(({ value, icon: Icon, label }) => (
        <button key={value} role="radio" aria-checked={current === value} onClick={() => go(value)}
          className="inline-flex items-center justify-center gap-1.5 rounded-md h-8 text-xs font-medium min-w-0"
          style={current === value
            ? { background: 'var(--surface-1)', color: 'var(--text-primary)', boxShadow: '0 0 0 1px var(--border-strong)' }
            : { color: 'var(--text-secondary)' }}>
          <Icon size={13} className="shrink-0" /><span className="truncate">{label}</span>
        </button>
      ))}
    </div>
  );
}
