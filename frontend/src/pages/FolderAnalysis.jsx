import { useState } from 'react';
import { Link } from 'react-router-dom';
import { FolderOpen, Loader2, Sparkles, FileText, History, X, Info } from 'lucide-react';
import { aiApi } from '../middleware/api';
import { apiErrorMessage } from '../middleware/errors';
import { readDataFile, fileAsText, extOf } from '../middleware/fileReaders';
import { fileErrorMessage } from '../middleware/fileErrors';
import { useLang } from '../context/LangContext';
import { useToast } from '../context/ToastContext';
import PageHeader from '../components/PageHeader';
import FolderSource from '../components/FolderSource';
import ReportView from '../components/ReportView';
import ExportMenu from '../components/ExportMenu';
import AskAssistant from '../components/AskAssistant';
import { Section, ErrorBox, Notice } from '../components/ui';

/**
 * F3 — "Abrir carpeta" + petición libre (sesión 4).
 *
 * Abrir la carpeta es LIBRE (lectura local, no gasta IA). Al pedir algo a
 * Nokfi ("resúmeme estas facturas") se gasta 1 análisis aunque por dentro se
 * procese por lotes (backend: job de varias llamadas). Tope técnico:
 * MAX_FILES archivos por petición, avisado antes.
 * Ejemplo del usuario: abrir /facturas2026 y exportar el resumen como
 * facturas2026.pdf (fileBase = nombre de la carpeta).
 */
const ACCEPT_EXT = ['.pdf', '.xlsx', '.xls', '.csv', '.ods', '.txt', '.md'];
const accept = (name) => ACCEPT_EXT.includes(extOf(name)) && !name.startsWith('.');
const MAX_FILES = 200;
const BATCH_CHARS = 35000;
const PER_FILE_CHARS = 12000;

export default function FolderAnalysis() {
  const { t, lang } = useLang();
  const toast = useToast();
  const [folder, setFolder] = useState(null); // { name, files: File[] }
  const [read, setRead] = useState([]); // archivos leídos {name,type,rows|text}
  const [reading, setReading] = useState(null); // { done, total }
  const [readErrors, setReadErrors] = useState([]);
  const [instruction, setInstruction] = useState('');
  const [progress, setProgress] = useState(null); // { step, total }
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);

  const onPick = async ({ name, files }) => {
    setResult(null); setError(null); setReadErrors([]);
    const list = files.slice(0, MAX_FILES);
    setFolder({ name: name || t('folder.selection'), files: list, skipped: Math.max(0, files.length - MAX_FILES) });
    setRead([]);
    setReading({ done: 0, total: list.length });
    const out = [], errs = [];
    for (const [i, f] of list.entries()) {
      try { out.push(await readDataFile(f, { maxBytes: 10 * 1024 * 1024 })); }
      catch (e) { errs.push(fileErrorMessage(t, e, f.name)); }
      setReading({ done: i + 1, total: list.length });
    }
    setRead(out);
    setReadErrors(errs);
    setReading(null);
  };

  const batches = () => {
    const out = [];
    let cur = [], size = 0;
    for (const f of read) {
      const text = fileAsText(f, PER_FILE_CHARS);
      if (!text.trim()) continue;
      if (size + text.length > BATCH_CHARS && cur.length) { out.push(cur); cur = []; size = 0; }
      cur.push({ name: f.name, text });
      size += text.length;
    }
    if (cur.length) out.push(cur);
    return out.slice(0, 12);
  };

  const run = async () => {
    setError(null); setResult(null);
    const bs = batches();
    if (!bs.length) { setError(t('folder.nothingReadable')); return; }
    const title = folder.name || t('folder.defaultTitle');
    let res;
    if (bs.length === 1) {
      setProgress({ step: 1, total: 1 });
      res = await aiApi.run('folder', { instruction, folder_name: folder.name, files: bs[0], file_count: read.length }, { lang, title });
    } else {
      let job;
      const notes = [];
      for (const [i, b] of bs.entries()) {
        setProgress({ step: i + 1, total: bs.length + 1 });
        const r = await aiApi.run('folder_map', { instruction, files: b, total_batches: bs.length }, { lang, job });
        if (!r.ok) { res = r; break; }
        job = r.data.job;
        notes.push(r.data.notes);
      }
      if (!res) {
        setProgress({ step: bs.length + 1, total: bs.length + 1 });
        res = await aiApi.run('folder', { instruction, folder_name: folder.name, notes, file_count: read.length }, { lang, title, job });
      }
    }
    setProgress(null);
    if (res.ok && res.data.report) {
      setResult(res.data);
      toast.success(t('excel.analysisReady'));
    } else setError(apiErrorMessage(t, res, 'excel.analyzeError'));
  };

  const busy = !!reading || !!progress;

  return (
    <div className="max-w-4xl flex flex-col gap-5">
      <PageHeader title={t('folder.title')} description={t('folder.subtitle')} />

      <Section title={t('folder.step1')}>
        <FolderSource accept={accept} inputAccept={ACCEPT_EXT.join(',')} slot="folder" onPick={onPick} disabled={busy} />
        <p className="text-xs mt-3" style={{ color: 'var(--text-muted)' }}>{t('folder.formats')}</p>

        {reading && (
          <p className="text-sm mt-4 flex items-center gap-2" style={{ color: 'var(--text-secondary)' }} aria-live="polite">
            <Loader2 size={15} className="animate-spin" /> {t('folder.reading').replace('{n}', reading.done).replace('{total}', reading.total)}
          </p>
        )}

        {folder && !reading && (
          <div className="mt-4 flex flex-col gap-3">
            <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--text-primary)' }}>
              <FolderOpen size={16} style={{ color: 'var(--accent-text)' }} />
              <span className="font-medium truncate">{folder.name}</span>
              <span style={{ color: 'var(--text-muted)' }}>· {t('folder.filesRead').replace('{n}', read.length)}</span>
              <button onClick={() => { setFolder(null); setRead([]); setResult(null); }} className="ml-auto btn btn-ghost btn-sm !px-2" aria-label={t('common.close')}><X size={15} /></button>
            </div>
            {read.length > 0 && (
              <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto">
                {read.map((f, i) => (
                  <span key={i} className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs" style={{ background: 'var(--surface-2)', color: 'var(--text-secondary)' }}>
                    <FileText size={12} /> {f.name}
                  </span>
                ))}
              </div>
            )}
            {folder.skipped > 0 && <Notice tone="warning" icon={Info}>{t('folder.capped').replace('{max}', MAX_FILES).replace('{n}', folder.skipped)}</Notice>}
            {readErrors.slice(0, 3).map((e, i) => <ErrorBox key={i} code={e.code}>{e.message}</ErrorBox>)}
            {readErrors.length > 3 && <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{t('folder.moreErrors').replace('{n}', readErrors.length - 3)}</p>}
          </div>
        )}
      </Section>

      {read.length > 0 && (
        <Section title={t('folder.step2')}>
          <textarea value={instruction} onChange={(e) => setInstruction(e.target.value)} rows={2} maxLength={500}
            placeholder={t('folder.instructionPlaceholder')} aria-label={t('folder.step2')} className="input resize-none" />
          <Notice icon={Info}>{t('folder.costNotice').replace('{n}', read.length)}</Notice>
          <div className="mt-3 flex flex-col sm:flex-row sm:items-center gap-3">
            <button onClick={run} disabled={busy} className="btn btn-primary">
              {progress ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />} {t('folder.analyze')}
            </button>
            {progress && (
              <span className="text-sm" style={{ color: 'var(--text-secondary)' }} aria-live="polite">
                {t('folder.progress').replace('{n}', progress.step).replace('{total}', progress.total)}
              </span>
            )}
          </div>
          {error && <div className="mt-3"><ErrorBox>{error}</ErrorBox></div>}
        </Section>
      )}

      {result && (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap gap-2">
            <ExportMenu doc={{ title: result.title, fileBase: folder?.name || result.title, report: result.report, actions: result.actions }} />
            <AskAssistant analysisId={result.analysis_id} title={result.title} />
            <Link to="/app/historial" className="btn btn-ghost btn-sm"><History size={14} /> {t('questionnaire.savedInHistory')}</Link>
          </div>
          <ReportView report={result.report} actions={result.actions} />
        </div>
      )}
    </div>
  );
}
