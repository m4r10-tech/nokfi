import { useState, useRef, useCallback } from 'react';
import { UploadCloud, FileText, X, Loader2, Download, AlertTriangle } from 'lucide-react';
import * as XLSX from 'xlsx';
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts';
import { aiApi } from '../middleware/api';
import { sanitizeAiHtml } from '../middleware/sanitize';
import { extractPdfText } from '../middleware/pdfExtract';
import { exportAnalysisToPdf, exportDataToExcel } from '../middleware/exportUtils';

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB — sección 20 del proyecto, Capa 4
const MAX_FILES = 3;
const MAX_EXTRACTED_CHARS = 30000;

const CHART_COLORS = ['#3B82F6', '#22C55E', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899'];

/**
 * Módulo genérico de análisis Excel — comparte estructura en los 6 subapartados
 * (sección 20 del proyecto). Cada subapartado pasa su propia config:
 *   title, promptBase, chartType, parseRows (cómo convertir la hoja en datos de gráfica)
 */
export default function ExcelSubModule({ title, description, promptBase, chartType = 'bar' }) {
  const [files, setFiles] = useState([]); // { name, rows, context }
  const [contextText, setContextText] = useState('');
  const [chartData, setChartData] = useState([]);
  const [analysis, setAnalysis] = useState(null);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);
  const [scannedWarning, setScannedWarning] = useState(null);
  const [recentFiles, setRecentFiles] = useState([]);
  const fileInputRef = useRef(null);

  const handleFiles = useCallback(async (fileList) => {
    setErrorMsg(null);
    const arr = Array.from(fileList).slice(0, MAX_FILES);

    for (const file of arr) {
      if (file.size > MAX_FILE_SIZE) {
        setErrorMsg(`"${file.name}" supera el límite de 5MB.`);
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
        setFiles(prev => [...prev, { name: file.name, type: 'pdf', text: truncated, rows: null }]);
      } else {
        // Excel/CSV vía SheetJS
        const buffer = await file.arrayBuffer();
        const workbook = XLSX.read(buffer, { type: 'array' });
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(firstSheet, { defval: '' });
        setFiles(prev => [...prev, { name: file.name, type: 'excel', rows, text: null }]);
        updateChartFromRows(rows);
      }
    }

    setRecentFiles(prev => [...arr.map(f => ({ name: f.name, date: new Date().toLocaleString('es-ES') })), ...prev].slice(0, 5));
  }, []);

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

    return `${promptBase}\n\nContexto añadido por el usuario: ${contextText || 'ninguno'}\n\nDATOS:\n${dataSummary}\n\nResponde en HTML (sin html/body/head) con: resumen, hallazgos clave, alertas, oportunidades y recomendaciones concretas. Sin emojis, en español, tono profesional.`;
  };

  const runAnalysis = async () => {
    if (!files.length) return;
    setLoading(true);
    setErrorMsg(null);
    const { ok, data, quotaExceeded } = await aiApi.analyze(buildPrompt(), 1500);
    setLoading(false);

    if (ok && data.text) {
      setAnalysis(data.text);
    } else if (quotaExceeded) {
      setErrorMsg('El servicio de análisis ha alcanzado su límite diario. Inténtalo de nuevo más tarde.');
    } else {
      setErrorMsg(data.message || 'No se pudo generar el análisis.');
    }
  };

  return (
    <div className="max-w-4xl flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold" style={{ color: 'var(--text-primary)' }}>{title}</h1>
        <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>{description}</p>
      </div>

      {/* Zona 1 — Importar */}
      <Panel label="Importar archivos">
        <div
          onClick={() => fileInputRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); handleFiles(e.dataTransfer.files); }}
          className="rounded-xl border-2 border-dashed flex flex-col items-center justify-center py-8 cursor-pointer transition-colors"
          style={{ borderColor: 'var(--border-strong)' }}
        >
          <UploadCloud size={28} style={{ color: 'var(--text-muted)' }} />
          <p className="text-sm mt-2" style={{ color: 'var(--text-secondary)' }}>Arrastra archivos o haz clic para seleccionar</p>
          <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>.xlsx, .xls, .csv, .pdf · Máx 5MB · Hasta 3 archivos</p>
          <input ref={fileInputRef} type="file" multiple hidden accept=".xlsx,.xls,.csv,.pdf"
            onChange={(e) => handleFiles(e.target.files)} />
        </div>

        {files.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-3">
            {files.map((f, i) => (
              <div key={i} className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs" style={{ background: 'var(--surface-2)', color: 'var(--text-primary)' }}>
                <FileText size={13} /> {f.name}
                <button onClick={() => removeFile(i)} style={{ color: 'var(--text-muted)' }}><X size={13} /></button>
              </div>
            ))}
          </div>
        )}

        {scannedWarning && (
          <div className="mt-3 rounded-lg p-3 flex items-start gap-2 text-sm" style={{ background: 'var(--warning-soft)', color: 'var(--warning)' }}>
            <AlertTriangle size={16} className="mt-0.5 shrink-0" />
            <div>
              <p>Este PDF parece ser una imagen escaneada.</p>
              <div className="flex gap-2 mt-2">
                <button onClick={() => setScannedWarning(null)} className="text-xs font-medium underline">Cancelar</button>
                <button
                  onClick={() => {
                    setFiles(prev => [...prev, { name: scannedWarning.fileName, type: 'pdf', text: scannedWarning.text.slice(0, MAX_EXTRACTED_CHARS), rows: null }]);
                    setScannedWarning(null);
                  }}
                  className="text-xs font-medium underline"
                >
                  Continuar igualmente
                </button>
              </div>
            </div>
          </div>
        )}

        <textarea
          value={contextText}
          onChange={(e) => setContextText(e.target.value)}
          placeholder="Añade contexto para que la IA entienda este archivo..."
          rows={2}
          className="w-full rounded-lg mt-3 p-3 text-sm outline-none resize-none"
          style={{ background: 'var(--surface-2)', border: '0.5px solid var(--border-strong)', color: 'var(--text-primary)' }}
        />

        {errorMsg && (
          <div className="mt-3 text-sm rounded-lg px-3 py-2" style={{ background: 'var(--negative-soft)', color: 'var(--negative)' }}>{errorMsg}</div>
        )}

        <button
          onClick={runAnalysis}
          disabled={!files.length || loading}
          className="mt-3 rounded-lg px-4 py-2 text-sm font-medium flex items-center gap-2 disabled:opacity-40"
          style={{ background: 'var(--accent)', color: '#fff' }}
        >
          {loading && <Loader2 size={14} className="animate-spin" />}
          Analizar con IA
        </button>

        {recentFiles.length > 0 && (
          <div className="mt-4">
            <p className="text-xs font-medium uppercase tracking-wide mb-2" style={{ color: 'var(--text-muted)' }}>Archivos recientes</p>
            <div className="flex flex-col gap-1">
              {recentFiles.map((f, i) => (
                <div key={i} className="text-xs flex justify-between" style={{ color: 'var(--text-secondary)' }}>
                  <span>{f.name}</span><span style={{ color: 'var(--text-muted)' }}>{f.date}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </Panel>

      {/* Zona 2 — KPIs + Gráfica */}
      {chartData.length > 0 && (
        <Panel label="Gráfica interactiva">
          <div className="grid grid-cols-3 gap-3 mb-4">
            <MiniKpi label="Total período" value={chartData.reduce((s, d) => s + d.value, 0).toLocaleString('es-ES')} />
            <MiniKpi label="Variación" value="—" hint="Sube otro archivo para comparar" />
            <MiniKpi label="Alertas" value="0" />
          </div>
          <ResponsiveContainer width="100%" height={280}>
            {renderChart(chartType, chartData)}
          </ResponsiveContainer>
        </Panel>
      )}

      {/* Zona 3 — Análisis IA */}
      {analysis && (
        <Panel label="Análisis de la IA">
          <div className="prose-report" style={{ color: 'var(--text-primary)' }} dangerouslySetInnerHTML={{ __html: sanitizeAiHtml(analysis) }} />
        </Panel>
      )}

      {/* Zona 4 — Exportar */}
      {analysis && (
        <Panel label="Exportar resultado">
          <div className="flex gap-2">
            <button onClick={() => exportAnalysisToPdf(title, analysis)} className="rounded-lg px-4 py-2 text-sm font-medium flex items-center gap-2"
              style={{ background: 'var(--surface-2)', color: 'var(--text-primary)', border: '0.5px solid var(--border-strong)' }}>
              <Download size={14} /> PDF
            </button>
            <button onClick={() => exportDataToExcel(title, files, analysis)} className="rounded-lg px-4 py-2 text-sm font-medium flex items-center gap-2"
              style={{ background: 'var(--surface-2)', color: 'var(--text-primary)', border: '0.5px solid var(--border-strong)' }}>
              <Download size={14} /> Excel
            </button>
          </div>
        </Panel>
      )}
    </div>
  );
}

function renderChart(type, data) {
  if (type === 'line') {
    return (
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
        <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} />
        <YAxis tick={{ fontSize: 11, fill: 'var(--text-muted)' }} />
        <Tooltip />
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
        <Tooltip /><Legend />
      </PieChart>
    );
  }
  return (
    <BarChart data={data}>
      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
      <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} />
      <YAxis tick={{ fontSize: 11, fill: 'var(--text-muted)' }} />
      <Tooltip />
      <Bar dataKey="value" fill="#3B82F6" radius={[4, 4, 0, 0]} />
    </BarChart>
  );
}

function Panel({ label, children }) {
  return (
    <div className="rounded-xl p-5" style={{ background: 'var(--surface-1)', border: '0.5px solid var(--border)' }}>
      <p className="text-xs font-medium uppercase tracking-wide mb-3" style={{ color: 'var(--text-muted)' }}>{label}</p>
      {children}
    </div>
  );
}

function MiniKpi({ label, value, hint }) {
  return (
    <div className="rounded-lg p-3" style={{ background: 'var(--surface-2)' }}>
      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{label}</p>
      <p className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>{value}</p>
      {hint && <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{hint}</p>}
    </div>
  );
}
