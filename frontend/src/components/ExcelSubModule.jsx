import { useState, useRef, useMemo } from 'react';
import { UploadCloud, FileText, X, Loader2, AlertTriangle, Sparkles, GitCompareArrows, History } from 'lucide-react';
import { Link } from 'react-router-dom';
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts';
import { aiApi } from '../middleware/api';
import { readDataFile, detectColumns, sumByLabel } from '../middleware/fileReaders';
import { fileErrorMessage } from '../middleware/fileErrors';
import { apiErrorMessage } from '../middleware/errors';
import { useLang } from '../context/LangContext';
import { useToast } from '../context/ToastContext';
import { localeOf } from '../utils/dates';
import PageHeader from './PageHeader';
import ReportView from './ReportView';
import ExportMenu from './ExportMenu';
import AskAssistant from './AskAssistant';
import Skeleton, { SkeletonText } from './Skeleton';

const MAX_FILES = 3;
const MAX_EXTRACTED_CHARS = 30000;
// El backend calcula las cifras exactas sobre todas estas filas y la IA ve solo una muestra.
const ROWS_TO_AI = 5000;

const CHART_COLORS = ['#3B82F6', '#22C55E', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899'];

/**
 * Módulo genérico de análisis Excel — los 6 subapartados (sección 20).
 *
 * Sesión 4:
 *  - F2: ya no se construye el prompt aquí. Se mandan el módulo, el contexto y
 *    los datos (primeras filas + nº total) y el backend arma el prompt.
 *  - F1: el resultado es un informe estructurado (<ReportView/>).
 *  - C3: "Comparar dos periodos" — dos juegos de archivos (A y B), variación
 *    REAL calculada aquí (totales y por etiqueta) que se pasa a la IA para
 *    que la explique. Vuelve el KPI "Variación" con datos de verdad.
 */
export default function ExcelSubModule({ moduleId, chartType = 'bar' }) {
  const { t, lang } = useLang();
  const title = t(`excelModules.${moduleId}.title`);
  const description = t(`excelModules.${moduleId}.description`);
  const toast = useToast();
  const [mode, setMode] = useState('single'); // single | compare
  const [setA, setSetA] = useState({ label: '', files: [] });
  const [setB, setSetB] = useState({ label: '', files: [] });
  const [contextText, setContextText] = useState('');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);
  const resultRef = useRef(null);

  const compare = mode === 'compare';
  const labelA = setA.label.trim() || t('excel.periodA');
  const labelB = setB.label.trim() || t('excel.periodB');

  const stats = useMemo(() => (compare ? compareStats(setA.files, setB.files) : null), [compare, setA.files, setB.files]);
  const single = useMemo(() => (!compare ? singleChart(setA.files) : null), [compare, setA.files]);

  const payloadFiles = (files) => files.map(f => (f.type === 'excel'
    ? { name: f.name, rows: f.rows.slice(0, ROWS_TO_AI), total_rows: f.rows.length }
    : { name: f.name, text: f.text.slice(0, MAX_EXTRACTED_CHARS) }));

  const canRun = compare ? setA.files.length && setB.files.length : setA.files.length;

  const runAnalysis = async () => {
    if (!canRun || loading) return;
    setLoading(true);
    setErrorMsg(null);
    setResult(null);
    requestAnimationFrame(() => resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    const res = compare
      ? await aiApi.run('compare', {
          module: moduleId, context: contextText,
          periodA: { label: labelA, files: payloadFiles(setA.files) },
          periodB: { label: labelB, files: payloadFiles(setB.files) },
          stats: stats?.forAi
        }, { lang, title: `${title} · ${labelA} vs ${labelB}` })
      : await aiApi.run('excel', { module: moduleId, context: contextText, files: payloadFiles(setA.files) }, { lang, title });
    setLoading(false);

    if (res.ok && res.data.report) {
      setResult(res.data);
      toast.success(t('excel.analysisReady'));
    } else {
      setErrorMsg(apiErrorMessage(t, res, 'excel.analyzeError'));
    }
  };

  const nf = (n) => (Number(n) || 0).toLocaleString(localeOf(lang), { maximumFractionDigits: 2 });
  const allFiles = [...setA.files, ...setB.files];

  return (
    <div className="max-w-4xl flex flex-col gap-5">
      <PageHeader title={title} description={description} />

      <Panel label={t('excel.importTitle')}
        aside={
          <div role="radiogroup" className="inline-flex gap-1 rounded-lg p-0.5" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
            {[['single', t('excel.modeSingle')], ['compare', t('excel.compareMode')]].map(([v, l]) => (
              <button key={v} role="radio" aria-checked={mode === v} onClick={() => { setMode(v); setResult(null); }}
                className="inline-flex items-center gap-1.5 rounded-md px-2.5 h-7 text-xs font-medium normal-case tracking-normal"
                style={mode === v ? { background: 'var(--surface-1)', color: 'var(--text-primary)', boxShadow: '0 0 0 1px var(--border-strong)' } : { color: 'var(--text-secondary)' }}>
                {v === 'compare' && <GitCompareArrows size={13} />}{l}
              </button>
            ))}
          </div>
        }>
        {compare ? (
          <div className="grid md:grid-cols-2 gap-4">
            <FileSet set={setA} onChange={setSetA} placeholder={t('excel.periodA')} labelHint={t('excel.periodLabel')} compact />
            <FileSet set={setB} onChange={setSetB} placeholder={t('excel.periodB')} labelHint={t('excel.periodLabel')} compact />
          </div>
        ) : (
          <FileSet set={setA} onChange={setSetA} />
        )}

        <label htmlFor="excel-context" className="field-label mt-4">{t('excel.contextLabel')}</label>
        <textarea id="excel-context" value={contextText} onChange={(e) => setContextText(e.target.value)}
          placeholder={t('excel.contextPlaceholder')} rows={2} className="input resize-none" />

        {errorMsg && <ErrorLine>{errorMsg}</ErrorLine>}

        <button onClick={runAnalysis} disabled={!canRun || loading} className="btn btn-primary mt-4 w-full sm:w-auto">
          {loading ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}
          {compare ? t('excel.compareBtn') : t('common.analyze')}
        </button>
      </Panel>

      {/* KPIs + gráfica: solo datos DERIVADOS de los archivos */}
      {single?.data.length > 0 && (
        <Panel label={t('excel.chartTitle')}>
          <div className="grid grid-cols-3 gap-2 sm:gap-3 mb-4">
            <MiniKpi label={t('excel.kpiTotal')} value={nf(single.total)} />
            <MiniKpi label={t('excel.kpiRows')} value={nf(single.rows)} />
            <MiniKpi label={t('excel.kpiMax')} value={nf(single.max.value)} hint={single.max.name} />
          </div>
          <div className="h-[240px] sm:h-[280px]">
            <ResponsiveContainer width="100%" height="100%">{renderChart(chartType, single.data)}</ResponsiveContainer>
          </div>
          <p className="text-xs mt-2" style={{ color: 'var(--text-muted)' }}>{t('excel.chartHint')}</p>
        </Panel>
      )}

      {stats?.ready && (
        <Panel label={t('excel.compareTitle')}>
          <div className="grid grid-cols-3 gap-2 sm:gap-3 mb-4">
            <MiniKpi label={labelA} value={nf(stats.totalA)} />
            <MiniKpi label={labelB} value={nf(stats.totalB)} />
            <MiniKpi label={t('excel.kpiVariation')} value={stats.variationPct == null ? '—' : `${stats.variationPct > 0 ? '+' : ''}${nf(stats.variationPct)} %`}
              tone={stats.variationPct == null ? null : stats.variationPct >= 0 ? 'var(--positive)' : 'var(--negative)'} />
          </div>
          <div className="h-[260px] sm:h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stats.chart}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} />
                <YAxis tick={{ fontSize: 11, fill: 'var(--text-muted)' }} />
                <Tooltip {...TOOLTIP_STYLE} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="a" name={labelA} fill="#94A3B8" radius={[4, 4, 0, 0]} />
                <Bar dataKey="b" name={labelB} fill="#3B82F6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p className="text-xs mt-2" style={{ color: 'var(--text-muted)' }}>
            {t('excel.compareHint').replace('{label}', stats.labelKey || '—').replace('{value}', stats.numberKey || '—')}
          </p>
        </Panel>
      )}
      {compare && setA.files.length > 0 && setB.files.length > 0 && !stats?.ready && (
        <p className="text-xs -mt-2" style={{ color: 'var(--text-muted)' }}>{t('excel.compareNoNumbers')}</p>
      )}

      <div ref={resultRef} className="scroll-mt-20 flex flex-col gap-4">
        {loading && (
          <Panel label={t('excel.aiAnalysis')}>
            <div aria-busy="true" aria-live="polite">
              <p className="text-sm font-medium flex items-center gap-2 mb-1" style={{ color: 'var(--text-primary)' }}>
                <Sparkles size={15} style={{ color: 'var(--accent-text)' }} /> {t('excel.analyzing')}
              </p>
              <p className="text-xs mb-5" style={{ color: 'var(--text-muted)' }}>{t('excel.analyzingHint')}</p>
              <Skeleton className="h-4 w-40 mb-3" /><SkeletonText lines={3} />
              <Skeleton className="h-4 w-32 mt-6 mb-3" /><SkeletonText lines={4} />
            </div>
          </Panel>
        )}

        {result && (
          <>
            <div className="flex flex-wrap gap-2">
              <ExportMenu doc={{ title: result.title, report: result.report, actions: result.actions, files: allFiles }} />
              <AskAssistant analysisId={result.analysis_id} />
              <Link to="/app/historial" className="btn btn-ghost btn-sm"><History size={14} /> {t('questionnaire.savedInHistory')}</Link>
            </div>
            <ReportView report={result.report} actions={result.actions} />
          </>
        )}
      </div>
    </div>
  );
}

/** Zona de importación de un juego de archivos (uno o, en C3, uno por periodo). */
function FileSet({ set, onChange, placeholder, labelHint, compact }) {
  const { t, lang } = useLang();
  const [reading, setReading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState(null);
  const [scanned, setScanned] = useState(null);
  const inputRef = useRef(null);
  const filesRef = useRef(set.files);
  filesRef.current = set.files;

  const handleFiles = async (fileList) => {
    setError(null);
    const room = MAX_FILES - filesRef.current.length;
    if (room <= 0) { setError({ message: t('excel.maxFiles') }); return; }
    const all = Array.from(fileList);
    if (all.length > room) setError({ message: t('excel.maxFiles') });
    setReading(true);
    const added = [];
    for (const file of all.slice(0, room)) {
      try {
        const f = await readDataFile(file);
        if (f.type === 'pdf' && f.looksScanned) { setScanned(f); continue; }
        added.push(f);
      } catch (e) {
        console.error('[Excel] No se pudo leer el archivo:', file.name, e);
        setError(fileErrorMessage(t, e, file.name));
      }
    }
    setReading(false);
    if (added.length) onChange(s => ({ ...s, files: [...s.files, ...added] }));
  };

  const open = () => { if (!reading) inputRef.current?.click(); };

  return (
    <div className="min-w-0">
      {placeholder && (
        <input value={set.label} onChange={(e) => onChange(s => ({ ...s, label: e.target.value }))}
          placeholder={placeholder} aria-label={labelHint} className="input mb-2 !h-9 text-sm font-medium" maxLength={40} />
      )}
      <div role="button" tabIndex={0} aria-label={t('excel.importHint')} aria-busy={reading}
        onClick={open}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } }}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); handleFiles(e.dataTransfer.files); }}
        className={`rounded-xl border-2 border-dashed flex flex-col items-center justify-center ${compact ? 'py-6' : 'py-8'} px-4 text-center cursor-pointer`}
        style={{
          borderColor: dragging ? 'var(--accent)' : 'var(--border-strong)',
          background: dragging ? 'var(--accent-soft)' : 'transparent',
          transition: 'border-color var(--dur-fast) var(--ease-std), background-color var(--dur-fast) var(--ease-std)'
        }}>
        {reading
          ? <Loader2 size={26} className="animate-spin" style={{ color: 'var(--accent-text)' }} />
          : <UploadCloud size={26} style={{ color: dragging ? 'var(--accent-text)' : 'var(--text-muted)' }} />}
        <p className="text-sm mt-2 font-medium" style={{ color: 'var(--text-primary)' }}>
          {reading ? t('excel.reading') : <><span className="hidden md:inline">{t('excel.importHint')}</span><span className="md:hidden">{t('excel.importHintMobile')}</span></>}
        </p>
        <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>{t('excel.formats')}</p>
        <input ref={inputRef} type="file" multiple hidden accept=".xlsx,.xls,.csv,.ods,.pdf"
          onChange={(e) => { handleFiles(e.target.files); e.target.value = ''; }} />
      </div>

      {set.files.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-3">
          {set.files.map((f, i) => (
            <div key={`${f.name}-${i}`} className="anim-scale flex items-center gap-2 rounded-lg pl-3 pr-1 py-1 text-xs max-w-full"
              style={{ background: 'var(--surface-2)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}>
              <FileText size={13} className="shrink-0" style={{ color: 'var(--accent-text)' }} />
              <span className="truncate">{f.name}</span>
              {f.type === 'excel' && <span className="shrink-0" style={{ color: 'var(--text-muted)' }}>{f.rows.length.toLocaleString(localeOf(lang))} {t('excel.rowsShort')}</span>}
              <button onClick={() => onChange(s => ({ ...s, files: s.files.filter((_, j) => j !== i) }))} aria-label={t('excel.removeFile')}
                className="shrink-0 rounded-md p-1.5 hover:bg-[var(--surface-1)]" style={{ color: 'var(--text-muted)' }}><X size={13} /></button>
            </div>
          ))}
        </div>
      )}

      {scanned && (
        <div className="anim-msg mt-3 rounded-lg p-3 flex items-start gap-2 text-sm" style={{ background: 'var(--warning-soft)', color: 'var(--warning)' }}>
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <div>
            <p>{t('excel.scannedPdfWarning')}</p>
            <div className="flex gap-3 mt-2">
              <button onClick={() => setScanned(null)} className="text-xs font-medium underline">{t('common.cancel')}</button>
              <button onClick={() => { onChange(s => ({ ...s, files: [...s.files, scanned] })); setScanned(null); }} className="text-xs font-medium underline">
                {t('excel.continueAnyway')}
              </button>
            </div>
          </div>
        </div>
      )}

      {error && <ErrorLine code={error.code}>{error.message}</ErrorLine>}
    </div>
  );
}

/* ── Cálculos deterministas ── */

function excelRows(files) {
  return files.filter(f => f.type === 'excel').flatMap(f => f.rows);
}

function singleChart(files) {
  const rows = excelRows(files);
  if (!rows.length) return { data: [] };
  const { labelKey, numberKey } = detectColumns(rows);
  if (!numberKey) return { data: [] };
  const sums = sumByLabel(rows, labelKey, numberKey);
  const all = [...sums.entries()].map(([name, value]) => ({ name: String(name).slice(0, 18), value }));
  const data = all.slice(0, 12);
  const total = all.reduce((s, d) => s + d.value, 0);
  const max = all.reduce((m, d) => (d.value > m.value ? d : m), all[0] || { value: 0, name: '' });
  return { data, total, rows: rows.length, max };
}

/** C3 — variaciones reales entre dos periodos (totales y por etiqueta). */
function compareStats(filesA, filesB) {
  const rowsA = excelRows(filesA), rowsB = excelRows(filesB);
  if (!rowsA.length || !rowsB.length) return { ready: false };
  const { labelKey, numberKey } = detectColumns(rowsA);
  const colsB = detectColumns(rowsB);
  if (!numberKey || !colsB.numberKey) return { ready: false };
  const a = sumByLabel(rowsA, labelKey, numberKey);
  const b = sumByLabel(rowsB, colsB.labelKey || labelKey, colsB.numberKey);
  const totalA = [...a.values()].reduce((s, v) => s + v, 0);
  const totalB = [...b.values()].reduce((s, v) => s + v, 0);
  const labels = new Set([...a.keys(), ...b.keys()]);
  const changes = [...labels].map(label => {
    const va = a.get(label) || 0, vb = b.get(label) || 0;
    return { label, a: round(va), b: round(vb), diff: round(vb - va), pct: va ? round(((vb - va) / Math.abs(va)) * 100) : null };
  }).sort((x, y) => Math.abs(y.diff) - Math.abs(x.diff));
  const variationPct = totalA ? round(((totalB - totalA) / Math.abs(totalA)) * 100) : null;
  const chart = changes.slice(0, 12).map(c => ({ name: String(c.label).slice(0, 16), a: c.a, b: c.b }));
  return {
    ready: true, labelKey, numberKey, totalA: round(totalA), totalB: round(totalB), variationPct, chart,
    forAi: {
      value_column: numberKey, label_column: labelKey,
      total_a: round(totalA), total_b: round(totalB), variation_pct: variationPct,
      rows_a: rowsA.length, rows_b: rowsB.length,
      biggest_changes: changes.slice(0, 10)
    }
  };
}

const round = (n) => Math.round(n * 100) / 100;

/* ── Presentación ── */

const TOOLTIP_STYLE = {
  contentStyle: { background: 'var(--surface-1)', border: '1px solid var(--border-strong)', borderRadius: 10, fontSize: 12, color: 'var(--text-primary)' },
  labelStyle: { color: 'var(--text-secondary)' },
  itemStyle: { color: 'var(--text-primary)' },
  cursor: { fill: 'var(--surface-2)' }
};

function renderChart(type, data) {
  if (type === 'line') {
    return (
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
        <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} />
        <YAxis tick={{ fontSize: 11, fill: 'var(--text-muted)' }} />
        <Tooltip {...TOOLTIP_STYLE} cursor={{ stroke: 'var(--border-strong)' }} />
        <Line type="monotone" dataKey="value" stroke="#3B82F6" strokeWidth={2} />
      </LineChart>
    );
  }
  if (type === 'pie') {
    return (
      <PieChart>
        <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label>
          {data.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
        </Pie>
        <Tooltip {...TOOLTIP_STYLE} /><Legend wrapperStyle={{ fontSize: 12 }} />
      </PieChart>
    );
  }
  return (
    <BarChart data={data}>
      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
      <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} />
      <YAxis tick={{ fontSize: 11, fill: 'var(--text-muted)' }} />
      <Tooltip {...TOOLTIP_STYLE} />
      <Bar dataKey="value" fill="#3B82F6" radius={[4, 4, 0, 0]} />
    </BarChart>
  );
}

function Panel({ label, aside, children }) {
  return (
    <section className="card p-4 sm:p-5">
      <div className="flex items-center justify-between gap-3 mb-3">
        <h2 className="text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>{label}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

function ErrorLine({ children, code }) {
  return (
    <div role="alert" className="anim-msg mt-3 text-sm rounded-lg px-3 py-2 flex items-start gap-2" style={{ background: 'var(--negative-soft)', color: 'var(--negative)' }}>
      <AlertTriangle size={15} className="mt-0.5 shrink-0" />
      <span className="flex-1">{children}{code && <code className="ml-2 text-[11px] opacity-75">{code}</code>}</span>
    </div>
  );
}

function MiniKpi({ label, value, hint, tone }) {
  return (
    <div className="rounded-lg p-2.5 sm:p-3 min-w-0" style={{ background: 'var(--surface-2)' }}>
      <p className="text-[11px] sm:text-xs truncate" style={{ color: 'var(--text-muted)' }}>{label}</p>
      <p className="text-base sm:text-lg font-semibold tabular truncate" style={{ color: tone || 'var(--text-primary)' }}>{value}</p>
      {hint && <p className="text-[11px] sm:text-xs truncate" style={{ color: 'var(--text-muted)' }}>{hint}</p>}
    </div>
  );
}

export { ErrorLine, Panel, MiniKpi };
