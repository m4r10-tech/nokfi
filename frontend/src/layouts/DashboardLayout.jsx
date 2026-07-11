import { Outlet } from 'react-router-dom';
import Sidebar from '../components/Sidebar';
import OnboardingModal from '../components/OnboardingModal';
import { useCompanyProfile } from '../hooks/useCompanyProfile';

export default function DashboardLayout() {
  const { profile, updateProfile } = useCompanyProfile();

  return (
    <div className="flex min-h-screen" style={{ background: 'var(--bg-base)' }}>
      <Sidebar />
      <main className="flex-1 p-6 md:p-8 max-w-6xl mx-auto w-full">
        <Outlet context={{ profile, updateProfile }} />
      </main>

      {!profile.onboardingCompleted && (
        <OnboardingModal onComplete={(data) => updateProfile(data)} />
      )}
    </div>
  );
}
