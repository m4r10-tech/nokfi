import { Link } from 'react-router-dom';
import { BookOpen, ArrowRight } from 'lucide-react';
import { useSeo, ldGraph, breadcrumbLd } from '../../seo/useSeo';
import { SITE } from '../../seo/routes';
import { GUIDE_SLUGS } from '../../seo/guideSlugs';
import { SeoShell, Breadcrumbs, PageIntro, TrialCta, RelatedTools, useSeoContent } from './SeoLayout';

/** Índice de guías (sesión 12): /guias y /en/guides. */
export default function GuidesIndex() {
  const { c, ui, l, path } = useSeoContent();
  const idx = c.guidesIndex;
  const trail = [[ui.home, path('home')], [ui.guides, path('guides')]];

  useSeo({
    title: `${idx.title} | Nokfi`,
    description: idx.description,
    jsonLd: ldGraph(
      {
        '@type': 'CollectionPage', name: idx.h1, description: idx.description, inLanguage: l, url: SITE + path('guides'),
        hasPart: GUIDE_SLUGS.map(g => ({ '@type': 'Article', headline: c.guides[g.id].h1, url: SITE + path(`guide-${g.id}`) }))
      },
      breadcrumbLd(trail)
    )
  });

  return (
    <SeoShell>
      <Breadcrumbs trail={trail} />
      <PageIntro h1={idx.h1} intro={idx.intro} />
      <ul className="grid sm:grid-cols-2 gap-3">
        {GUIDE_SLUGS.map(g => {
          const guide = c.guides[g.id];
          return (
            <li key={g.id}>
              <Link to={path(`guide-${g.id}`)} className="card card-interactive h-full p-5 flex flex-col gap-2">
                <BookOpen size={18} style={{ color: 'var(--accent-text)' }} />
                <h2 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>{guide.h1}</h2>
                <p className="text-sm leading-relaxed flex-1" style={{ color: 'var(--text-secondary)' }}>{guide.description}</p>
                <span className="text-sm inline-flex items-center gap-1" style={{ color: 'var(--accent-text)' }}>{ui.readGuide} <ArrowRight size={14} /></span>
              </Link>
            </li>
          );
        })}
      </ul>
      <TrialCta />
      <RelatedTools />
    </SeoShell>
  );
}
