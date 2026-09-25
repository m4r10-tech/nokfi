import { Link } from 'react-router-dom';
import { Compass } from 'lucide-react';
import { useLang } from '../context/LangContext';
import { usePageMeta } from '../hooks/usePageMeta';
import Logo from '../components/Logo';

/**
 * Página 404 — antes cualquier ruta desconocida redirigía a /login (Navigate),
 * lo que confundía tanto a usuarios (¿por qué estoy en login?) como a crawlers
 * (soft 404: todas las URLs inexistentes devuelven "login" con 200). Ahora la
 * ruta comodín muestra una página de error real, con el diseño de la app y
 * salida clara a la home pública.
 */
export default function NotFound() {
  const { t } = useLang();
  usePageMeta(t('meta.notFoundTitle'));

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4" style={{ background: 'var(--bg-base)' }}>
      <div className="mb-8"><Logo size="lg" /></div>
      <div className="rounded-2xl p-8 max-w-sm w-full text-center flex flex-col items-center gap-3"
           style={{ background: 'var(--surface-1)', border: '0.5px solid var(--border)' }}>
        <Compass size={36} style={{ color: 'var(--accent-text)' }} />
        <h1 className="text-xl font-semibold" style={{ color: 'var(--text-primary)' }}>{t('notFound.title')}</h1>
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{t('notFound.desc')}</p>
        <Link to="/home" className="btn btn-primary mt-2">
          {t('notFound.cta')}
        </Link>
      </div>
    </div>
  );
}
