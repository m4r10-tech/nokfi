import { Link } from 'react-router-dom';
import { useLang } from '../context/LangContext';
import { usePageMeta } from '../hooks/usePageMeta';
import Logo from '../components/Logo';

/**
 * /privacidad — Política de privacidad (página pública, indexable).
 *
 * El contenido (i18n: privacy.*) describe SOLO lo que la aplicación hace de
 * verdad: qué tablas guarda la BD, que los Excel/PDF se parsean en el navegador
 * (nunca se suben), qué terceros intervienen (Stripe, Gemini, Resend,
 * Cloudflare) y que no hay cookies de tracking ni analítica. No afirmar nada
 * aquí que el código no haga — si la app cambia, actualizar las claves.
 */
export default function Privacidad() {
  const { t } = useLang();
  usePageMeta(t('meta.privacyTitle'), t('meta.privacyDesc'));
  const sections = t('privacy.sections');

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--bg-base)' }}>
      <header className="border-b" style={{ borderColor: 'var(--border)' }}>
        <div className="max-w-3xl mx-auto px-4 h-14 flex items-center justify-between">
          <Logo size="md" />
          <Link to="/home" className="text-sm hover:underline" style={{ color: 'var(--text-secondary)' }}>
            ← nokfi.app
          </Link>
        </div>
      </header>

      <main className="flex-1 w-full max-w-3xl mx-auto px-4 py-12">
        <h1 className="text-2xl font-semibold" style={{ color: 'var(--text-primary)' }}>{t('privacy.title')}</h1>
        <p className="mt-1 text-xs" style={{ color: 'var(--text-muted)' }}>{t('privacy.updated')}</p>
        <p className="mt-5 text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{t('privacy.intro')}</p>

        {Array.isArray(sections) && sections.map((s, i) => (
          <section key={i} className="mt-8">
            <h2 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>{s.h}</h2>
            {Array.isArray(s.ps) && s.ps.map((p, j) => (
              <p key={j} className="mt-2 text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{p}</p>
            ))}
            {Array.isArray(s.list) && (
              <ul className="mt-2 space-y-1.5 list-disc pl-5">
                {s.list.map((item, j) => (
                  <li key={j} className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{item}</li>
                ))}
              </ul>
            )}
          </section>
        ))}
      </main>

      <footer className="border-t" style={{ borderColor: 'var(--border)' }}>
        <div className="max-w-3xl mx-auto px-4 h-16 flex items-center justify-between">
          <Logo variant="icon" />
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>© Nokfi · {t('footer.rights')}</p>
        </div>
      </footer>
    </div>
  );
}
