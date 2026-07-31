import { History } from 'lucide-react';

/**
 * Estado vacío compartido del historial de análisis (sección 14). Antes era un
 * marcador "aquí aparecerán tus análisis"; ahora que la persistencia (G2)
 * existe, este estado se muestra SOLO cuando una licencia aún no ha generado
 * ningún análisis. Lo usan Historial e Informes vía HistoryBrowser.
 */
export default function EmptyState({ t }) {
  return (
    <div className="rounded-xl p-10 flex flex-col items-center text-center gap-3 mt-4"
      style={{ background: 'var(--surface-1)', border: '0.5px solid var(--border)' }}>
      <History size={28} style={{ color: 'var(--text-muted)' }} />
      <p className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>{t('history.emptyTitle')}</p>
      <p className="text-xs max-w-sm" style={{ color: 'var(--text-muted)' }}>{t('history.emptyDesc')}</p>
      <a href="/app/cuestionario" className="text-sm font-medium rounded-lg px-4 py-2 mt-1"
        style={{ background: 'var(--accent)', color: '#fff' }}>{t('history.emptyCta')}</a>
    </div>
  );
}
