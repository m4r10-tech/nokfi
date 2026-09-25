import { createContext, useContext, useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { CheckCircle2, AlertCircle, Info, X, WifiOff } from 'lucide-react';
import { useLang } from './LangContext';

/**
 * Toasts (Tanda T, sesión 3) — notificaciones flotantes propias, sin librería.
 *
 *   const toast = useToast();
 *   toast.success('Guardado');  toast.error(msg);  toast.info(msg);
 *
 * - Esquina inferior derecha en escritorio; en móvil, centrado y POR ENCIMA de
 *   la bottom nav (ver `.toaster` en este archivo: `:root:has(.bottom-nav)`).
 * - Auto-cierre (4s; 6s los errores), máximo 3 apilados (el más viejo sale).
 * - aria-live: los errores se anuncian como `alert`, el resto como `status`.
 * - La animación respeta prefers-reduced-motion (regla global de index.css).
 * - Conectividad global: avisa al perder la red y al recuperarla (eventos
 *   `offline`/`online` del navegador), en toda la app, pública o privada.
 */
const ToastContext = createContext(null);
const MAX_TOASTS = 3;
const EXIT_MS = 180;

let nextId = 1;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const timers = useRef(new Map());
  const { t } = useLang();

  const dismiss = useCallback((id) => {
    clearTimeout(timers.current.get(id));
    timers.current.delete(id);
    setToasts(list => list.map(x => (x.id === id ? { ...x, leaving: true } : x)));
    setTimeout(() => setToasts(list => list.filter(x => x.id !== id)), EXIT_MS);
  }, []);

  const push = useCallback((variant, message, { duration, icon, key } = {}) => {
    if (!message) return;
    const id = nextId++;
    setToasts(list => {
      // `key` deduplica (p.ej. el aviso de "sin conexión" no se apila 3 veces).
      const base = key ? list.filter(x => x.key !== key) : list;
      return [...base, { id, variant, message, icon, key }].slice(-MAX_TOASTS);
    });
    const ms = duration ?? (variant === 'error' ? 6000 : 4000);
    if (ms > 0) timers.current.set(id, setTimeout(() => dismiss(id), ms));
    return id;
  }, [dismiss]);

  const api = useMemo(() => ({
    success: (m, o) => push('success', m, o),
    error: (m, o) => push('error', m, o),
    info: (m, o) => push('info', m, o),
    dismiss
  }), [push, dismiss]);

  useEffect(() => {
    const off = () => push('error', t('toast.offline'), { key: 'net', duration: 0, icon: WifiOff });
    const on = () => push('success', t('toast.online'), { key: 'net' });
    window.addEventListener('offline', off);
    window.addEventListener('online', on);
    return () => { window.removeEventListener('offline', off); window.removeEventListener('online', on); };
  }, [push, t]);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="toaster fixed z-[60] flex flex-col gap-2 pointer-events-none
                      left-4 right-4 bottom-4 items-center
                      md:left-auto md:right-6 md:bottom-6 md:items-end">
        {toasts.map(x => <ToastItem key={x.id} toast={x} onClose={() => dismiss(x.id)} closeLabel={t('common.close')} />)}
      </div>
    </ToastContext.Provider>
  );
}

const VARIANTS = {
  success: { icon: CheckCircle2, color: 'var(--positive)' },
  error: { icon: AlertCircle, color: 'var(--negative)' },
  info: { icon: Info, color: 'var(--accent-text)' }
};

function ToastItem({ toast, onClose, closeLabel }) {
  const v = VARIANTS[toast.variant] || VARIANTS.info;
  const Icon = toast.icon || v.icon;
  return (
    <div role={toast.variant === 'error' ? 'alert' : 'status'}
      className="pointer-events-auto w-full max-w-sm flex items-start gap-3 rounded-xl pl-3.5 pr-2 py-3 text-sm"
      style={{
        background: 'var(--surface-1)', border: '1px solid var(--border-strong)', boxShadow: 'var(--shadow-lg)',
        color: 'var(--text-primary)',
        animation: toast.leaving
          ? `toast-out ${EXIT_MS}ms var(--ease-in) both`
          : 'toast-in var(--dur-base) var(--ease-out) both'
      }}>
      <Icon size={18} className="shrink-0 mt-px" style={{ color: v.color }} />
      <p className="flex-1 leading-snug">{toast.message}</p>
      <button onClick={onClose} aria-label={closeLabel}
        className="shrink-0 rounded-md p-1 -mt-0.5 transition-colors hover:bg-[var(--surface-2)]"
        style={{ color: 'var(--text-muted)' }}>
        <X size={14} />
      </button>
    </div>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast debe usarse dentro de ToastProvider');
  return ctx;
}
