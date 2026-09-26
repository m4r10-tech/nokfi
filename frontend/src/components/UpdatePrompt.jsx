import { useRegisterSW } from 'virtual:pwa-register/react';
import { RefreshCw, X } from 'lucide-react';
import { useLang } from '../context/LangContext';

/**
 * §2.1 (sesión 4) — Aviso de "nueva versión disponible".
 *
 * Antes (registerType 'autoUpdate') el SW se actualizaba en silencio pero la
 * pestaña seguía ejecutando el bundle VIEJO hasta cerrar todas las pestañas:
 * causa exacta de "el fix está desplegado pero sigo viendo el error".
 * Ahora (registerType 'prompt'): se comprueba cada hora y al volver a la
 * pestaña; si hay versión nueva, aparece este aviso con "Recargar".
 */
const CHECK_EVERY_MS = 60 * 60 * 1000;

export default function UpdatePrompt() {
  const { t } = useLang();
  const { needRefresh: [needRefresh, setNeedRefresh], updateServiceWorker } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      if (!registration) return;
      setInterval(() => registration.update().catch(() => {}), CHECK_EVERY_MS);
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') registration.update().catch(() => {});
      });
    }
  });

  if (!needRefresh) return null;
  return (
    <div role="status" className="update-prompt fixed z-[70] left-4 right-4 md:left-auto md:right-6 md:w-[380px] anim-msg rounded-xl px-4 py-3 flex items-center gap-3"
      style={{ background: 'var(--surface-1)', border: '1px solid var(--border-strong)', boxShadow: 'var(--shadow-lg)' }}>
      <RefreshCw size={17} className="shrink-0" style={{ color: 'var(--accent-text)' }} />
      <p className="flex-1 text-sm" style={{ color: 'var(--text-primary)' }}>{t('update.available')}</p>
      <button onClick={() => updateServiceWorker(true)} className="btn btn-primary btn-sm">{t('update.reload')}</button>
      <button onClick={() => setNeedRefresh(false)} className="btn btn-ghost btn-sm !px-1.5" aria-label={t('common.close')}><X size={15} /></button>
    </div>
  );
}
