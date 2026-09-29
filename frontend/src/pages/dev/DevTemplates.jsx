import { useState, useEffect } from 'react';
import { Download, ArrowRight, KeyRound } from 'lucide-react';
import { useLang } from '../../context/LangContext';
import PageHeader from '../../components/PageHeader';
import { Section, Badge } from '../../components/ui';
import { N8N_TEMPLATES } from './templates';

/**
 * Sesión 7 — Desarrolladores › Plantillas: flujos de n8n para importar. Cada
 * ficha dice qué hace, qué credenciales pide y dibuja los pasos a partir del
 * propio JSON (el diagrama no se desactualiza si cambia la plantilla).
 */
export default function DevTemplates() {
  const { t } = useLang();
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={t('dev.templatesTitle')} description={t('dev.templatesDesc')} />
      {N8N_TEMPLATES.map(tpl => <TemplateCard key={tpl.id} tpl={tpl} />)}
      <Section title={t('dev.importTitle')}>
        <ol className="list-decimal pl-5 flex flex-col gap-1.5 text-sm" style={{ color: 'var(--text-secondary)' }}>
          {(Array.isArray(t('dev.importSteps')) ? t('dev.importSteps') : []).map((s, i) => <li key={i}>{s}</li>)}
        </ol>
      </Section>
    </div>
  );
}

function TemplateCard({ tpl }) {
  const { t } = useLang();
  const [steps, setSteps] = useState(null);

  // Pasos en el orden de las conexiones, empezando por el nodo que nadie alimenta.
  useEffect(() => {
    let alive = true;
    fetch(tpl.file).then(r => r.json()).then(wf => {
      const targets = new Set(Object.values(wf.connections).flatMap(c => c.main.flat().map(x => x.node)));
      let name = wf.nodes.find(n => !targets.has(n.name))?.name;
      const order = [];
      while (name && !order.includes(name)) { order.push(name); name = wf.connections[name]?.main?.[0]?.[0]?.node; }
      if (alive) setSteps(order);
    }).catch(() => alive && setSteps([]));
    return () => { alive = false; };
  }, [tpl.file]);

  return (
    <section className="card p-4 sm:p-5 flex flex-col gap-3">
      <div className="flex flex-col sm:flex-row sm:items-start gap-3 sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>{t(`dev.tpl_${tpl.id}_title`)}</h2>
          <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>{t(`dev.tpl_${tpl.id}_desc`)}</p>
        </div>
        <a href={tpl.file} download className="btn btn-primary btn-sm shrink-0 self-start"><Download size={14} /> {t('dev.downloadJson')}</a>
      </div>
      {steps?.length > 0 && (
        <ol className="flex flex-wrap items-center gap-1.5" aria-label={t('dev.flow')}>
          {steps.map((s, i) => (
            <li key={s} className="flex items-center gap-1.5">
              <span className="text-xs rounded-md px-2 py-1" style={{ background: s.startsWith('Nokfi') ? 'var(--accent-soft)' : 'var(--surface-2)', color: s.startsWith('Nokfi') ? 'var(--accent-text)' : 'var(--text-secondary)' }}>{s}</span>
              {i < steps.length - 1 && <ArrowRight size={12} style={{ color: 'var(--text-muted)' }} aria-hidden="true" />}
            </li>
          ))}
        </ol>
      )}
      <div className="flex flex-wrap items-center gap-1.5 text-xs" style={{ color: 'var(--text-muted)' }}>
        <KeyRound size={12} /> {t('dev.credentials')}:
        {tpl.credentials.map(c => <Badge key={c}>{c}</Badge>)}
      </div>
    </section>
  );
}
