import { Link } from 'react-router-dom';
import Logo from './Logo';

/**
 * Carcasa de las pantallas de acceso (login, recuperar, reset, reveal) —
 * sesión 3, Tanda L. Logo que vuelve a la home pública, tarjeta centrada y
 * pie con enlaces. En móvil la tarjeta pierde el borde y ocupa el ancho.
 */
export default function AuthShell({ children, footer }) {
  return (
    <div className="min-h-[100dvh] flex flex-col items-center justify-center px-4 py-10" style={{ background: 'var(--bg-base)' }}>
      <div className="w-full max-w-sm anim-enter">
        <div className="flex justify-center mb-8">
          <Link to="/home" aria-label="Nokfi" className="rounded-lg"><Logo size="lg" /></Link>
        </div>
        <div className="rounded-2xl p-6 sm:p-8" style={{ background: 'var(--surface-1)', border: '1px solid var(--border)' }}>
          {children}
        </div>
        {footer && <div className="mt-5 flex flex-col items-center gap-2 text-sm">{footer}</div>}
      </div>
    </div>
  );
}

/** Mensaje de error/aviso de formulario con entrada suave (fade/slide). */
export function FormMessage({ tone = 'negative', children }) {
  return (
    <div role={tone === 'negative' ? 'alert' : 'status'} className="anim-msg text-sm rounded-lg px-3 py-2.5"
      style={{ background: `var(--${tone}-soft)`, color: tone === 'accent' ? 'var(--accent-text)' : `var(--${tone})` }}>
      {children}
    </div>
  );
}
