import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarDays, CheckCircle2, XCircle, ShieldCheck } from 'lucide-react';
import { IvaCalc, IrpfCalc, AutonomoCalc, EmpleadoCalc, HoraCalc } from '../../components/calculators';
import { Segmented, Badge } from '../../components/ui';
import { useSeo, ldGraph, faqLd, breadcrumbLd } from '../../seo/useSeo';
import { SITE, pageById, CALENDAR_YEARS } from '../../seo/routes';
import { deadlinesFor } from '../../utils/fiscalCalendar';
import { validSpanishTaxId } from '../../utils/invoiceDoubts';
import { isoDate } from '../../utils/money';
import { track } from '../../utils/track';
import {
  SeoShell, Breadcrumbs, PageIntro, ContentSections, Faq, TrialCta, RelatedGuides, RelatedTools,
  useSeoContent, useUpdatedLabel, toolKey, CONTENT_UPDATED
} from './SeoLayout';

/**
 * Páginas públicas de herramientas (sesión 12, SEO): calculadoras, calendario
 * fiscal y validador de NIF, sin login. Reutilizan las calculadoras de la app
 * (components/calculators.jsx) sin prellenar con el libro.
 * `id` = id de seo/routes.js (autonomo, iva, …, calendario-2026, nif).
 */
const CALCS = { autonomo: AutonomoCalc, iva: IvaCalc, irpf: IrpfCalc, empleado: EmpleadoCalc, hora: HoraCalc };

export default function ToolPage({ id }) {
  const { c, ui, l, fill, path } = useSeoContent();
  const page = pageById(id);
  const key = toolKey(id);
  const tool = c.tools[key];
  const vars = { y: page.year || CALENDAR_YEARS[0] };
  const title = fill(tool.title, vars);
  const h1 = fill(tool.h1, vars);
  const url = SITE + page.paths[l];
  const faq = tool.faq.map(({ q, a }) => ({ q: fill(q, vars), a: fill(a, vars) }));

  useSeo({
    title: `${title} | Nokfi`,
    description: fill(tool.description, vars),
    jsonLd: ldGraph(
      {
        '@type': 'WebApplication', name: h1, url, inLanguage: l, applicationCategory: 'FinanceApplication',
        operatingSystem: 'Any', isAccessibleForFree: true, dateModified: CONTENT_UPDATED,
        offers: { '@type': 'Offer', price: '0', priceCurrency: 'EUR' }, publisher: { '@id': `${SITE}/#organization` }
      },
      faqLd(faq),
      breadcrumbLd([[ui.home, path('home')], [h1, page.paths[l]]])
    )
  });

  const Calc = CALCS[key];
  // Primer uso de la herramienta en esta visita (escribir, elegir una opción…).
  const used = useRef(false);
  const onUse = () => { if (!used.current) { used.current = true; track('tool_use'); } };
  return (
    <SeoShell>
      <Breadcrumbs trail={[[ui.home, path('home')], [h1, page.paths[l]]]} />
      <PageIntro h1={h1} intro={fill(tool.intro, vars)} updated={useUpdatedLabel()} />
      <div onInput={onUse} onClick={(e) => { if (e.target.closest('button, select, input')) onUse(); }}>
        {Calc && <Calc ledger={null} />}
        {key === 'calendario' && <CalendarTool year={page.year} />}
        {key === 'nif' && <NifTool />}
      </div>
      <p className="mt-3 text-xs flex items-start gap-1.5" style={{ color: 'var(--text-muted)' }}>
        <ShieldCheck size={13} className="shrink-0 mt-0.5" /> {ui.privacyNote} {ui.disclaimer}
      </p>
      <ContentSections sections={tool.sections} vars={vars} />
      <Faq items={faq} />
      <TrialCta />
      <RelatedGuides ids={tool.guides} />
      <RelatedTools current={id} />
    </SeoShell>
  );
}

/* ── Calendario fiscal ── */
function CalendarTool({ year }) {
  const { ui, l, fill, path } = useSeoContent();
  const C = ui.calendar;
  const [form, setForm] = useState('');
  // "Hoy" solo en el navegador: el HTML prerenderizado no depende del día del build.
  const [today, setToday] = useState(null);
  useEffect(() => { setToday(new Date().toISOString().slice(0, 10)); }, []);

  const list = deadlinesFor(year, form || undefined);
  const next = today ? list.find(d => d.date >= today) : null;
  const byMonth = list.reduce((acc, d) => { (acc[d.date.slice(0, 7)] ||= []).push(d); return acc; }, {});
  const days = next ? Math.round((Date.parse(next.date) - Date.parse(today)) / 86400000) : 0;
  const other = CALENDAR_YEARS.find(y => y !== year);

  return (
    <div className="card p-4 sm:p-6 flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented value={form} onChange={setForm} size="sm" label={C.form} options={[
          { value: '', label: C.all }, { value: 'autonomo', label: C.autonomo }, { value: 'sociedad', label: C.sociedad }
        ]} />
        {other && <Link to={path(`calendario-${other}`)} className="text-sm hover:underline" style={{ color: 'var(--accent-text)' }}>{fill(C.otherYear, { y: other })} →</Link>}
      </div>
      {/* Hueco reservado: el próximo plazo se calcula en el navegador (sin salto al aparecer). */}
      <div className="min-h-[52px]">
      {next && (
        <div className="rounded-xl p-4 flex items-center gap-3" style={{ background: 'var(--accent-soft)' }} aria-live="polite">
          <CalendarDays size={18} style={{ color: 'var(--accent-text)' }} />
          <p className="text-sm" style={{ color: 'var(--text-primary)' }}>
            <span className="font-semibold">{C.next}:</span> {fill(C.models, { m: next.models.join(', ') })} · {isoDate(next.date, l, { day: 'numeric', month: 'long' })}{' '}
            <span style={{ color: 'var(--text-secondary)' }}>({days === 0 ? C.today : days === 1 ? C.inDays_one : fill(C.inDays, { n: days })})</span>
          </p>
        </div>
      )}
      </div>
      <div className="flex flex-col gap-5">
        {Object.entries(byMonth).map(([m, items]) => (
          <section key={m}>
            <h2 className="section-title mb-2 first-letter:uppercase">{isoDate(`${m}-01`, l, { month: 'long', year: 'numeric' })}</h2>
            <ul className="flex flex-col gap-1.5">
              {items.map(d => (
                <li key={d.key} className="flex items-center gap-3 rounded-xl px-3 py-2.5"
                  style={{ background: 'var(--surface-2)', opacity: today && d.date < today ? 0.8 : 1 }}>
                  <time dateTime={d.date} className="text-sm tabular w-16 shrink-0 font-medium" style={{ color: 'var(--text-primary)' }}>{isoDate(d.date, l, { day: 'numeric', month: 'short' })}</time>
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{fill(C.models, { m: d.models.join(', ') })} · {d.period}</span>
                    <span className="block text-xs" style={{ color: 'var(--text-secondary)' }}>{C.kinds[d.kind]}</span>
                  </span>
                  {d.conditional && <Badge tone="muted">{C.ifApplies}</Badge>}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}

/* ── Validador de NIF / NIE / CIF ── */
function classify(raw) {
  const s = String(raw || '').toUpperCase().replace(/[\s.-]/g, '').replace(/^ES/, '');
  const type = /^\d{8}[A-Z]$/.test(s) ? 'nif' : /^[XYZ]\d{7}[A-Z]$/.test(s) ? 'nie' : /^[ABCDEFGHJNPQRSUVW]\d{7}[0-9A-J]$/.test(s) ? 'cif' : null;
  return { normalized: s, type, valid: validSpanishTaxId(s) };
}

function NifTool() {
  const { ui } = useSeoContent();
  const N = ui.nif;
  const [value, setValue] = useState('');
  const [result, setResult] = useState(null);
  const check = (e) => { e.preventDefault(); if (value.trim()) setResult(classify(value)); };

  return (
    <form onSubmit={check} className="card p-4 sm:p-6 flex flex-col gap-4" noValidate>
      <div>
        <label htmlFor="nif-value" className="field-label">{N.label}</label>
        <div className="flex gap-2">
          <input id="nif-value" type="text" autoComplete="off" autoCapitalize="characters" spellCheck="false" maxLength={20}
            value={value} placeholder={N.placeholder} onChange={(e) => { setValue(e.target.value); setResult(null); }}
            className="input flex-1 min-w-0 uppercase tabular" />
          <button type="submit" className="btn btn-primary shrink-0" disabled={!value.trim()}>{N.check}</button>
        </div>
      </div>
      <div aria-live="polite">
        {result && (
          <div className="rounded-xl p-4" style={{ background: result.valid ? 'var(--positive-soft)' : 'var(--negative-soft)' }}>
            <p className="flex items-center gap-2 text-base font-semibold" style={{ color: result.valid ? 'var(--positive)' : 'var(--negative)' }}>
              {result.valid ? <CheckCircle2 size={18} /> : <XCircle size={18} />} {result.valid ? N.valid : N.invalid}
              <code className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{result.normalized}</code>
            </p>
            {!result.valid && <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>{result.type ? N.reasonDigit : N.reasonFormat}</p>}
            {result.type && (
              <dl className="mt-3 pt-3 flex flex-col gap-1.5 text-sm" style={{ borderTop: '1px solid var(--border)' }}>
                <div className="flex justify-between gap-3"><dt style={{ color: 'var(--text-secondary)' }}>{N.type}</dt><dd style={{ color: 'var(--text-primary)' }}>{N.types[result.type]}</dd></div>
                <div className="flex justify-between gap-3"><dt style={{ color: 'var(--text-secondary)' }}>{N.entity}</dt><dd className="text-right" style={{ color: 'var(--text-primary)' }}>{result.type === 'cif' ? N.entities[result.normalized[0]] : N.person}</dd></div>
                {result.valid && <div className="flex justify-between gap-3"><dt style={{ color: 'var(--text-secondary)' }}>{N.vat}</dt><dd className="tabular" style={{ color: 'var(--text-primary)' }}>ES{result.normalized}</dd></div>}
              </dl>
            )}
          </div>
        )}
      </div>
      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{N.note}</p>
    </form>
  );
}
