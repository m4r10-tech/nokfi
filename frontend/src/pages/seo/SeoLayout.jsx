import { Link } from 'react-router-dom';
import { ChevronRight, ChevronDown, ArrowRight, BookOpen, Calculator } from 'lucide-react';
import { useLang } from '../../context/LangContext';
import { PublicHeader, PublicFooter } from '../../components/PublicChrome';
import { pathFor, seoLang, pageById, TOOL_IDS, CALENDAR_YEARS } from '../../seo/routes';
import { AUTONOMO_TABLE, EMPLOYER_RATES } from '../../utils/spainRates';
import { formatNumber } from '../../utils/money';
import es from '../../seo/content/es';
import en from '../../seo/content/en';

/**
 * Piezas comunes de las páginas públicas de la sesión 12 (herramientas,
 * guías e índice de guías): cabecera, migas, secciones de texto, preguntas
 * frecuentes, llamada a la prueba gratis y enlaces internos.
 */
export const CONTENT_UPDATED = '2026-10-02';
const CONTENT = { es, en };

/** Contenido y rutas en el idioma de la URL (es/en). */
export function useSeoContent() {
  const { lang } = useLang();
  const l = seoLang(lang);
  const c = CONTENT[l];
  const fill = (s, vars = {}) => String(s ?? '').replace(/\{(\w+)\}/g, (m, k) => (vars[k] !== undefined ? String(vars[k]) : m));
  return { l, c, ui: c.ui, fill, path: (id) => pathFor(id, l) };
}

/** id de la herramienta → clave de su contenido (calendario-2026 → calendario). */
export const toolKey = (id) => (id.startsWith('calendario') ? 'calendario' : id);

export function SeoShell({ children }) {
  return (
    <div className="min-h-screen flex flex-col overflow-x-clip" style={{ background: 'var(--bg-base)' }}>
      <PublicHeader />
      <main className="flex-1 w-full max-w-3xl mx-auto px-4 pt-6 md:pt-10 pb-16">{children}</main>
      <PublicFooter />
    </div>
  );
}

export function Breadcrumbs({ trail }) {
  return (
    <nav aria-label="Breadcrumb" className="mb-4">
      <ol className="flex flex-wrap items-center gap-1 text-xs" style={{ color: 'var(--text-muted)' }}>
        {trail.map(([name, path], i) => (
          <li key={path} className="flex items-center gap-1">
            {i > 0 && <ChevronRight size={12} aria-hidden="true" />}
            {i < trail.length - 1
              ? <Link to={path} className="hover:underline" style={{ color: 'var(--text-secondary)' }}>{name}</Link>
              : <span aria-current="page">{name}</span>}
          </li>
        ))}
      </ol>
    </nav>
  );
}

export function PageIntro({ h1, intro, updated }) {
  return (
    <header className="mb-6">
      <h1 className="text-2xl md:text-3xl font-semibold tracking-tight text-balance" style={{ color: 'var(--text-primary)' }}>{h1}</h1>
      <p className="mt-3 text-base leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{intro}</p>
      {updated && <p className="mt-2 text-xs" style={{ color: 'var(--text-muted)' }}>{updated}</p>}
    </header>
  );
}

export function useUpdatedLabel() {
  const { ui, l, fill } = useSeoContent();
  const m = new Date(`${CONTENT_UPDATED}T12:00:00Z`).toLocaleDateString(l === 'en' ? 'en-GB' : 'es-ES', { month: 'long', year: 'numeric' });
  return fill(ui.updated, { m });
}

function AutonomoTable() {
  const { ui, l, fill } = useSeoContent();
  const eur = (n) => formatNumber(n, l, { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return (
    <div className="mt-3 overflow-x-auto rounded-xl" style={{ border: '1px solid var(--border)' }}>
      <table className="w-full text-sm tabular">
        <thead style={{ background: 'var(--surface-2)' }}>
          <tr className="text-left text-xs" style={{ color: 'var(--text-secondary)' }}>
            <th scope="col" className="px-3 py-2 font-medium">{ui.tableBracket}</th>
            <th scope="col" className="px-3 py-2 font-medium">{ui.tableNet}</th>
            <th scope="col" className="px-3 py-2 font-medium text-right">{ui.tableBase}</th>
            <th scope="col" className="px-3 py-2 font-medium text-right">{ui.tableQuota}</th>
          </tr>
        </thead>
        <tbody>
          {AUTONOMO_TABLE.map(([upTo, base, quota], i) => (
            <tr key={i} style={{ borderTop: '1px solid var(--border)', color: 'var(--text-primary)' }}>
              <td className="px-3 py-2">{i + 1}</td>
              <td className="px-3 py-2 whitespace-nowrap">{upTo === Infinity ? fill(ui.tableFrom, { v: eur(AUTONOMO_TABLE[i - 1][0]) }) : fill(ui.tableUpTo, { v: eur(upTo) })}</td>
              <td className="px-3 py-2 text-right whitespace-nowrap">{eur(base)}</td>
              <td className="px-3 py-2 text-right whitespace-nowrap font-medium">{eur(quota)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const EMPLOYER_ROWS = {
  es: [['cc', 'Contingencias comunes'], ['unemployment_indef', 'Desempleo (indefinido)'], ['unemployment_temp', 'Desempleo (temporal)'], ['fogasa', 'FOGASA'], ['fp', 'Formación profesional'], ['mei', 'MEI']],
  en: [['cc', 'Common contingencies'], ['unemployment_indef', 'Unemployment (permanent)'], ['unemployment_temp', 'Unemployment (temporary)'], ['fogasa', 'Wage guarantee fund (FOGASA)'], ['fp', 'Vocational training'], ['mei', 'Intergenerational equity (MEI)']]
};

function EmployerTable() {
  const { ui, l } = useSeoContent();
  return (
    <div className="mt-3 overflow-x-auto rounded-xl" style={{ border: '1px solid var(--border)' }}>
      <table className="w-full text-sm tabular">
        <thead style={{ background: 'var(--surface-2)' }}>
          <tr className="text-left text-xs" style={{ color: 'var(--text-secondary)' }}>
            <th scope="col" className="px-3 py-2 font-medium">{ui.tableConcept}</th>
            <th scope="col" className="px-3 py-2 font-medium text-right">{ui.tableRate}</th>
          </tr>
        </thead>
        <tbody>
          {EMPLOYER_ROWS[l].map(([k, label]) => (
            <tr key={k} style={{ borderTop: '1px solid var(--border)', color: 'var(--text-primary)' }}>
              <td className="px-3 py-2">{label}</td>
              <td className="px-3 py-2 text-right">{formatNumber(EMPLOYER_RATES[k], l, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} %</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const TABLES = { autonomo: AutonomoTable, empleado: EmployerTable };

export function ContentSections({ sections, vars }) {
  const { fill } = useSeoContent();
  return (
    <div className="flex flex-col gap-8 mt-10">
      {sections.map((s) => {
        const Table = s.table && TABLES[s.table];
        return (
          <section key={s.h}>
            <h2 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>{fill(s.h, vars)}</h2>
            {s.list && (
              <ul className="mt-3 flex flex-col gap-1.5 list-disc pl-5">
                {s.list.map((it) => <li key={it} className="text-[15px] leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{fill(it, vars)}</li>)}
              </ul>
            )}
            {Table && <Table />}
            {(s.ps || []).map((p) => <p key={p} className="mt-3 text-[15px] leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{fill(p, vars)}</p>)}
          </section>
        );
      })}
    </div>
  );
}

/** Preguntas frecuentes con <details> (se leen sin JS y Google las ve). */
export function Faq({ items, vars }) {
  const { ui, fill } = useSeoContent();
  return (
    <section className="mt-12" aria-labelledby="faq-title">
      <h2 id="faq-title" className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>{ui.faqTitle}</h2>
      <div className="mt-3 flex flex-col gap-2">
        {items.map(({ q, a }) => (
          <details key={q} className="group card px-4 py-3">
            <summary className="flex items-center justify-between gap-3 cursor-pointer list-none text-[15px] font-medium" style={{ color: 'var(--text-primary)' }}>
              {fill(q, vars)}
              <ChevronDown size={16} className="shrink-0 transition-transform group-open:rotate-180" style={{ color: 'var(--text-muted)' }} aria-hidden="true" />
            </summary>
            <p className="mt-2 text-[15px] leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{fill(a, vars)}</p>
          </details>
        ))}
      </div>
    </section>
  );
}

export function TrialCta() {
  const { ui, path } = useSeoContent();
  return (
    <aside className="mt-12 rounded-2xl p-6 md:p-8" style={{ background: 'var(--accent-soft)', border: '1px solid var(--border)' }}>
      <h2 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>{ui.ctaTitle}</h2>
      <p className="mt-2 text-[15px] leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{ui.ctaText}</p>
      <div className="mt-5 flex flex-wrap gap-3">
        <Link to={path('pricing')} className="btn btn-primary">{ui.ctaButton} <ArrowRight size={16} /></Link>
        <Link to={path('home')} className="btn btn-secondary">{ui.ctaSecondary}</Link>
      </div>
    </aside>
  );
}

export function RelatedGuides({ ids }) {
  const { c, ui, path } = useSeoContent();
  if (!ids?.length) return null;
  return (
    <section className="mt-12">
      <h2 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>{ui.relatedGuides}</h2>
      <ul className="mt-3 grid sm:grid-cols-2 gap-2">
        {ids.map(id => (
          <li key={id}>
            <Link to={path(`guide-${id}`)} className="card card-interactive h-full p-4 flex items-start gap-3">
              <BookOpen size={17} className="shrink-0 mt-0.5" style={{ color: 'var(--accent-text)' }} />
              <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{c.guides[id].h1}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Otras herramientas (todas menos `current`). */
export function RelatedTools({ current }) {
  const { c, ui, path, fill } = useSeoContent();
  const ids = TOOL_IDS.filter(id => toolKey(id) !== toolKey(current || ''));
  return (
    <section className="mt-12">
      <h2 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>{ui.relatedTools}</h2>
      <ul className="mt-3 flex flex-wrap gap-2">
        {ids.map(id => (
          <li key={id}>
            <Link to={path(id)} className="inline-flex items-center gap-1.5 rounded-full px-3 h-9 text-sm font-medium"
              style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}>
              <Calculator size={14} style={{ color: 'var(--accent-text)' }} /> {fill(c.tools[toolKey(id)].h1, { y: pageById(id)?.year || CALENDAR_YEARS[0] })}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
