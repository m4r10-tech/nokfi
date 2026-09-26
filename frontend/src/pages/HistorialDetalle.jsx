import { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Copy, SearchX, Sparkles } from 'lucide-react';
import { analysesApi } from '../middleware/api';
import { apiErrorMessage, isConnectivityError } from '../middleware/errors';
import { sanitizeAiHtml } from '../middleware/sanitize';
import ReportView from '../components/ReportView';
import ExportMenu from '../components/ExportMenu';
import AskAssistant from '../components/AskAssistant';
import { reportToPlainText } from '../middleware/exports/model';
import { useLang } from '../context/LangContext';
import { useToast } from '../context/ToastContext';
import EmptyState from '../components/EmptyState';
import ErrorState from '../components/ErrorState';
import Skeleton, { SkeletonText } from '../components/Skeleton';
import { formatDateTime, localeOf } from '../utils/dates';
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
  const html = analysis.report ? '' : sanitizeAiHtml(analysis.result_html);

  const copyText = async () => {
    let text;
    if (analysis.report) text = reportToPlainText(analysis.report, t);
    else {
      const div = document.createElement('div');
      div.innerHTML = html;
      text = div.innerText || div.textContent || '';
    }
    try {
      await navigator.clipboard.writeText(text);
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
        {formatDateTime(analysis.created_at, lang)} · {t('history.detailPromptChars')}: {Number(analysis.prompt_chars || 0).toLocaleString(localeOf(lang))}
      </p>

      <div className="flex flex-wrap gap-2 mb-4">
        <ExportMenu doc={{
          title: analysis.title, report: analysis.report, html: analysis.result_html, health: analysis.health,
          actions: analysis.actions, fileBase: analysis.meta?.folder_name || analysis.title
        }} />
        {analysis.report && <AskAssistant analysisId={analysis.id} />}
        <button onClick={copyText} className="btn btn-ghost btn-sm">
          <Copy size={14} /> {t('history.copyText')}
        </button>
      </div>

      <ReportView report={analysis.report} html={analysis.result_html} actions={analysis.actions} health={analysis.health} />
    </article>
  );
}
