import { Outlet } from 'react-router-dom';
import Sidebar from '../components/Sidebar';
import OnboardingModal from '../components/OnboardingModal';
import { useCompanyProfile } from '../hooks/useCompanyProfile';

export default function DashboardLayout() {
  const { profile, updateProfile, loading } = useCompanyProfile();

  return (
    <div className="flex min-h-screen" style={{ background: 'var(--bg-base)' }}>
      <Sidebar />
      <main className="flex-1 p-6 md:p-8 max-w-6xl mx-auto w-full">
        <Outlet context={{ profile, updateProfile, loading }} />
      </main>

      {/* No mostrar el onboarding hasta saber si el usuario ya lo hizo: el
          perfil viene de la API (async), y `onboardingCompleted=false` durante
          `loading` NO significa "nunca onboarded" — evita el flash del modal
          para usuarios ya registrados y evita abrirlo dos veces. */}
      {!loading && !profile.onboardingCompleted && (
        <OnboardingModal onComplete={(data) => updateProfile(data)} />
      )}
    </div>
  );
}
