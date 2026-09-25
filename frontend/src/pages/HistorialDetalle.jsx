import { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Download, Copy, SearchX, Sparkles } from 'lucide-react';
import { analysesApi } from '../middleware/api';
import { apiErrorMessage, isConnectivityError } from '../middleware/errors';
import { sanitizeAiHtml } from '../middleware/sanitize';
import { exportAnalysisToPdf } from '../middleware/exportUtils';
import { useLang } from '../context/LangContext';
import { useToast } from '../context/ToastContext';
import EmptyState from '../components/EmptyState';
import ErrorState from '../components/ErrorState';
import Skeleton, { SkeletonText } from '../components/Skeleton';
import { formatDateTime } from '../utils/dates';
import { KIND_ICON, kindLabel } from './Historial';

/**
 * Detalle de un análisis guardado (/app/historial/:id). El HTML de la IA se
 * rendiza SIEMPRE vía sanitizeAiHtml — el backend guarda texto generado a
 * partir de datos del usuario, así que no se confía en él aunque venga de la
 * BD propia. Scoping en el backend (404 si el id es de otra licencia).
 */
export default function HistorialDetalle() {
  const { id } = useParams();
  const { t, lang } = useLang();
  const toast = useToast();
  const [analysis, setAnalysis] = useState(null);
  const [failure, setFailure] = useState(null);

  const load = useCallback(async () => {
    setFailure(null);
    setAnalysis(null);
    const res = await analysesApi.get(id);
    if (res.ok) setAnalysis(res.data);
    else setFailure(res);
  }, [id]);

  useEffect(() => { load(); }, [load]);

  if (failure) {
    if (failure.status === 404 || failure.status === 400) {
      return (
        <EmptyState icon={SearchX} title={t('history.notFoundTitle')} description={t('history.notFoundDesc')}>
          <Link to="/app/historial" className="btn btn-secondary">{t('history.backToList')}</Link>
        </EmptyState>
      );
    }
    return <ErrorState offline={isConnectivityError(failure)} message={apiErrorMessage(t, failure, 'history.loadDetailError')} onRetry={load} />;
  }

  if (!analysis) {
    return (
      <div className="max-w-3xl" aria-busy="true" aria-label={t('common.loading')}>
        <Skeleton className="h-5 w-24 mb-3 !rounded-full" />
        <Skeleton className="h-7 w-2/3 mb-2" />
        <Skeleton className="h-3.5 w-48 mb-6" />
        <div className="card p-6"><SkeletonText lines={4} /><SkeletonText lines={3} className="mt-6" /></div>
      </div>
    );
  }

  const Icon = KIND_ICON[analysis.kind] || Sparkles;
  const html = sanitizeAiHtml(analysis.result_html);

  const copyText = async () => {
    const div = document.createElement('div');
    div.innerHTML = html;
    try {
      await navigator.clipboard.writeText(div.innerText || div.textContent || '');
      toast.success(t('history.textCopied'));
    } catch {
      toast.error(t('common.error'));
    }
  };

  return (
    <article className="max-w-3xl">
      <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium mb-3"
        style={{ background: 'var(--accent-soft)', color: 'var(--accent-text)' }}>
        <Icon size={13} /> {kindLabel(analysis.kind, t)}
      </span>
      <h1 className="text-[22px] md:text-2xl font-semibold tracking-tight" style={{ color: 'var(--text-primary)' }}>{analysis.title}</h1>
      <p className="text-xs mt-1.5 mb-5" style={{ color: 'var(--text-muted)' }}>
        {formatDateTime(analysis.created_at, lang)} · {t('history.detailPromptChars')}: {Number(analysis.prompt_chars || 0).toLocaleString(lang === 'en' ? 'en-GB' : 'es-ES')}
      </p>

      <div className="flex gap-2 mb-4">
        <button onClick={() => exportAnalysisToPdf(analysis.title, analysis.result_html)} className="btn btn-secondary btn-sm">
          <Download size={14} /> {t('history.exportPdf')}
        </button>
        <button onClick={copyText} className="btn btn-ghost btn-sm">
          <Copy size={14} /> {t('history.copyText')}
        </button>
      </div>

      <div className="card p-5 md:p-7 prose-report" style={{ color: 'var(--text-primary)' }}
        dangerouslySetInnerHTML={{ __html: html }} />
    </article>
  );
}
