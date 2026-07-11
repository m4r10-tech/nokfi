import { Navigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

/**
 * Protege las rutas /app/*. Sección 5 del proyecto — el dashboard solo se
 * monta si existe una sesión válida verificada por el servidor.
 */
export default function ProtectedRoute({ children }) {
  const { status } = useAuth();

  if (status === 'checking') {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg-base)' }}>
        <Loader2 size={28} className="animate-spin" style={{ color: 'var(--accent)' }} />
      </div>
    );
  }

  if (status !== 'authenticated') return <Navigate to="/login" replace />;

  return children;
}
