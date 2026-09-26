import { useEffect, useRef } from 'react';
import { X, AlertTriangle } from 'lucide-react';
import { useLang } from '../context/LangContext';

/**
 * Piezas de UI compartidas por las pantallas de la sesión 4 (finanzas,
 * carpeta, API…). Mismo lenguaje visual que el resto de /app: variables de
 * tema, card, tipografía y ritmo (sección 19: nunca hex en la UI).
 */

export function Section({ title, aside, children, className = '' }) {
  return (
    <section className={`card p-4 sm:p-5 ${className}`}>
      {(title || aside) && (
        <div className="flex items-center justify-between gap-3 mb-3 min-h-[20px]">
          {title && <h2 className="text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>{title}</h2>}
          {aside}
        </div>
      )}
      {children}
    </section>
  );
}

export function Kpi({ label, value, hint, tone, icon: Icon, className = '' }) {
  return (
    <div className={`rounded-xl p-3 sm:p-4 min-w-0 ${className}`} style={{ background: 'var(--surface-2)' }}>
      <p className="text-xs flex items-center gap-1.5 truncate" style={{ color: 'var(--text-muted)' }}>{Icon && <Icon size={13} />}{label}</p>
      <p className="text-lg sm:text-xl font-semibold tabular mt-1 truncate" style={{ color: tone || 'var(--text-primary)' }}>{value}</p>
      {hint && <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>{hint}</p>}
    </div>
  );
}

export function Segmented({ value, onChange, options, size = 'md', label }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex flex-wrap gap-1 rounded-lg p-0.5" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
      {options.map(({ value: v, label: l, icon: Icon }) => (
        <button key={v} type="button" role="radio" aria-checked={value === v} onClick={() => onChange(v)}
          className={`inline-flex items-center gap-1.5 rounded-md font-medium ${size === 'sm' ? 'px-2.5 h-7 text-xs' : 'px-3 h-8 text-sm'}`}
          style={{
            ...(value === v
              ? { background: 'var(--surface-1)', color: 'var(--text-primary)', boxShadow: '0 0 0 1px var(--border-strong)' }
              : { color: 'var(--text-secondary)' }),
            transition: 'background-color var(--dur-fast) var(--ease-std), color var(--dur-fast) var(--ease-std)'
          }}>
          {Icon && <Icon size={14} />} {l}
        </button>
      ))}
    </div>
  );
}

export function Modal({ title, onClose, children, footer, wide }) {
  const { t } = useLang();
  const ref = useRef(null);
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    ref.current?.focus();
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 anim-fade" style={{ background: 'var(--overlay)' }}
      role="dialog" aria-modal="true" aria-label={title} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={ref} tabIndex={-1} className={`w-full ${wide ? 'max-w-3xl' : 'max-w-lg'} rounded-t-2xl sm:rounded-2xl flex flex-col max-h-[92dvh] outline-none safe-bottom`}
        style={{ background: 'var(--surface-1)', border: '1px solid var(--border)', animation: 'fade-up var(--dur-slow) var(--ease-out) both' }}>
        <div className="flex items-center justify-between gap-3 px-5 pt-4 pb-3" style={{ borderBottom: '1px solid var(--border)' }}>
          <h2 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>{title}</h2>
          <button onClick={onClose} className="btn btn-ghost btn-sm !px-2" aria-label={t('common.close')}><X size={18} /></button>
        </div>
        <div className="px-5 py-4 overflow-y-auto overscroll-contain">{children}</div>
        {footer && <div className="px-5 py-3 flex flex-col-reverse sm:flex-row sm:justify-end gap-2" style={{ borderTop: '1px solid var(--border)' }}>{footer}</div>}
      </div>
    </div>
  );
}

export function ErrorBox({ children, code }) {
  if (!children) return null;
  return (
    <div role="alert" className="anim-msg text-sm rounded-lg px-3 py-2 flex items-start gap-2" style={{ background: 'var(--negative-soft)', color: 'var(--negative)' }}>
      <AlertTriangle size={15} className="mt-0.5 shrink-0" />
      <span className="flex-1">{children}{code && <code className="ml-2 text-[11px] opacity-75">{code}</code>}</span>
    </div>
  );
}

export function Notice({ children, tone = 'info', icon: Icon }) {
  const map = {
    info: { bg: 'var(--accent-soft)', color: 'var(--text-secondary)', ic: 'var(--accent-text)' },
    warning: { bg: 'var(--warning-soft)', color: 'var(--text-primary)', ic: 'var(--warning)' },
    positive: { bg: 'var(--positive-soft)', color: 'var(--text-primary)', ic: 'var(--positive)' }
  }[tone];
  return (
    <div className="rounded-xl px-3.5 py-2.5 text-xs sm:text-sm flex items-start gap-2.5" style={{ background: map.bg, color: map.color }}>
      {Icon && <Icon size={15} className="mt-0.5 shrink-0" style={{ color: map.ic }} />}
      <div className="flex-1">{children}</div>
    </div>
  );
}

export function Badge({ children, tone = 'muted' }) {
  const map = {
    muted: { background: 'var(--surface-2)', color: 'var(--text-secondary)' },
    accent: { background: 'var(--accent-soft)', color: 'var(--accent-text)' },
    positive: { background: 'var(--positive-soft)', color: 'var(--positive)' },
    warning: { background: 'var(--warning-soft)', color: 'var(--warning)' },
    negative: { background: 'var(--negative-soft)', color: 'var(--negative)' }
  };
  return <span className="inline-flex items-center gap-1 text-[11px] font-semibold rounded-full px-2 py-0.5 whitespace-nowrap" style={map[tone]}>{children}</span>;
}

export function Field({ label, htmlFor, hint, children, className = '' }) {
  return (
    <div className={className}>
      <label htmlFor={htmlFor} className="field-label">{label}</label>
      {children}
      {hint && <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>{hint}</p>}
    </div>
  );
}
