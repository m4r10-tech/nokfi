import { useState, useEffect } from 'react';

/**
 * ⚠️ LIMITACIÓN CONOCIDA: el backend actual no tiene endpoint `/api/profile`
 * para persistir los datos de empresa del onboarding (sección 14 del
 * proyecto). Se guarda en localStorage temporalmente — no viaja entre
 * dispositivos. Cuando exista el endpoint real, sustituir este hook por
 * llamadas a profileApi en middleware/api.js sin tocar los componentes
 * que lo consumen (mismo shape de datos).
 */
const STORAGE_KEY = 'nokfi_company_profile';

const EMPTY_PROFILE = {
  companyName: '', sector: '', size: '', mainExpenses: [], onboardingCompleted: false, welcomeCardDismissed: false
};

export function useCompanyProfile() {
  const [profile, setProfile] = useState(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored ? { ...EMPTY_PROFILE, ...JSON.parse(stored) } : EMPTY_PROFILE;
    } catch {
      return EMPTY_PROFILE;
    }
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
  }, [profile]);

  const updateProfile = (partial) => setProfile(p => ({ ...p, ...partial }));

  return { profile, updateProfile };
}
