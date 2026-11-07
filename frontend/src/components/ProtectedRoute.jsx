import { Navigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useLang } from '../context/LangContext';
import ErrorState from './ErrorState';

/**
 * Protege las rutas /app/*. Sección 5 del proyecto — el dashboard solo se
 * monta si existe una sesión válida verificada por el servidor.
 */
export default function ProtectedRoute({ children }) {
  const { status, connError, retryVerify } = useAuth();
  const { t } = useLang();

  if (status === 'checking') {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg-base)' }}>
        <Loader2 size={28} className="animate-spin" style={{ color: 'var(--accent-text)' }} />
      </div>
    );
  }

  // S15b V4: sin red o con 429 al comprobar la sesión, aviso con «Reintentar» (antes, spinner sin fin).
  if (status === 'unreachable') {
    return (
      <main className="min-h-screen flex items-center justify-center p-4" style={{ background: 'var(--bg-base)' }}>
        <div className="w-full max-w-md">
          <ErrorState offline={connError !== 'rate_limited'} message={t('errors.rate_limited')} onRetry={retryVerify} />
        </div>
      </main>
    );
  }

  if (status !== 'authenticated') return <Navigate to="/login" replace />;

  return children;
}
