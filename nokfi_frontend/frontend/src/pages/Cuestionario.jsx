import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { Check, X, Loader2, RefreshCw } from 'lucide-react';
import { aiApi } from '../middleware/api';
import { sanitizeAiHtml } from '../middleware/sanitize';

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

export default function Cuestionario() {
  const { profile } = useOutletContext();
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
    const { ok, data, quotaExceeded } = await aiApi.analyze(buildPrompt(), 1800);

    if (ok && data.text) {
      setReport(data.text);
      setPhase('result');
    } else if (quotaExceeded) {
      setErrorMsg('El servicio de análisis ha alcanzado su límite diario. Inténtalo de nuevo más tarde.');
      setPhase('error');
    } else {
      setErrorMsg(data.message || 'No se pudo generar el análisis.');
      setPhase('error');
    }
  };

  const restart = () => { setStep(0); setAnswers({}); setPhase('form'); setReport(''); };

  if (phase === 'loading') {
    return (
      <Centered>
        <Loader2 size={32} className="animate-spin" style={{ color: 'var(--accent)' }} />
        <p className="text-sm mt-3" style={{ color: 'var(--text-secondary)' }}>Analizando tu negocio con IA...</p>
      </Centered>
    );
  }

  if (phase === 'error') {
    return (
      <Centered>
        <p className="text-sm rounded-lg px-4 py-3 mb-3" style={{ background: 'var(--negative-soft)', color: 'var(--negative)' }}>{errorMsg}</p>
        <button onClick={restart} className="text-sm rounded-lg px-4 py-2 flex items-center gap-2" style={{ background: 'var(--surface-2)', color: 'var(--text-primary)', border: '0.5px solid var(--border-strong)' }}>
          <RefreshCw size={14} /> Reiniciar
        </button>
      </Centered>
    );
  }

  if (phase === 'result') {
    return (
      <div className="max-w-3xl">
        <h1 className="text-2xl font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>Diagnóstico de tu negocio</h1>
        <div className="rounded-xl p-6 prose-report" style={{ background: 'var(--surface-1)', border: '0.5px solid var(--border)', color: 'var(--text-primary)' }}
          dangerouslySetInnerHTML={{ __html: sanitizeAiHtml(report) }} />
        <button onClick={restart} className="mt-4 text-sm rounded-lg px-4 py-2 flex items-center gap-2" style={{ background: 'var(--surface-2)', color: 'var(--text-primary)', border: '0.5px solid var(--border-strong)' }}>
          <RefreshCw size={14} /> Nuevo análisis
        </button>
      </div>
    );
  }

  const section = SECTIONS[step];
  const answeredInSection = section.items.every(item => answers[item.id] !== undefined);

  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>Cuestionario de diagnóstico</h1>
      <p className="text-sm mb-6" style={{ color: 'var(--text-secondary)' }}>Sección {step + 1} de {SECTIONS.length} — {section.title}</p>

      <div className="w-full h-1 rounded-full mb-6" style={{ background: 'var(--surface-2)' }}>
        <div className="h-1 rounded-full transition-all" style={{ width: `${(step / SECTIONS.length) * 100}%`, background: 'var(--accent)' }} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
        {section.items.map(item => (
          <div key={item.id} className="rounded-xl p-4" style={{
            background: 'var(--surface-1)',
            border: `1px solid ${answers[item.id] === true ? 'var(--positive)' : answers[item.id] === false ? 'var(--negative)' : 'var(--border)'}`
          }}>
            <div className="text-sm font-medium mb-3" style={{ color: 'var(--text-primary)' }}>{item.name}</div>
            <div className="flex gap-2">
              <ToggleBtn active={answers[item.id] === true} color="positive" icon={Check} onClick={() => setAnswer(item.id, true)} label="Sí" />
              <ToggleBtn active={answers[item.id] === false} color="negative" icon={X} onClick={() => setAnswer(item.id, false)} label="No" />
            </div>
          </div>
        ))}
      </div>

      <div className="flex gap-2">
        {step > 0 && (
          <button onClick={() => setStep(s => s - 1)} className="rounded-lg px-4 py-2 text-sm font-medium" style={{ background: 'var(--surface-2)', color: 'var(--text-primary)', border: '0.5px solid var(--border-strong)' }}>
            Atrás
          </button>
        )}
        <button
          disabled={!answeredInSection}
          onClick={() => (isLast ? runAnalysis() : setStep(s => s + 1))}
          className="rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-40"
          style={{ background: 'var(--accent)', color: '#fff' }}
        >
          {isLast ? 'Ver diagnóstico' : 'Siguiente'}
        </button>
      </div>
    </div>
  );
}

function ToggleBtn({ active, color, icon: Icon, onClick, label }) {
  return (
    <button type="button" onClick={onClick} className="flex-1 flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-medium transition-colors"
      style={active
        ? { background: `var(--${color})`, color: '#fff' }
        : { background: 'var(--surface-2)', color: 'var(--text-secondary)', border: '0.5px solid var(--border-strong)' }}>
      <Icon size={13} /> {label}
    </button>
  );
}

function Centered({ children }) {
  return <div className="flex flex-col items-center justify-center py-24 text-center">{children}</div>;
}
