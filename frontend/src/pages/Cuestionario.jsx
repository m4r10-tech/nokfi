import { useState } from 'react';
import { useOutletContext, Link } from 'react-router-dom';
import { RefreshCw, RotateCw, ArrowLeft, ArrowRight, Loader2, AlertCircle, History, Info } from 'lucide-react';
import { aiApi } from '../middleware/api';
import { apiErrorMessage } from '../middleware/errors';
import { useToast } from '../context/ToastContext';
import { useLang } from '../context/LangContext';
import PageHeader from '../components/PageHeader';
import ReportView from '../components/ReportView';
import ExportMenu from '../components/ExportMenu';
import AskAssistant from '../components/AskAssistant';
import Skeleton, { SkeletonText } from '../components/Skeleton';

// Textos en i18n (questionnaire.sections.<key> / questionnaire.items.<id>);
// aquí solo la estructura. Los ids no cambian: identifican cada respuesta.
const SECTIONS = [
  { key: 'ingresos', items: ['facturacion', 'control_cobros', 'previsiones_ventas', 'descuentos', 'clientes_recurrentes', 'margen_producto'] },
  { key: 'gastos', items: ['gastos_fijos', 'gastos_variables', 'presupuesto_mensual', 'tickets_digitales', 'gastos_personal', 'revision_proveedores'] },
  { key: 'pedidos', items: ['gestion_pedidos', 'control_stock', 'productos_top', 'productos_bajos', 'punto_pedido', 'devoluciones'] },
  { key: 'tesoreria', items: ['conciliacion', 'flujo_caja', 'fondo_reserva', 'financiacion', 'impuestos', 'rentabilidad'] },
  { key: 'reporting', items: ['dashboard', 'informe_mensual', 'comparativa_periodos', 'alertas_automaticas', 'kpi_ventas', 'gestor_externo'] }
];

// Sesión 10: Sí / A medias / No / No aplica. "No aplica" no resta en la nota
// (backend/utils/healthScore.js). Colores neutros: el juicio va en el informe.
const OPTIONS = [[true, 'yes'], ['partial', 'partial'], [false, 'no'], ['na', 'na']];

// Sectores que no suelen trabajar con stock: "Pedidos y stock" empieza en
// "No aplica" (se puede cambiar).
const NO_STOCK_SECTORS = ['Salud', 'Legal', 'Tecnología', 'Consultoría', 'Diseño', 'Educación', 'Inmobiliaria', 'Asesoría y gestoría',
  'Arquitectura e ingeniería', 'Marketing y publicidad', 'Limpieza', 'Transporte', 'Alojamiento'];
const initialAnswers = (sector) => (NO_STOCK_SECTORS.includes(sector)
  ? Object.fromEntries(SECTIONS.find(s => s.key === 'pedidos').items.map(id => [id, 'na']))
  : {});

export default function Cuestionario() {
  const { profile } = useOutletContext();
  const { t, lang } = useLang();
  const toast = useToast();
  const REPORT_TITLE = t('questionnaire.reportTitle');
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState(() => initialAnswers(profile.sector));
  const presetNoStock = NO_STOCK_SECTORS.includes(profile.sector);
  const [phase, setPhase] = useState('form'); // form | loading | result | error
  const [report, setReport] = useState(null); // respuesta de /api/ai/analyze
  const [errorMsg, setErrorMsg] = useState(null);

  const setAnswer = (id, val) => setAnswers(a => ({ ...a, [id]: val }));
  const isLast = step === SECTIONS.length - 1;

  // Sesión 4 (F2): solo se envían las respuestas; el backend arma el prompt
  // con el perfil de empresa y calcula la nota de salud (C1) con reglas fijas.
  const runAnalysis = async () => {
    setPhase('loading');
    setErrorMsg(null);
    const res = await aiApi.run('cuestionario', { answers }, { lang, title: REPORT_TITLE });

    if (res.ok && res.data.report) {
      setReport(res.data);
      setPhase('result');
      toast.success(t('questionnaire.ready'));
    } else {
      setErrorMsg(apiErrorMessage(t, res, 'excel.analyzeError'));
      setPhase('error');
    }
  };

  const restart = () => { setStep(0); setAnswers(initialAnswers(profile.sector)); setPhase('form'); setReport(null); };

  if (phase === 'loading') {
    return (
      <div className="max-w-3xl" aria-busy="true" aria-live="polite">
        <PageHeader title={t('questionnaire.resultTitle')} />
        <div className="card p-5 md:p-7">
          <p className="text-sm font-medium flex items-center gap-2 mb-1" style={{ color: 'var(--text-primary)' }}>
            <Loader2 size={15} className="animate-spin" style={{ color: 'var(--accent-text)' }} /> {t('questionnaire.analyzing')}
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
          <ExportMenu doc={{ title: REPORT_TITLE, report: report.report, health: report.health, actions: report.actions, companyName: profile.companyName }} />
          <AskAssistant analysisId={report.analysis_id} title={report.title} />
          <Link to="/app/historial" className="btn btn-ghost btn-sm"><History size={14} /> {t('questionnaire.savedInHistory')}</Link>
        </div>
        <ReportView report={report.report} actions={report.actions} health={report.health} />
        <button onClick={restart} className="btn btn-secondary mt-4 w-full sm:w-auto">
          <RefreshCw size={14} /> {t('questionnaire.newAnalysis')}
        </button>
      </div>
    );
  }

  const section = SECTIONS[step];
  const answeredInSection = section.items.every(id => answers[id] !== undefined);
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
            {t('questionnaire.sectionOf').replace('{n}', step + 1).replace('{total}', SECTIONS.length)} · {t(`questionnaire.sections.${section.key}`)}
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

      {section.key === 'pedidos' && presetNoStock && (
        <p className="text-xs mb-4 flex items-start gap-2 rounded-lg px-3 py-2" style={{ background: 'var(--surface-2)', color: 'var(--text-secondary)' }}>
          <Info size={14} className="mt-0.5 shrink-0" style={{ color: 'var(--accent-text)' }} /> {t('questionnaire.noStock')}
        </p>
      )}

      <ol key={step} className="card mb-6">
        {section.items.map((id, i) => (
          <li key={id} className="anim-enter p-4 sm:p-5 flex flex-col md:flex-row md:items-center gap-3 md:gap-6"
            style={{ '--i': i, borderTop: i ? '1px solid var(--border)' : undefined }}>
            <div className="flex-1 min-w-0">
              <p id={`q-${id}`} className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{t(`questionnaire.ask.${id}`)}</p>
              <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>{t(`questionnaire.help.${id}`)}</p>
            </div>
            <div role="radiogroup" aria-labelledby={`q-${id}`} className="grid grid-cols-4 gap-1 p-1 rounded-lg shrink-0 md:w-[340px]" style={{ background: 'var(--surface-2)' }}>
              {OPTIONS.map(([value, key]) => (
                <Choice key={key} active={answers[id] === value} onClick={() => setAnswer(id, value)} label={t(`questionnaire.opts.${key}`)} />
              ))}
            </div>
          </li>
        ))}
      </ol>

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
          {isLast ? <>{t('questionnaire.seeDiagnosis')} <ArrowRight size={15} /></> : <>{t('questionnaire.next')} <ArrowRight size={15} /></>}
        </button>
      </div>
      {!answeredInSection && (
        <p className="text-xs mt-2" style={{ color: 'var(--text-muted)' }}>{t('questionnaire.answerAll')}</p>
      )}
    </div>
  );
}

function Choice({ active, onClick, label }) {
  return (
    <button type="button" role="radio" aria-checked={active} onClick={onClick}
      className="rounded-md min-h-9 py-1 px-1 text-xs font-medium leading-tight active:scale-[0.97]"
      style={{
        ...(active
          ? { background: 'var(--surface-1)', color: 'var(--accent-text)', boxShadow: '0 0 0 1.5px var(--accent)' }
          : { background: 'transparent', color: 'var(--text-secondary)' }),
        transition: 'background-color var(--dur-fast) var(--ease-std), color var(--dur-fast) var(--ease-std), transform var(--dur-fast) var(--ease-std)'
      }}>
      {label}
    </button>
  );
}
