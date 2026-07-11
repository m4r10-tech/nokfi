import { History } from 'lucide-react';

/**
 * ⚠️ LIMITACIÓN CONOCIDA: el backend actual no persiste el historial de
 * análisis (no hay tabla `analyses` ni endpoints `/api/analyses`). Por
 * ahora esta pantalla muestra el estado vacío definido en la sección 14
 * del proyecto. Cuando se añada esa persistencia en el backend, esta
 * página debe sustituir el estado vacío por una llamada real a la API.
 */
export default function Historial() {
  return (
    <div>
      <h1 className="text-2xl font-semibold mb-6" style={{ color: 'var(--text-primary)' }}>Historial</h1>
      <EmptyState />
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-xl p-10 flex flex-col items-center text-center gap-3"
      style={{ background: 'var(--surface-1)', border: '0.5px solid var(--border)' }}>
      <History size={28} style={{ color: 'var(--text-muted)' }} />
      <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
        Aquí aparecerán todos tus análisis anteriores una vez que hagas el primero.
      </p>
      <a href="/app/cuestionario" className="text-sm font-medium rounded-lg px-4 py-2"
        style={{ background: 'var(--accent)', color: '#fff' }}>
        Ir al cuestionario
      </a>
    </div>
  );
}
