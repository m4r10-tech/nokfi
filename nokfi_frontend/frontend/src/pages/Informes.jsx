import { FileOutput } from 'lucide-react';

/**
 * Estado vacío (sección 14 del proyecto). La exportación real ya está
 * implementada dentro de cada subapartado de Excel y del Cuestionario
 * (middleware/exportUtils.js) — esta pantalla central de "Informes" queda
 * como hub para cuando el backend tenga persistencia de análisis
 * (ver limitación documentada en Historial.jsx).
 */
export default function Informes() {
  return (
    <div>
      <h1 className="text-2xl font-semibold mb-6" style={{ color: 'var(--text-primary)' }}>Informes</h1>
      <div className="rounded-xl p-10 flex flex-col items-center text-center gap-3"
        style={{ background: 'var(--surface-1)', border: '0.5px solid var(--border)' }}>
        <FileOutput size={28} style={{ color: 'var(--text-muted)' }} />
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          Genera tu primer análisis para poder exportar un informe.
        </p>
        <a href="/app/cuestionario" className="text-sm font-medium rounded-lg px-4 py-2"
          style={{ background: 'var(--accent)', color: '#fff' }}>
          Ir al cuestionario
        </a>
      </div>
    </div>
  );
}
