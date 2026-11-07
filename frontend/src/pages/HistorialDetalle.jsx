import { useState, useEffect, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { Copy, SearchX, FileText, Pencil, Trash2 } from 'lucide-react';
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
import { formatDateTime } from '../utils/dates';
import { Modal, Field } from '../components/ui';
import { KIND_ICON, kindLabel, analysisTitle, analysisSource } from './Historial';

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
  // S15b D8: renombrar y borrar (borrar con confirmación en un modal propio).
  const navigate = useNavigate();
  const [renaming, setRenaming] = useState(null); // null | texto del campo
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);

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

  const Icon = KIND_ICON[analysis.kind] || FileText;
  // Mismo título y origen que en la lista (sesión 10).
  const summary = { ...analysis.meta, score: analysis.health?.score };
  const title = analysisTitle({ ...analysis, summary }, lang);
  const source = analysisSource({ summary });
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

  const actionError = (res) => {
    if (res?.data?.error === 'invalid_title') return t('history.renameInvalid');
    if (res?.status === 404) return t('history.notFoundTitle');
    return apiErrorMessage(t, { ...res, data: { ...res?.data, message: undefined } }, 'history.actionError');
  };

  const saveTitle = async (e) => {
    e.preventDefault();
    const next = (renaming || '').replace(/\s+/g, ' ').trim();
    if (!next || next.length > 120) { toast.error(t('history.renameInvalid')); return; }
    setBusy(true);
    const res = await analysesApi.rename(analysis.id, next);
    setBusy(false);
    if (!res.ok) { toast.error(actionError(res)); return; }
    setAnalysis(a => ({ ...a, title: res.data.title }));
    setRenaming(null);
    toast.success(t('history.renamed'));
  };

  const remove = async () => {
    setBusy(true);
    const res = await analysesApi.remove(analysis.id);
    setBusy(false);
    if (!res.ok && res.status !== 404) { toast.error(actionError(res)); return; }
    setConfirmDelete(false);
    toast.success(t('history.deleted'));
    navigate('/app/historial', { replace: true });
  };

  return (
    <article className="max-w-3xl">
      <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium mb-3"
        style={{ background: 'var(--accent-soft)', color: 'var(--accent-text)' }}>
        <Icon size={13} /> {kindLabel(analysis.kind, t)}
      </span>
      <h1 className="text-[22px] md:text-2xl font-semibold tracking-tight" style={{ color: 'var(--text-primary)' }}>{title}</h1>
      <p className="text-xs mt-1.5 mb-5" style={{ color: 'var(--text-muted)' }}>
        {formatDateTime(analysis.created_at, lang)}{source && ` · ${source}`}
      </p>

      <div className="flex flex-wrap gap-2 mb-4">
        <ExportMenu doc={{
          title: analysis.title, report: analysis.report, html: analysis.result_html, health: analysis.health,
          actions: analysis.actions, fileBase: analysis.meta?.folder_name || analysis.title
        }} />
        {analysis.report && <AskAssistant analysisId={analysis.id} title={analysis.title} />}
        <button onClick={copyText} className="btn btn-ghost btn-sm">
          <Copy size={14} /> {t('history.copyText')}
        </button>
        <button onClick={() => setRenaming(analysis.title)} className="btn btn-ghost btn-sm">
          <Pencil size={14} /> {t('history.rename')}
        </button>
        <button onClick={() => setConfirmDelete(true)} className="btn btn-ghost btn-sm" style={{ color: 'var(--negative)' }}>
          <Trash2 size={14} /> {t('history.delete')}
        </button>
      </div>

      {renaming !== null && (
        <Modal title={t('history.renameTitle')} onClose={() => !busy && setRenaming(null)}
          footer={<>
            <button type="button" onClick={() => setRenaming(null)} disabled={busy} className="btn btn-secondary">{t('common.cancel')}</button>
            <button type="submit" form="rename-analysis" disabled={busy || !renaming.trim()} className="btn btn-primary">{t('common.save')}</button>
          </>}>
          <form id="rename-analysis" onSubmit={saveTitle}>
            <Field label={t('history.renameLabel')} htmlFor="rename-analysis-title">
              <input id="rename-analysis-title" className="input" value={renaming} maxLength={120} autoFocus
                onChange={(e) => setRenaming(e.target.value)} />
            </Field>
          </form>
        </Modal>
      )}

      {confirmDelete && (
        <Modal title={t('history.deleteTitle')} onClose={() => !busy && setConfirmDelete(false)}
          footer={<>
            <button type="button" onClick={() => setConfirmDelete(false)} disabled={busy} className="btn btn-secondary">{t('common.cancel')}</button>
            <button type="button" onClick={remove} disabled={busy} className="btn btn-danger"><Trash2 size={15} /> {t('history.deleteConfirm')}</button>
          </>}>
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{t('history.deleteDesc', { title })}</p>
        </Modal>
      )}

      <ReportView report={analysis.report} html={analysis.result_html} actions={analysis.actions} health={analysis.health} />
    </article>
  );
}
