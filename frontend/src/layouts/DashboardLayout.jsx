import { useState, useEffect } from 'react';
import { Outlet, Link, useLocation } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import Sidebar from '../components/Sidebar';
import BottomNav from '../components/BottomNav';
import Logo from '../components/Logo';
import OnboardingModal from '../components/OnboardingModal';
import { parentOf } from '../components/navItems';
import { useCompanyProfile } from '../hooks/useCompanyProfile';
import { useLang } from '../context/LangContext';
import { useToast } from '../context/ToastContext';
import { ChatProvider } from '../context/ChatContext';

const COLLAPSE_KEY = 'nokfi_sidebar_collapsed';

/**
 * Layout de la app privada (/app/*) — sesión 3, Tandas M y N.
 *   - md+: Sidebar plegable (estado recordado en localStorage).
 *   - <md: barra superior con el logo + BottomNav fija; el contenido deja
 *     hueco inferior (.app-main) para no quedar tapado por la barra.
 *   - Flecha de volver en la MISMA posición en todas las pantallas salvo el
 *     inicio: lleva a la sección padre (parentOf, en navItems.js).
 *   - Entrada suave de cada pantalla al navegar (anim-enter, respeta
 *     prefers-reduced-motion) y scroll arriba al cambiar de ruta.
 */
export default function DashboardLayout() {
  const { profile, updateProfile, loading, saveState } = useCompanyProfile();
  const { pathname } = useLocation();
  const { t } = useLang();
  const toast = useToast();
  const parent = parentOf(pathname);

  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem(COLLAPSE_KEY) === '1'; } catch { return false; }
  });
  const toggleCollapsed = () => setCollapsed(c => {
    try { localStorage.setItem(COLLAPSE_KEY, c ? '0' : '1'); } catch { /* storage bloqueado */ }
    return !c;
  });

  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);

  const completeOnboarding = (data) => {
    updateProfile(data);
    toast.success(t('toast.profileCreated'));
  };

  return (
    <ChatProvider>
    <div className="min-h-screen md:flex" style={{ background: 'var(--bg-base)' }}>
      <Sidebar collapsed={collapsed} onToggle={toggleCollapsed} companyName={profile.companyName} />

      <div className="flex-1 min-w-0 flex flex-col">
        <header className="md:hidden sticky top-0 z-30 flex items-center h-14 px-4"
          style={{ background: 'var(--bg-base)', borderBottom: '1px solid var(--border)', paddingTop: 'env(safe-area-inset-top)', boxSizing: 'content-box' }}>
          <Link to="/app/home" aria-label="Nokfi"><Logo size="sm" /></Link>
        </header>

        <main className="app-main w-full max-w-6xl mx-auto">
          {parent && (
            <Link to={parent.to}
              className="inline-flex items-center gap-1.5 -ml-1 mb-3 md:mb-4 rounded-lg px-1.5 py-1 text-sm font-medium transition-colors hover:text-[var(--text-primary)]"
              style={{ color: 'var(--text-secondary)' }}>
              <ArrowLeft size={16} /> {t(parent.key)}
            </Link>
          )}
          <div key={pathname} className="anim-enter">
            <Outlet context={{ profile, updateProfile, loading, saveState }} />
          </div>
        </main>
      </div>

      <BottomNav companyName={profile.companyName} />

      {/* No mostrar el onboarding hasta saber si el usuario ya lo hizo: el
          perfil viene de la API (async), y `onboardingCompleted=false` durante
          `loading` NO significa "nunca onboarded" — evita el flash del modal
          para usuarios ya registrados y evita abrirlo dos veces. */}
      {!loading && !profile.onboardingCompleted && (
        <OnboardingModal onComplete={completeOnboarding} />
      )}
    </div>
    </ChatProvider>
  );
}
