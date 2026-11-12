import { Link } from 'react-router-dom';
import { Calculator, ArrowRight } from 'lucide-react';
import { useSeo, ldGraph, faqLd, breadcrumbLd } from '../../seo/useSeo';
import { SITE, pageById, CALENDAR_YEARS } from '../../seo/routes';
import { usePlans } from '../../hooks/usePlans';
import {
  SeoShell, Breadcrumbs, PageIntro, ContentSections, Faq, TrialCta, RelatedGuides, RelatedTools,
  useSeoContent, useUpdatedLabel, toolKey, CONTENT_UPDATED
} from './SeoLayout';

/**
 * Secciones de una guía que cita los precios de Nokfi ({mini}, {pro}, {max}): salen del
 * catálogo (usePlans), nunca escritos a mano. Si el catálogo no ha cargado, las frases
 * con precio no se muestran.
 */
function PricedSections({ sections }) {
  const { plans } = usePlans();
  const vars = Object.fromEntries(plans.map(p => [p.id, p.price]));
  const ready = (s) => [...s.matchAll(/\{(\w+)\}/g)].every(m => vars[m[1]] !== undefined);
  return <ContentSections vars={vars} sections={sections.map(s => ({ ...s, list: s.list?.filter(ready), ps: s.ps?.filter(ready) }))} />;
}

/**
 * Guía pública (sesión 12): /guias/<slug> y /en/guides/<slug>. Amplía las
 * guías rápidas de Ayuda y enlaza con la herramienta que resuelve el tema.
 */
export default function GuidePage({ id }) {
  const { c, ui, l, path, fill } = useSeoContent();
  const page = pageById(`guide-${id}`);
  const guide = c.guides[id];
  const url = SITE + page.paths[l];
  // La guía puede llevar su propia fecha (guide.updated) si se escribió después que el resto.
  const updated = guide.updated || CONTENT_UPDATED;
  const trail = [[ui.home, path('home')], [ui.guides, path('guides')], [guide.h1, page.paths[l]]];
  const tool = guide.tool && c.tools[toolKey(guide.tool)];

  useSeo({
    title: `${guide.title} | Nokfi`,
    description: guide.description,
    jsonLd: ldGraph(
      {
        '@type': 'Article', headline: guide.h1, description: guide.description, inLanguage: l, url,
        mainEntityOfPage: url, dateModified: updated, datePublished: updated,
        image: `${SITE}/og-image-square.png`,
        author: { '@id': `${SITE}/#organization` }, publisher: { '@id': `${SITE}/#organization` }
      },
      faqLd(guide.faq),
      breadcrumbLd(trail)
    )
  });

  return (
    <SeoShell>
      <Breadcrumbs trail={trail} />
      <PageIntro h1={guide.h1} intro={guide.intro} updated={useUpdatedLabel(updated)} />
      {tool && (
        <Link to={path(guide.tool)} className="card card-interactive p-4 flex items-center gap-3">
          <Calculator size={18} className="shrink-0" style={{ color: 'var(--accent-text)' }} />
          <span className="flex-1 text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{fill(tool.h1, { y: CALENDAR_YEARS[0] })}</span>
          <span className="text-sm inline-flex items-center gap-1" style={{ color: 'var(--accent-text)' }}>{ui.useTool} <ArrowRight size={14} /></span>
        </Link>
      )}
      {guide.priced ? <PricedSections sections={guide.sections} /> : <ContentSections sections={guide.sections} />}
      <p className="mt-6 text-xs" style={{ color: 'var(--text-muted)' }}>{guide.note || ui.disclaimer}</p>
      <Faq items={guide.faq} />
      <TrialCta />
      <RelatedGuides ids={guide.guides} />
      <RelatedTools />
    </SeoShell>
  );
}
