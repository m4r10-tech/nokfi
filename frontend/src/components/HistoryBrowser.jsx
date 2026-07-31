import { useState, useEffect } from 'react';
import { History, Loader2, Download, AlertCircle, ArrowLeft, ChevronRight } from 'lucide-react';
import { analysesApi } from '../middleware/api';
import { sanitizeAiHtml } from '../middleware/sanitize';
import { exportAnalysisToPdf } from '../middleware/exportUtils';
import EmptyState from '../pages/EmptyState'; // compartido por Historial e Informes
import { useLang } from '../context/LangContext';

/**
 * components/HistoryBrowser.jsx
 *
 * Vista de lista + detalle + re-export del historial de análisis (sección 14).
 * Compartida por las páginas Historial e Informes — solo difieren en el título
 * de la página, que se pasa como prop (`title`).
 *
 * La lista es ligera (GET /api/analyses, sin result_html); el HTML completo se
 * carga al abrir (GET /api/analyses/:id) y se rendiza SIEMPRE vía sanitizeAiHtml
 * (middleware/sanitize.js) — el backend guarda texto generado por la IA a
 * partir de datos del usuario, así que no se confía en él aunque venga de la BD
 * propia. El scoping es del backend (requireLicense; 404 si pides el de otro).
 */
export default function HistoryBrowser({ title, t }) {
  const { lang } = useLang();
  const [phase, setPhase] = useState('list'); // list | detail
  const [items, setItems] = useState(null);  // null = cargando, [] = vacío
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState(null);

  useEffect(() => { (async () => {
    setError(null);
    const { ok, data } = await analysesApi.list();
    if (ok) setItems(data.analyses || []);
    else { setError(t('history.loadError')); setItems([]); }
  })(); }, []);

  const openDetail = async (id) => {
    setError(null);
    const { ok, data } = await analysesApi.get(id);
    if (ok) { setSelected(data); setPhase('detail'); }
    else setError(t('history.loadDetailError'));
  };

  if (phase === 'detail' && selected) {
    return (
      <div className="max-w-3xl">
        <button onClick={() => { setPhase('list'); setSelected(null); }}
          className="mb-4 text-sm rounded-lg px-3 py-1.5 flex items-center gap-2"
          style={{ background: 'var(--surface-2)', color: 'var(--text-primary)', border: '0.5px solid var(--border-strong)' }}>
          <ArrowLeft size={14} /> {t('history.backToList')}
        </button>
        <h1 className="text-2xl font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>{selected.title}</h1>
        <p className="text-xs mb-4" style={{ color: 'var(--text-muted)' }}>
          {formatDate(selected.created_at, lang)} · {kindLabel(selected.kind, t)} · {t('history.detailPromptChars')}: {selected.prompt_chars}
        </p>
        <div className="rounded-xl p-6 prose-report"
          style={{ background: 'var(--surface-1)', border: '0.5px solid var(--border)', color: 'var(--text-primary)' }}
          dangerouslySetInnerHTML={{ __html: sanitizeAiHtml(selected.result_html) }} />
        <div className="mt-4 flex gap-2">
          <button onClick={() => exportAnalysisToPdf(selected.title, selected.result_html)}
            className="rounded-lg px-4 py-2 text-sm font-medium flex items-center gap-2"
            style={{ background: 'var(--surface-2)', color: 'var(--text-primary)', border: '0.5px solid var(--border-strong)' }}>
            <Download size={14} /> {t('history.exportPdf')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>{title}</h1>
      {error && (
        <div className="mt-3 mb-2 text-sm rounded-lg px-3 py-2 flex items-center gap-2" style={{ background: 'var(--negative-soft)', color: 'var(--negative)' }}>
          <AlertCircle size={15} /> {error}
        </div>
      )}

      {items === null ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <Loader2 size={26} className="animate-spin" style={{ color: 'var(--accent)' }} />
          <p className="text-sm mt-2" style={{ color: 'var(--text-secondary)' }}>{t('history.loading')}</p>
        </div>
      ) : items.length === 0 ? (
        <EmptyState t={t} />
      ) : (
        <>
          <p className="text-sm mb-4" style={{ color: 'var(--text-secondary)' }}>{t('history.listDesc')}</p>
          <div className="flex flex-col gap-2">
            {items.map(a => (
              <button key={a.id} onClick={() => openDetail(a.id)}
                className="rounded-xl p-4 flex items-center gap-3 text-left transition-colors"
                style={{ background: 'var(--surface-1)', border: '0.5px solid var(--border)' }}>
                <History size={18} style={{ color: 'var(--text-muted)' }} className="shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>{a.title}</p>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                    {formatDate(a.created_at, lang)} · {kindLabel(a.kind, t)}
                  </p>
                </div>
                <ChevronRight size={16} style={{ color: 'var(--text-muted)' }} className="shrink-0" />
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// SQLite guarda created_at como 'YYYY-MM-DD HH:MM:SS' (UTC). Lo mostramos legible.
// El locale sigue el idioma de la app (es|en) — no se hardcodea es-ES, que
// dejaba las fechas en español incluso con la app en inglés.
function formatDate(s, lang) {
  if (!s) return '—';
  const d = new Date(s.replace(' ', 'T') + 'Z');
  if (isNaN(d.getTime())) return s;
  const locale = lang === 'en' ? 'en-GB' : 'es-ES';
  return d.toLocaleDateString(locale, { year: 'numeric', month: 'short', day: 'numeric' });
}

function kindLabel(kind, t) {
  if (kind === 'cuestionario') return t('history.typeCuestionario');
  if (kind === 'excel') return t('history.typeExcel');
  return t('history.typeAnalysis');
}
