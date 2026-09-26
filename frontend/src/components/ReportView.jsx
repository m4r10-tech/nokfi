import { useState } from 'react';
import { Check, AlertTriangle, AlertCircle, Info, BookOpen, ChevronDown, ThumbsUp, ListChecks, Loader2 } from 'lucide-react';
import { actionsApi } from '../middleware/api';
import { sanitizeAiHtml } from '../middleware/sanitize';
import { useLang } from '../context/LangContext';
import { useToast } from '../context/ToastContext';
import HealthScore from './HealthScore';

/**
 * Visor del informe ESTRUCTURADO de la IA (sesión 4, F1).
 *
 * Antes la IA devolvía HTML libre (saneado con DOMPurify). Ahora devuelve un
 * JSON validado en el backend (resumen, cifras clave, prioridades con
 * gravedad, plan de acción y glosario) y aquí se pinta con componentes
 * propios: más legible, coherente entre análisis y sin HTML de la IA.
 *
 * C2: el plan de acción es una checklist PERSISTENTE (tabla action_items).
 * Los análisis antiguos (format 'html') se siguen mostrando como antes.
 */
const SEVERITY = {
  high: { icon: AlertCircle, color: 'var(--negative)', soft: 'var(--negative-soft)' },
  medium: { icon: AlertTriangle, color: 'var(--warning)', soft: 'var(--warning-soft)' },
  low: { icon: Info, color: 'var(--accent-text)', soft: 'var(--accent-soft)' }
};

export default function ReportView({ report, html, actions = [], health, onActionsChange }) {
  if (!report) {
    return (
      <div className="card p-5 md:p-7 prose-report anim-fade" style={{ color: 'var(--text-primary)' }}
        dangerouslySetInnerHTML={{ __html: sanitizeAiHtml(html || '') }} />
    );
  }
  return <StructuredReport report={report} actions={actions} health={health} onActionsChange={onActionsChange} />;
}

function StructuredReport({ report, actions, health, onActionsChange }) {
  const { t } = useLang();
  return (
    <div className="flex flex-col gap-4 anim-fade">
      <Block>
        <p className="text-[15px] leading-relaxed" style={{ color: 'var(--text-primary)' }}>{report.summary}</p>
      </Block>

      {health && (
        <Block title={t('report.healthTitle')}><HealthScore health={health} /></Block>
      )}

      {report.key_figures?.length > 0 && (
        <Block title={t('report.keyFigures')}>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-3">
            {report.key_figures.map((k, i) => (
              <div key={i} className="rounded-xl p-3 min-w-0" style={{ background: 'var(--surface-2)' }}>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{k.label}</p>
                <p className="text-lg font-semibold tabular mt-0.5 break-words" style={{ color: 'var(--text-primary)' }}>{k.value}</p>
                {k.note && <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>{k.note}</p>}
              </div>
            ))}
          </div>
        </Block>
      )}

      {report.priorities?.length > 0 && (
        <Block title={t('report.priorities')}>
          <ul className="flex flex-col gap-2.5">
            {report.priorities.map((p, i) => {
              const s = SEVERITY[p.severity] || SEVERITY.medium;
              const Icon = s.icon;
              return (
                <li key={i} className="rounded-xl p-3.5 flex gap-3" style={{ background: 'var(--surface-2)' }}>
                  <span className="shrink-0 w-8 h-8 rounded-lg grid place-items-center" style={{ background: s.soft, color: s.color }}><Icon size={16} /></span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{p.title}</p>
                      <span className="text-[11px] font-semibold uppercase tracking-wide rounded-full px-2 py-0.5" style={{ background: s.soft, color: s.color }}>
                        {t(`report.severity_${p.severity}`)}
                      </span>
                    </div>
                    {p.detail && <p className="text-sm mt-1 leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{p.detail}</p>}
                  </div>
                </li>
              );
            })}
          </ul>
        </Block>
      )}

      {report.strengths?.length > 0 && (
        <Block title={t('report.strengths')}>
          <ul className="flex flex-col gap-2">
            {report.strengths.map((s, i) => (
              <li key={i} className="flex gap-2.5 text-sm" style={{ color: 'var(--text-secondary)' }}>
                <ThumbsUp size={15} className="mt-0.5 shrink-0" style={{ color: 'var(--positive)' }} /> {s}
              </li>
            ))}
          </ul>
        </Block>
      )}

      {report.action_plan?.length > 0 && (
        <ActionChecklist plan={report.action_plan} actions={actions} onActionsChange={onActionsChange} />
      )}

      {report.glossary?.length > 0 && (
        <Block title={t('report.glossary')} icon={BookOpen}>
          <div className="flex flex-col -my-1">
            {report.glossary.map((g, i) => (
              <details key={i} className="group py-2" style={{ borderTop: i ? '1px solid var(--border)' : 'none' }}>
                <summary className="flex items-center justify-between gap-3 cursor-pointer text-sm font-medium select-none" style={{ color: 'var(--text-primary)' }}>
                  {g.term}<ChevronDown size={16} className="details-chevron shrink-0" style={{ color: 'var(--text-muted)' }} />
                </summary>
                <p className="text-sm mt-1.5 leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{g.definition}</p>
              </details>
            ))}
          </div>
        </Block>
      )}
    </div>
  );
}

function ActionChecklist({ plan, actions, onActionsChange }) {
  const { t } = useLang();
  const toast = useToast();
  const [items, setItems] = useState(actions);
  const [busy, setBusy] = useState(null);
  // Si las tareas no se pudieron persistir (fallo best-effort del historial),
  // se muestra el plan como lista no marcable.
  const persisted = items.length > 0;
  const rows = persisted ? items : plan.map((p, i) => ({ id: `p${i}`, ...p, done: false }));
  const done = rows.filter(r => r.done).length;

  const toggle = async (item) => {
    if (!persisted || busy) return;
    const next = !item.done;
    setBusy(item.id);
    setItems(list => list.map(x => (x.id === item.id ? { ...x, done: next } : x)));
    const res = await actionsApi.setDone(item.id, next);
    setBusy(null);
    if (!res.ok) {
      setItems(list => list.map(x => (x.id === item.id ? { ...x, done: !next } : x)));
      toast.error(t('common.error'));
    } else {
      onActionsChange?.(res.data.stats);
    }
  };

  return (
    <Block title={t('report.actionPlan')} icon={ListChecks}
      aside={persisted && <span className="text-xs tabular normal-case tracking-normal" style={{ color: 'var(--text-muted)' }}>{t('report.progress').replace('{n}', done).replace('{total}', rows.length)}</span>}>
      {persisted && (
        <div className="h-1.5 rounded-full overflow-hidden mb-3" style={{ background: 'var(--surface-2)' }}>
          <div className="h-full rounded-full" style={{ width: `${(done / rows.length) * 100}%`, background: 'var(--positive)', transition: 'width 500ms var(--ease-out)' }} />
        </div>
      )}
      <ol className="flex flex-col gap-1 -mx-2">
        {rows.map((a) => (
          <li key={a.id}>
            <button type="button" onClick={() => toggle(a)} disabled={!persisted} aria-pressed={persisted ? a.done : undefined}
              className="nav-item w-full text-left flex items-start gap-3 rounded-lg px-2 py-2.5 disabled:cursor-default">
              <span className="shrink-0 mt-0.5 w-5 h-5 rounded-md grid place-items-center"
                style={a.done ? { background: 'var(--positive)', color: 'var(--on-accent)' } : { border: '1.5px solid var(--border-strong)' }}>
                {busy === a.id ? <Loader2 size={12} className="animate-spin" /> : a.done && <Check size={13} strokeWidth={3} />}
              </span>
              <span className="flex-1 min-w-0">
                <span className={`block text-sm font-medium ${a.done ? 'line-through' : ''}`} style={{ color: a.done ? 'var(--text-muted)' : 'var(--text-primary)' }}>{a.title}</span>
                {a.detail && !a.done && <span className="block text-sm mt-0.5" style={{ color: 'var(--text-secondary)' }}>{a.detail}</span>}
              </span>
              {a.timeframe && <span className="shrink-0 text-[11px] rounded-full px-2 py-0.5 mt-0.5" style={{ background: 'var(--surface-2)', color: 'var(--text-muted)' }}>{a.timeframe}</span>}
            </button>
          </li>
        ))}
      </ol>
    </Block>
  );
}

function Block({ title, icon: Icon, aside, children }) {
  return (
    <section className="card p-4 sm:p-5">
      {title && (
        <div className="flex items-center justify-between gap-3 mb-3">
          <h2 className="text-xs font-medium uppercase tracking-wide flex items-center gap-1.5" style={{ color: 'var(--text-muted)' }}>
            {Icon && <Icon size={13} />}{title}
          </h2>
          {aside}
        </div>
      )}
      {children}
    </section>
  );
}
