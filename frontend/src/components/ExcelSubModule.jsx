import { useState, useRef, useCallback } from 'react';
import { UploadCloud, FileText, X, Loader2, Download, AlertTriangle, Sparkles } from 'lucide-react';
import * as XLSX from 'xlsx';
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts';
import { aiApi } from '../middleware/api';
import { sanitizeAiHtml } from '../middleware/sanitize';
import { extractPdfText } from '../middleware/pdfExtract';
import { exportAnalysisToPdf, exportDataToExcel } from '../middleware/exportUtils';
import { apiErrorMessage } from '../middleware/errors';
import { useLang } from '../context/LangContext';
import { useToast } from '../context/ToastContext';
import { localeOf } from '../utils/dates';
import { aiLanguageDirective } from '../utils/aiLang';
import PageHeader from './PageHeader';
import Skeleton, { SkeletonText } from './Skeleton';

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB — sección 20 del proyecto, Capa 4
const MAX_FILES = 3;
const MAX_EXTRACTED_CHARS = 30000;

const CHART_COLORS = ['#3B82F6', '#22C55E', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899'];

/**
 * Módulo genérico de análisis Excel — comparte estructura en los 6 subapartados
 * (sección 20 del proyecto). Cada subapartado pasa su propia config:
 *   title, promptBase, chartType, parseRows (cómo convertir la hoja en datos de gráfica)
 */
export default function ExcelSubModule({ moduleId, promptBase, chartType = 'bar' }) {
  const { t, lang } = useLang();
  // Título y descripción en el idioma de la app (i18n excelModules.<id>). El
  // título también etiqueta el análisis guardado en el historial.
  const title = t(`excelModules.${moduleId}.title`);
  const description = t(`excelModules.${moduleId}.description`);
  const toast = useToast();
  const [files, setFiles] = useState([]); // { name, rows, context }
  const [contextText, setContextText] = useState('');
  const [chartData, setChartData] = useState([]);
  const [analysis, setAnalysis] = useState(null);
  const [loading, setLoading] = useState(false);
  const [reading, setReading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);
  const [scannedWarning, setScannedWarning] = useState(null);
  const [recentFiles, setRecentFiles] = useState([]);
  const fileInputRef = useRef(null);
  const resultRef = useRef(null);
  // Nº de archivos ya cargados, legible dentro del useCallback sin re-crearlo:
  // antes MAX_FILES solo limitaba cada selección, no el total acumulado.
  const filesCountRef = useRef(0);
  filesCountRef.current = files.length;

  const handleFiles = useCallback(async (fileList) => {
    setErrorMsg(null);
    const room = MAX_FILES - filesCountRef.current;
    if (room <= 0) { setErrorMsg(t('excel.maxFiles')); return; }
    const all = Array.from(fileList);
    const arr = all.slice(0, room);
    if (all.length > room) setErrorMsg(t('excel.maxFiles'));
    const processedNames = [];
    setReading(true);

    for (const file of arr) {
      // #3 (sesión 2): try/catch POR ARCHIVO — un PDF protegido/corrupto o un
      // Excel ilegible rechazaba la promesa y abortaba el bucle entero con una
      // rejection silenciosa (el usuario veía que "no pasaba nada"). Ahora el
      // archivo fallido se marca con un mensaje y el resto se procesa igual.
      try {
        if (file.size > MAX_FILE_SIZE) {
          setErrorMsg(t('excel.tooBig').replace('{name}', file.name));
          continue;
        }

        if (file.name.toLowerCase().endsWith('.pdf')) {
          // Capa 1 y 2 del sistema de PDFs (sección 20)
          const { text, looksScanned } = await extractPdfText(file);
          if (looksScanned) {
            setScannedWarning({ fileName: file.name, text });
            continue;
          }
          const truncated = text.slice(0, MAX_EXTRACTED_CHARS);
          setFiles(prev => [...prev, { name: file.name, type: 'pdf', text: truncated, rows: null, size: file.size }]);
        } else {
          // Excel/CSV vía SheetJS
          const buffer = await file.arrayBuffer();
          const workbook = XLSX.read(buffer, { type: 'array' });
          const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
          const rows = XLSX.utils.sheet_to_json(firstSheet, { defval: '' });
          setFiles(prev => [...prev, { name: file.name, type: 'excel', rows, text: null, size: file.size }]);
          updateChartFromRows(rows);
        }
        processedNames.push(file.name);
      } catch (e) {
        console.error('[ExcelSubModule] No se pudo leer el archivo:', file.name, e);
        setErrorMsg(t('excel.readError').replace('{name}', file.name));
      }
    }
    setReading(false);

    if (processedNames.length) {
      const now = new Date().toLocaleString(localeOf(lang), { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
      setRecentFiles(prev => [...processedNames.map(name => ({ name, date: now })), ...prev].slice(0, 5));
    }
  }, [t, lang]);

  const updateChartFromRows = (rows) => {
    if (!rows.length) return;
    // Heurística genérica: busca una columna de texto (nombre/producto) y una numérica (cantidad/importe)
    const keys = Object.keys(rows[0]);
    const labelKey = keys.find(k => typeof rows[0][k] === 'string') || keys[0];
    const numberKey = keys.find(k => typeof rows[0][k] === 'number') || keys[1];
    if (!numberKey) return;

    const data = rows.slice(0, 12).map(r => ({
      name: String(r[labelKey] ?? '').slice(0, 18),
      value: Number(r[numberKey]) || 0
    }));
    setChartData(data);
  };

  const removeFile = (idx) => setFiles(prev => prev.filter((_, i) => i !== idx));

  const buildPrompt = () => {
    const dataSummary = files.map(f => {
      if (f.type === 'excel') {
        return `Archivo "${f.name}" (${f.rows.length} filas):\n${JSON.stringify(f.rows.slice(0, 60))}`;
      }
      return `Archivo "${f.name}" (texto extraído del PDF):\n${f.text}`;
    }).join('\n\n');

    return `${promptBase}\n\nContexto añadido por el usuario: ${contextText || 'ninguno'}\n\nDATOS:\n${dataSummary}\n\nResponde en HTML (sin html/body/head) con: resumen, hallazgos clave, alertas, oportunidades y recomendaciones concretas. Sin emojis, tono profesional. ${aiLanguageDirective(lang)}`;
  };

  const runAnalysis = async () => {
    if (!files.length || loading) return;
    setLoading(true);
    setErrorMsg(null);
    setAnalysis(null);
    requestAnimationFrame(() => resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    const res = await aiApi.analyze(buildPrompt(), 1500, { kind: 'excel', title });
    setLoading(false);

    if (res.ok && res.data.text) {
      setAnalysis(res.data.text);
      toast.success(t('excel.analysisReady'));
    } else {
      setErrorMsg(apiErrorMessage(t, res, 'excel.analyzeError'));
    }
  };

  const openPicker = () => { if (!reading) fileInputRef.current?.click(); };
  const total = chartData.reduce((s, d) => s + d.value, 0);
  const max = chartData.reduce((m, d) => (d.value > m.value ? d : m), chartData[0] || { value: 0, name: '' });
  const nf = (n) => n.toLocaleString(localeOf(lang), { maximumFractionDigits: 2 });

  return (
    <div className="max-w-4xl flex flex-col gap-5">
      <PageHeader title={title} description={description} />

      {/* Zona 1 — Importar */}
      <Panel label={t('excel.importTitle')}>
        <div
          role="button" tabIndex={0} aria-label={t('excel.importHint')} aria-busy={reading}
          onClick={openPicker}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openPicker(); } }}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => { e.preventDefault(); setDragging(false); handleFiles(e.dataTransfer.files); }}
          className="rounded-xl border-2 border-dashed flex flex-col items-center justify-center py-8 px-4 text-center cursor-pointer"
          style={{
            borderColor: dragging ? 'var(--accent)' : 'var(--border-strong)',
            background: dragging ? 'var(--accent-soft)' : 'transparent',
            transition: 'border-color var(--dur-fast) var(--ease-std), background-color var(--dur-fast) var(--ease-std)'
          }}
        >
          {reading
            ? <Loader2 size={28} className="animate-spin" style={{ color: 'var(--accent-text)' }} />
            : <UploadCloud size={28} style={{ color: dragging ? 'var(--accent-text)' : 'var(--text-muted)', transition: 'transform var(--dur-base) var(--ease-out)', transform: dragging ? 'translateY(-3px)' : 'none' }} />}
          <p className="text-sm mt-2 font-medium" style={{ color: 'var(--text-primary)' }}>
            {reading ? t('excel.reading') : <><span className="hidden md:inline">{t('excel.importHint')}</span><span className="md:hidden">{t('excel.importHintMobile')}</span></>}
          </p>
          <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>{t('excel.formats')}</p>
          {/* value='' tras cada selección: si no, elegir el MISMO archivo otra
              vez (tras quitarlo) no disparaba onChange y "no pasaba nada". */}
          <input ref={fileInputRef} type="file" multiple hidden accept=".xlsx,.xls,.csv,.pdf"
            onChange={(e) => { handleFiles(e.target.files); e.target.value = ''; }} />
        </div>

        {files.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-3">
            {files.map((f, i) => (
              <div key={`${f.name}-${i}`} className="anim-scale flex items-center gap-2 rounded-lg pl-3 pr-1 py-1 text-xs max-w-full"
                style={{ background: 'var(--surface-2)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}>
                <FileText size={13} className="shrink-0" style={{ color: 'var(--accent-text)' }} />
                <span className="truncate">{f.name}</span>
                {f.size != null && <span className="shrink-0" style={{ color: 'var(--text-muted)' }}>{formatSize(f.size)}</span>}
                <button onClick={() => removeFile(i)} aria-label={t('excel.removeFile')} className="shrink-0 rounded-md p-1.5 hover:bg-[var(--surface-1)]"
                  style={{ color: 'var(--text-muted)' }}><X size={13} /></button>
              </div>
            ))}
          </div>
        )}

        {scannedWarning && (
          <div className="anim-msg mt-3 rounded-lg p-3 flex items-start gap-2 text-sm" style={{ background: 'var(--warning-soft)', color: 'var(--warning)' }}>
            <AlertTriangle size={16} className="mt-0.5 shrink-0" />
            <div>
              <p>{t('excel.scannedPdfWarning')}</p>
              <div className="flex gap-3 mt-2">
                <button onClick={() => setScannedWarning(null)} className="text-xs font-medium underline">{t('common.cancel')}</button>
                <button
                  onClick={() => {
                    setFiles(prev => [...prev, { name: scannedWarning.fileName, type: 'pdf', text: scannedWarning.text.slice(0, MAX_EXTRACTED_CHARS), rows: null }]);
                    setScannedWarning(null);
                  }}
                  className="text-xs font-medium underline"
                >
                  {t('excel.continueAnyway')}
                </button>
              </div>
            </div>
          </div>
        )}

        <label htmlFor="excel-context" className="field-label mt-4">{t('excel.contextLabel')}</label>
        <textarea
          id="excel-context"
          value={contextText}
          onChange={(e) => setContextText(e.target.value)}
          placeholder={t('excel.contextPlaceholder')}
          rows={2}
          className="input resize-none"
        />

        {errorMsg && (
          <div role="alert" className="anim-msg mt-3 text-sm rounded-lg px-3 py-2 flex items-start gap-2" style={{ background: 'var(--negative-soft)', color: 'var(--negative)' }}>
            <AlertTriangle size={15} className="mt-0.5 shrink-0" /> <span>{errorMsg}</span>
          </div>
        )}

        <button
          onClick={runAnalysis}
          disabled={!files.length || loading || reading}
          className="btn btn-primary mt-4 w-full sm:w-auto"
        >
          {loading ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}
          {t('common.analyze')}
        </button>

        {recentFiles.length > 0 && (
          <div className="mt-5">
            <p className="text-xs font-medium uppercase tracking-wide mb-2" style={{ color: 'var(--text-muted)' }}>{t('excel.recentFiles')}</p>
            <div className="flex flex-col gap-1">
              {recentFiles.map((f, i) => (
                <div key={i} className="text-xs flex justify-between gap-3" style={{ color: 'var(--text-secondary)' }}>
                  <span className="truncate">{f.name}</span><span className="shrink-0" style={{ color: 'var(--text-muted)' }}>{f.date}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </Panel>

      {/* Zona 2 — KPIs + Gráfica. Solo datos DERIVADOS del archivo (antes había
          "Variación —" y "Alertas 0" fijos, que no significaban nada). */}
      {chartData.length > 0 && (
        <Panel label={t('excel.chartTitle')}>
          <div className="grid grid-cols-3 gap-2 sm:gap-3 mb-4">
            <MiniKpi label={t('excel.kpiTotal')} value={nf(total)} />
            <MiniKpi label={t('excel.kpiRows')} value={nf(chartData.length)} />
            <MiniKpi label={t('excel.kpiMax')} value={nf(max.value)} hint={max.name} />
          </div>
          <div className="h-[240px] sm:h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              {renderChart(chartType, chartData)}
            </ResponsiveContainer>
          </div>
          <p className="text-xs mt-2" style={{ color: 'var(--text-muted)' }}>{t('excel.chartHint')}</p>
        </Panel>
      )}

      {/* Zona 3 — Análisis IA (skeleton con la forma del informe mientras piensa) */}
      <div ref={resultRef} className="scroll-mt-20">
        {loading && (
          <Panel label={t('excel.aiAnalysis')}>
            <div aria-busy="true" aria-live="polite">
              <p className="text-sm font-medium flex items-center gap-2 mb-1" style={{ color: 'var(--text-primary)' }}>
                <Sparkles size={15} style={{ color: 'var(--accent-text)' }} /> {t('excel.analyzing')}
              </p>
              <p className="text-xs mb-5" style={{ color: 'var(--text-muted)' }}>{t('excel.analyzingHint')}</p>
              <Skeleton className="h-4 w-40 mb-3" />
              <SkeletonText lines={3} />
              <Skeleton className="h-4 w-32 mt-6 mb-3" />
              <SkeletonText lines={4} />
            </div>
          </Panel>
        )}

        {analysis && (
          <Panel label={t('excel.aiAnalysis')}>
            <div className="prose-report anim-fade" style={{ color: 'var(--text-primary)' }} dangerouslySetInnerHTML={{ __html: sanitizeAiHtml(analysis) }} />
            {/* Zona 4 — Exportar */}
            <div className="flex flex-wrap gap-2 mt-5 pt-4" style={{ borderTop: '1px solid var(--border)' }}>
              <button onClick={() => exportAnalysisToPdf(title, analysis)} className="btn btn-secondary btn-sm">
                <Download size={14} /> PDF
              </button>
              <button onClick={() => exportDataToExcel(title, files, analysis, { sheet: t('excel.exportSheet'), column: t('excel.exportColumn') })} className="btn btn-secondary btn-sm">
                <Download size={14} /> Excel
              </button>
            </div>
          </Panel>
        )}
      </div>
    </div>
  );
}

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

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

function Panel({ label, children }) {
  return (
    <section className="card p-4 sm:p-5">
      <h2 className="text-xs font-medium uppercase tracking-wide mb-3" style={{ color: 'var(--text-muted)' }}>{label}</h2>
      {children}
    </section>
  );
}

function MiniKpi({ label, value, hint }) {
  return (
    <div className="rounded-lg p-2.5 sm:p-3 min-w-0" style={{ background: 'var(--surface-2)' }}>
      <p className="text-[11px] sm:text-xs truncate" style={{ color: 'var(--text-muted)' }}>{label}</p>
      <p className="text-base sm:text-lg font-semibold tabular truncate" style={{ color: 'var(--text-primary)' }}>{value}</p>
      {hint && <p className="text-[11px] sm:text-xs truncate" style={{ color: 'var(--text-muted)' }}>{hint}</p>}
    </div>
  );
}
