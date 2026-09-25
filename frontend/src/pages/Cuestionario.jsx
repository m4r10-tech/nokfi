import { useState } from 'react';
import { useOutletContext, Link } from 'react-router-dom';
import { Check, X, RefreshCw, RotateCw, ArrowLeft, ArrowRight, Download, Sparkles, AlertCircle, History } from 'lucide-react';
import { aiApi } from '../middleware/api';
import { sanitizeAiHtml } from '../middleware/sanitize';
import { apiErrorMessage } from '../middleware/errors';
import { exportAnalysisToPdf } from '../middleware/exportUtils';
import { useToast } from '../context/ToastContext';
import { useLang } from '../context/LangContext';
import PageHeader from '../components/PageHeader';
import Skeleton, { SkeletonText } from '../components/Skeleton';

const SECTIONS = [
  {
    title: 'Ingresos y ventas',
    items: [
      { id: 'facturacion', name: 'Facturación registrada' },
      { id: 'control_cobros', name: 'Control de cobros' },
      { id: 'previsiones_ventas', name: 'Previsiones de ventas' },
      { id: 'descuentos', name: 'Política de descuentos' },
      { id: 'clientes_recurrentes', name: 'Clientes recurrentes' },
      { id: 'margen_producto', name: 'Margen por producto/servicio' }
    ]
  },
  {
    title: 'Gastos y costes',
    items: [
      { id: 'gastos_fijos', name: 'Gastos fijos registrados' },
      { id: 'gastos_variables', name: 'Gastos variables' },
      { id: 'presupuesto_mensual', name: 'Presupuesto mensual' },
      { id: 'tickets_digitales', name: 'Tickets y justificantes digitales' },
      { id: 'gastos_personal', name: 'Gastos de personal' },
      { id: 'revision_proveedores', name: 'Revisión de proveedores' }
    ]
  },
  {
    title: 'Pedidos y stock',
    items: [
      { id: 'gestion_pedidos', name: 'Gestión de pedidos' },
      { id: 'control_stock', name: 'Control de stock/inventario' },
      { id: 'productos_top', name: 'Productos más vendidos' },
      { id: 'productos_bajos', name: 'Productos poco rentables' },
      { id: 'punto_pedido', name: 'Punto de pedido automático' },
      { id: 'devoluciones', name: 'Gestión de devoluciones' }
    ]
  },
  {
    title: 'Tesorería y finanzas',
    items: [
      { id: 'conciliacion', name: 'Conciliación bancaria' },
      { id: 'flujo_caja', name: 'Flujo de caja (cash flow)' },
      { id: 'fondo_reserva', name: 'Fondo de reserva' },
      { id: 'financiacion', name: 'Gestión de financiación' },
      { id: 'impuestos', name: 'Planificación fiscal' },
      { id: 'rentabilidad', name: 'Análisis de rentabilidad' }
    ]
  },
  {
    title: 'Reporting e informes',
    items: [
      { id: 'dashboard', name: 'Dashboard o panel de control' },
      { id: 'informe_mensual', name: 'Informe mensual' },
      { id: 'comparativa_periodos', name: 'Comparativa con periodos anteriores' },
      { id: 'alertas_automaticas', name: 'Alertas automáticas' },
      { id: 'kpi_ventas', name: 'KPIs de ventas' },
      { id: 'gestor_externo', name: 'Asesor o gestoría' }
    ]
  }
];

const REPORT_TITLE = 'Diagnóstico de negocio';

export default function Cuestionario() {
  const { profile } = useOutletContext();
  const { t } = useLang();
  const toast = useToast();
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState({});
  const [phase, setPhase] = useState('form'); // form | loading | result | error
  const [report, setReport] = useState('');
  const [errorMsg, setErrorMsg] = useState(null);

  const setAnswer = (id, val) => setAnswers(a => ({ ...a, [id]: val }));
  const isLast = step === SECTIONS.length - 1;

  const buildPrompt = () => {
    const yes = [], no = [];
    SECTIONS.forEach(sec => sec.items.forEach(item => {
      if (answers[item.id] === true) yes.push(item.name);
      if (answers[item.id] === false) no.push(item.name);
    }));

    return `Eres un consultor financiero experto en pymes y autónomos españoles. Analiza el negocio "${profile.companyName || 'sin nombre'}" (sector: ${profile.sector || 'no especificado'}, tamaño: ${profile.size || 'no especificado'}).

ÁREAS QUE SÍ GESTIONA (${yes.length}):
${yes.map(i => '- ' + i).join('\n') || '- Ninguna'}

ÁREAS QUE NO GESTIONA (${no.length}):
${no.map(i => '- ' + i).join('\n') || '- Ninguna'}

Genera un diagnóstico en HTML (sin html/body/head) con:
1. Un párrafo de estado general (máx 3 frases)
2. <h3>Puntos fuertes</h3>
3. <h3>Áreas críticas a mejorar</h3> con las 3-5 más importantes, formato <ul><li>
4. <h3>Reducción de gastos</h3> con pasos concretos
5. <h3>Plan de acción — próximos 30 días</h3>
6. <h3>Automatizaciones recomendadas</h3>

Tono profesional, directo, accionable. Sin emojis. Responde en español.`;
  };

  const runAnalysis = async () => {
    setPhase('loading');
    setErrorMsg(null);
    const res = await aiApi.analyze(buildPrompt(), 1800, { kind: 'cuestionario', title: REPORT_TITLE });

    if (res.ok && res.data.text) {
      setReport(res.data.text);
      setPhase('result');
      toast.success(t('questionnaire.ready'));
    } else {
      setErrorMsg(apiErrorMessage(t, res, 'excel.analyzeError'));
      setPhase('error');
    }
  };

  const restart = () => { setStep(0); setAnswers({}); setPhase('form'); setReport(''); };

  if (phase === 'loading') {
    return (
      <div className="max-w-3xl" aria-busy="true" aria-live="polite">
        <PageHeader title={t('questionnaire.resultTitle')} />
        <div className="card p-5 md:p-7">
          <p className="text-sm font-medium flex items-center gap-2 mb-1" style={{ color: 'var(--text-primary)' }}>
            <Sparkles size={15} style={{ color: 'var(--accent-text)' }} /> {t('questionnaire.analyzing')}
          </p>
          <p className="text-xs mb-6" style={{ color: 'var(--text-muted)' }}>{t('excel.analyzingHint')}</p>
          <SkeletonText lines={3} />
          {[0, 1, 2].map(i => (
            <div key={i} className="mt-7"><Skeleton className="h-4 w-44 mb-3" /><SkeletonText lines={3} /></div>
          ))}
        </div>
      </div>
    );
  }

  if (phase === 'error') {
    // Sesión 3: antes el único botón era "Reiniciar", que BORRABA las 30
    // respuestas (p.ej. tras agotar la cuota). Ahora se conservan.
    return (
      <div className="max-w-xl mx-auto py-10 md:py-16 flex flex-col items-center text-center gap-3 anim-fade">
        <div className="rounded-full p-3" style={{ background: 'var(--negative-soft)', color: 'var(--negative)' }}><AlertCircle size={22} /></div>
        <p className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>{t('questionnaire.errorTitle')}</p>
        <p role="alert" className="text-sm max-w-md" style={{ color: 'var(--text-secondary)' }}>{errorMsg}</p>
        <div className="flex flex-col sm:flex-row gap-2 mt-3 w-full sm:w-auto">
          <button onClick={runAnalysis} className="btn btn-primary"><RotateCw size={15} /> {t('common.retry')}</button>
          <button onClick={() => setPhase('form')} className="btn btn-secondary"><ArrowLeft size={15} /> {t('questionnaire.backToAnswers')}</button>
        </div>
      </div>
    );
  }

  if (phase === 'result') {
    return (
      <div className="max-w-3xl">
        <PageHeader title={t('questionnaire.resultTitle')} description={profile.companyName || undefined} />
        <div className="flex flex-wrap gap-2 mb-4">
          <button onClick={() => exportAnalysisToPdf(REPORT_TITLE, report)} className="btn btn-secondary btn-sm"><Download size={14} /> PDF</button>
          <Link to="/app/historial" className="btn btn-ghost btn-sm"><History size={14} /> {t('questionnaire.savedInHistory')}</Link>
        </div>
        <div className="card p-5 md:p-7 prose-report anim-fade" style={{ color: 'var(--text-primary)' }}
          dangerouslySetInnerHTML={{ __html: sanitizeAiHtml(report) }} />
        <button onClick={restart} className="btn btn-secondary mt-4 w-full sm:w-auto">
          <RefreshCw size={14} /> {t('questionnaire.newAnalysis')}
        </button>
      </div>
    );
  }

  const section = SECTIONS[step];
  const answeredInSection = section.items.every(item => answers[item.id] !== undefined);
  const totalQuestions = SECTIONS.reduce((n, sec) => n + sec.items.length, 0);
  const answeredTotal = Object.keys(answers).length;

  return (
    <div className="max-w-3xl">
      <PageHeader title={t('questionnaire.title')} description={t('questionnaire.subtitle')} />

      {/* Progreso: pasos + barra por preguntas respondidas (antes marcaba 0%
          durante toda la primera sección). */}
      <div className="mb-5">
        <div className="flex items-center justify-between text-xs mb-2" style={{ color: 'var(--text-muted)' }}>
          <span className="font-medium" style={{ color: 'var(--text-secondary)' }}>
            {t('questionnaire.sectionOf').replace('{n}', step + 1).replace('{total}', SECTIONS.length)} · {section.title}
          </span>
          <span className="tabular">{answeredTotal}/{totalQuestions}</span>
        </div>
        <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--surface-2)' }}>
          <div className="h-full rounded-full" style={{
            width: `${(answeredTotal / totalQuestions) * 100}%`, background: 'var(--accent)',
            transition: 'width var(--dur-slow) var(--ease-out)'
          }} />
        </div>
      </div>

      <p className="text-sm mb-4" style={{ color: 'var(--text-secondary)' }}>{t('questionnaire.question')}</p>

      <div key={step} className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
        {section.items.map((item, i) => {
          const v = answers[item.id];
          return (
            <div key={item.id} className="card anim-enter p-4" style={{
              '--i': i,
              borderColor: v === true ? 'var(--positive)' : v === false ? 'var(--negative)' : 'var(--border)',
              transition: 'border-color var(--dur-base) var(--ease-std)'
            }}>
              <div className="text-sm font-medium mb-3" style={{ color: 'var(--text-primary)' }}>{item.name}</div>
              <div className="flex gap-2">
                <ToggleBtn active={v === true} color="positive" icon={Check} onClick={() => setAnswer(item.id, true)} label={t('common.yes')} />
                <ToggleBtn active={v === false} color="negative" icon={X} onClick={() => setAnswer(item.id, false)} label={t('common.no')} />
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex gap-2">
        {step > 0 && (
          <button onClick={() => setStep(s => s - 1)} className="btn btn-secondary">
            <ArrowLeft size={15} /> <span className="hidden sm:inline">{t('common.back')}</span>
          </button>
        )}
        <button
          disabled={!answeredInSection}
          onClick={() => (isLast ? runAnalysis() : setStep(s => s + 1))}
          className="btn btn-primary flex-1 sm:flex-none"
        >
          {isLast ? <><Sparkles size={15} /> {t('questionnaire.seeDiagnosis')}</> : <>{t('questionnaire.next')} <ArrowRight size={15} /></>}
        </button>
      </div>
      {!answeredInSection && (
        <p className="text-xs mt-2" style={{ color: 'var(--text-muted)' }}>{t('questionnaire.answerAll')}</p>
      )}
    </div>
  );
}

function ToggleBtn({ active, color, icon: Icon, onClick, label }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={active}
      className="flex-1 flex items-center justify-center gap-1.5 rounded-lg h-10 sm:h-9 text-sm sm:text-xs font-medium active:scale-[0.97]"
      style={{
        ...(active
          ? { background: `var(--${color})`, color: 'var(--on-accent)', border: `1px solid var(--${color})` }
          : { background: 'var(--surface-2)', color: 'var(--text-secondary)', border: '1px solid var(--border-strong)' }),
        transition: 'background-color var(--dur-fast) var(--ease-std), color var(--dur-fast) var(--ease-std), transform var(--dur-fast) var(--ease-std)'
      }}>
      <Icon size={14} /> {label}
    </button>
  );
}
