import { useState, useEffect, useRef } from 'react';
import { profileApi } from '../middleware/api';

/**
 * useCompanyProfile — perfil de empresa del onboarding (sección 14).
 *
 * Antes era una LIMITACIÓN CONOCIDA: el backend no tenía `/api/profile`, así
 * que se guardaba en localStorage (no viajaba entre dispositivos). Con la
 * deuda G-a resuelta, el perfil persiste en el backend (1 fila por licencia,
 * scoped por la sesión). Este hook es ahora el puente con la API.
 *
 * Contrato PRESERVADO para los componentes que lo consumen: sigue devolviendo
 * `{ profile, updateProfile }` con la MISMA shape camelCase (la traducción
 * snake↔camel la hace la API en el backend). Ningún componente cambia.
 *
 * Diferencias vs. localStorage:
 *   - `profile` arranca EMPTY y hay una fase `loading` hasta que el GET cae.
 *     DashboardLayout usa `loading` para no mostrar el OnboardingModal (ni
 *     parpadearlo) mientras no sepamos si el usuario ya hizo onboarding.
 *   - `updateProfile(partial)` actualiza el estado local en SEGUIDA (UI
 *     responsiva) y encola un PUT debounced (600 ms). Así Configuración, que
 *     edita companyName por keystroke, no lanza 30 PUTs por nombre.
 *
 * Si la carga inicial falla (red caída), no rompemos: dejamos el perfil vacío
 * y `loading=false` → la app funciona en modo degradado (reintenta en el
 * siguiente updateProfile, que hará upsert).
 */
const EMPTY_PROFILE = {
  companyName: '', sector: '', size: '', mainExpenses: [], onboardingCompleted: false, welcomeCardDismissed: false
};

export function useCompanyProfile() {
  const [profile, setProfile] = useState(EMPTY_PROFILE);
  const [loading, setLoading] = useState(true);
  const timerRef = useRef(null);
  const pendingRef = useRef({}); // acumula los partials entre flushes del debounce

  // Carga inicial (una sola vez). Best-effort: si falla, `loading=false` y
  // profile vacío → la app degrada con elegancia.
  useEffect(() => {
    let alive = true;
    (async () => {
      const { ok, data } = await profileApi.get();
      if (alive) {
        if (ok && data?.profile) setProfile({ ...EMPTY_PROFILE, ...data.profile });
        setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  const updateProfile = (partial) => {
    // UI responsiva: estado local actualizado en el acto.
    setProfile(p => ({ ...EMPTY_PROFILE, ...p, ...partial }));
    // ACUMULA los partials en vez de mandar solo el último: así editar
    // companyName y, dentro de 600ms, sector no pierde el cambio del primero
    // (antes, el último partial pisaba a los anteriores). El backend hace merge
    // de cada PUT con su estado → mandar el acumulado de esta ventana aplica
    // todos los campos juntos. El campo repetido gana el valor más reciente
    // (overwrite, que es lo que queremos).
    pendingRef.current = { ...pendingRef.current, ...partial };
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      const pending = pendingRef.current;
      pendingRef.current = {};
      profileApi.put(pending).catch(() => { /* best-effort: el próximo GET re-sincroniza */ });
    }, 600);
  };

  // Limpia el timer al desmontar (no fuga el setTimeout). Si un PUT quedó
  // pendiente se pierde — aceptable (el layout raíz raramente se desmonta; un
  // reintento natural lo cubre).
  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  return { profile, updateProfile, loading };
}
