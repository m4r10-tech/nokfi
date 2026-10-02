import { Link } from 'react-router-dom';
import { useLang } from '../context/LangContext';
import { useSeo } from '../seo/useSeo';
import { PublicHeader, PublicFooter } from './PublicChrome';
import { OWNER, HOSTING, ownerLine } from '../legal/owner';

/**
 * Página legal común (privacidad, términos, encargo de tratamiento).
 * `doc` = { title, updated, intro, sections: [{ h, ps?, list?, after? }] }.
 * Sustituye {OWNER} (titular, LSSI art. 10) y {HOSTING} (proveedor del servidor).
 * `fallbackNote`: aviso cuando se muestra la traducción inglesa en otro idioma.
 */
export default function LegalDoc({ doc, metaDesc, fallbackNote }) {
  const { t, lang } = useLang();
  useSeo({ title: `${doc.title} — Nokfi`, description: metaDesc });
  const hl = lang === 'es' ? 'es' : 'en';
  const hosting = HOSTING.name?.[hl] ? `${HOSTING.name[hl]} (${HOSTING.location[hl]}): ${hl === 'es' ? 'aloja la aplicación y la base de datos' : 'hosts the application and the database'}.` : null;
  const fill = (s) => String(s).replace('{OWNER}', ownerLine(lang)).replace('{HOSTING}', hosting || '');
  const items = (arr) => (Array.isArray(arr) ? arr.map(fill).filter(Boolean) : []);

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--bg-base)' }}>
      <PublicHeader />
      <main className="flex-1 w-full max-w-3xl mx-auto px-4 py-10 md:py-12">
        <h1 className="text-2xl font-semibold" style={{ color: 'var(--text-primary)' }}>{doc.title}</h1>
        <p className="mt-1 text-xs" style={{ color: 'var(--text-muted)' }}>{doc.updated}</p>
        {fallbackNote && <p className="mt-3 text-xs rounded-lg px-3 py-2" style={{ background: 'var(--surface-1)', color: 'var(--text-secondary)' }}>{fallbackNote}</p>}
        <p className="mt-5 text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{fill(doc.intro)}</p>
        {doc.sections.map((s, i) => (
          <section key={i} className="mt-8">
            <h2 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>{s.h}</h2>
            {items(s.ps).map((p, j) => <p key={j} className="mt-2 text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{p}</p>)}
            {items(s.list).length > 0 && (
              <ul className="mt-2 space-y-1.5 list-disc pl-5">
                {items(s.list).map((it, j) => <li key={j} className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{it}</li>)}
              </ul>
            )}
            {items(s.after).map((p, j) => <p key={j} className="mt-2 text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{p}</p>)}
          </section>
        ))}
        <nav className="mt-12 flex flex-wrap gap-x-5 gap-y-2 text-xs" style={{ color: 'var(--text-secondary)' }}>
          <Link to="/privacidad" className="hover:underline">{t('legal.privacy')}</Link>
          <Link to="/terminos" className="hover:underline">{t('legal.terms')}</Link>
          <Link to="/encargo-tratamiento" className="hover:underline">{t('legal.dpa')}</Link>
          <a href={`mailto:${OWNER.email}`} className="hover:underline">{OWNER.email}</a>
        </nav>
      </main>
      <PublicFooter />
    </div>
  );
}
