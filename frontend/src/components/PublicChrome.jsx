import { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Moon, Sun, Globe, ChevronDown } from 'lucide-react';
import { LANGUAGES } from '../i18n/languages';
import Logo from './Logo';
import { useTheme } from '../context/ThemeContext';
import { useLang } from '../context/LangContext';
import { seoMatch, pathFor, seoLang, TOOL_IDS } from '../seo/routes';

/**
 * Cabecera y pie de las páginas públicas (/home, /pricing) — sesión 3.
 * La cabecera es fija, transparente arriba del todo y con fondo + borde al
 * hacer scroll. `links` = anclas de la landing (solo en md+).
 */
export function LangSwitch({ className = '' }) {
  // Sesión 4: 6 idiomas → desplegable nativo (antes botones ES/EN).
  // Sesión 12: en las páginas con URL por idioma, es/en llevan a la otra URL;
  // en las que solo existen en es/en (strict) no se ofrecen los demás.
  const { lang, setLang, t } = useLang();
  const { pathname, search, hash } = useLocation();
  const navigate = useNavigate();
  const match = seoMatch(pathname);
  const options = match?.page.strict ? LANGUAGES.filter(l => match.page.paths[l.code]) : LANGUAGES;
  const choose = (code) => {
    setLang(code);
    const target = match?.page.paths[code];
    if (target && target !== match.page.paths[match.lang]) navigate(`${target}${search}${hash}`);
  };
  return (
    <label className={`relative inline-flex items-center ${className}`}>
      <Globe size={14} className="absolute left-2 pointer-events-none" style={{ color: 'var(--text-muted)' }} />
      <select value={lang} onChange={(e) => choose(e.target.value)} aria-label={t('config.language')}
        className="appearance-none rounded-lg h-8 pl-7 pr-6 text-xs font-semibold cursor-pointer"
        style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}>
        {options.map(l => <option key={l.code} value={l.code}>{l.name}</option>)}
      </select>
      <ChevronDown size={12} className="absolute right-2 pointer-events-none" style={{ color: 'var(--text-muted)' }} />
    </label>
  );
}

/** Rutas públicas en el idioma que se está leyendo (es para fr/it/de/pl). */
export function usePublicPath() {
  const { lang } = useLang();
  const l = seoLang(lang);
  return (id) => pathFor(id, l);
}

/** Anclas de la misma página con scroll suave (sin activar smooth global,
 *  que animaría también el scroll-to-top de cada cambio de ruta). */
function smoothTo(e, href) {
  const el = document.getElementById(href.slice(1));
  if (!el) return;
  e.preventDefault();
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
  history.replaceState(null, '', href);
}

export function PublicHeader({ links = [] }) {
  const { theme, toggleTheme } = useTheme();
  const { t } = useLang();
  const pub = usePublicPath();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <header className="sticky top-0 z-30"
      style={{
        background: scrolled ? 'var(--bg-base)' : 'transparent',
        borderBottom: `1px solid ${scrolled ? 'var(--border)' : 'transparent'}`,
        transition: 'background-color var(--dur-base) var(--ease-std), border-color var(--dur-base) var(--ease-std)'
      }}>
      <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between gap-3">
        <Link to={pub('home')} aria-label="Nokfi" className="rounded-lg"><Logo size="md" /></Link>
        {links.length > 0 && (
          <nav className="hidden lg:flex items-center gap-1">
            {links.map(l => (
              <a key={l.href} href={l.href} onClick={(e) => smoothTo(e, l.href)} className="whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium transition-colors hover:text-[var(--text-primary)]"
                style={{ color: 'var(--text-secondary)' }}>{l.label}</a>
            ))}
          </nav>
        )}
        <div className="flex items-center gap-2">
          <span className="hidden sm:inline-flex"><LangSwitch /></span>
          <button onClick={toggleTheme} aria-label={t(theme === 'dark' ? 'nav.lightMode' : 'nav.darkMode')}
            className="btn btn-ghost btn-sm !px-2">
            {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
          </button>
          <Link to="/login" className="btn btn-secondary btn-sm">{t('landing.login')}</Link>
        </div>
      </div>
    </header>
  );
}

export function PublicFooter() {
  const { t } = useLang();
  const pub = usePublicPath();
  return (
    <footer style={{ borderTop: '1px solid var(--border)' }}>
      <div className="max-w-6xl mx-auto px-4 pt-8 grid gap-6 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <nav aria-label={t('seo.toolsHeading')}>
          <p className="text-xs font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>{t('seo.toolsHeading')}</p>
          <ul className="grid grid-cols-1 min-[420px]:grid-cols-2 gap-x-5 gap-y-0.5 text-xs" style={{ color: 'var(--text-secondary)' }}>
            {TOOL_IDS.map(id => (
              <li key={id}><Link to={pub(id)} className="inline-flex items-center min-h-6 hover:underline">{t(`seo.tool_${id.startsWith('calendario') ? 'calendario' : id}`)}</Link></li>
            ))}
          </ul>
        </nav>
        <nav aria-label={t('seo.guidesHeading')}>
          <p className="text-xs font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>{t('seo.resourcesHeading')}</p>
          <ul className="flex flex-col gap-y-0.5 text-xs" style={{ color: 'var(--text-secondary)' }}>
            <li><Link to={pub('guides')} className="inline-flex items-center min-h-6 hover:underline">{t('seo.guidesHeading')}</Link></li>
            <li><Link to={pub('api-docs')} className="inline-flex items-center min-h-6 hover:underline">{t('help.apiDocs')}</Link></li>
          </ul>
        </nav>
      </div>
      <div className="max-w-6xl mx-auto px-4 py-8 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Logo variant="icon" size="sm" />
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>© {new Date().getFullYear()} Nokfi · {t('footer.rights')}</p>
        </div>
        <nav className="flex flex-wrap justify-center items-center gap-x-5 gap-y-1 text-xs" style={{ color: 'var(--text-secondary)' }}>
          <Link to={pub('pricing')} className="inline-flex items-center min-h-6 hover:underline">{t('landing.plansHeading')}</Link>
          <Link to="/privacidad" className="inline-flex items-center min-h-6 hover:underline">{t('landing.privacyLink')}</Link>
          <Link to="/terminos" className="inline-flex items-center min-h-6 hover:underline">{t('legal.terms')}</Link>
          <Link to={`${pub('home')}#contacto`} className="inline-flex items-center min-h-6 hover:underline">{t('landing.contactLink')}</Link>
          <Link to="/login" className="inline-flex items-center min-h-6 hover:underline">{t('landing.login')}</Link>
        </nav>
        <LangSwitch />
      </div>
    </footer>
  );
}
