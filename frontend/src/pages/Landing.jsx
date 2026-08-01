import { useNavigate, Link } from 'react-router-dom';
import { Moon, Sun, ClipboardList, FileSpreadsheet, FileText, Calculator, ArrowRight } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import { useLang } from '../context/LangContext';
import Logo from '../components/Logo';
import PlanCards from '../components/PlanCards';
import { usePlans } from '../hooks/usePlans';

/**
 * Landing pública — la home de Nokfi en nokfi.app (sección 13 del proyecto).
 *
 * Es lo que ve CUALQUIERA antes de autenticarse (es la ruta "/"). Lo "general":
 * qué es Nokfi, info para quién es, planes y precios, y CTA hacia login/pricing.
 * Las funciones de la app (cuestionario, Excel, calculadoras…) siguen bajo
 * /app/* protegidas por ProtectedRoute — aquí no se lista nada que requiera sesión.
 *
 * Publicación de planes: se reusa <PlanCards/> con datos de usePlans() (GET
 * /api/payments/plans) → lo que muestra la landing == lo que cobra Stripe. El botón
 * "Suscribirme" lleva a /pricing, donde está el checkout real (email + Stripe).
 *
 * Estilo (sección 21): solo variables CSS de tema (var(--*)), nunca hex, para que
 * el contraste funcione automáticamente en tema oscuro y claro.
 */
const FEATURE_ICONS = [ClipboardList, FileSpreadsheet, FileText, Calculator];

function LangSwitch() {
  const { lang, setLang, t } = useLang();
  return (
    <div className="flex gap-1.5">
      {['es', 'en'].map(l => (
        <button key={l} onClick={() => setLang(l)} aria-label={l === 'es' ? 'Español' : 'English'}
          className="rounded-lg px-2.5 py-1 text-xs font-medium"
          style={lang === l
            ? { background: 'var(--accent)', color: '#fff' }
            : { background: 'var(--surface-2)', color: 'var(--text-secondary)', border: '0.5px solid var(--border-strong)' }}>
          {l.toUpperCase()}
        </button>
      ))}
    </div>
  );
}

export default function Landing() {
  const { theme, toggleTheme } = useTheme();
  const { t } = useLang();
  const navigate = useNavigate();
  const { plans, failed, notLoaded } = usePlans();
  const features = t('landing.aboutFeatures');

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--bg-base)' }}>
      {/* Top bar fijo */}
      <header className="sticky top-0 z-20 border-b" style={{ background: 'var(--bg-base)', borderColor: 'var(--border)' }}>
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
          <Logo size="md" />
          <div className="flex items-center gap-2 sm:gap-3">
            <LangSwitch />
            <button onClick={toggleTheme} aria-label="theme"
              className="rounded-lg p-1.5"
              style={{ background: 'var(--surface-2)', color: 'var(--text-primary)', border: '0.5px solid var(--border-strong)' }}>
              {theme === 'dark' ? <Moon size={15} /> : <Sun size={15} />}
            </button>
            <Link to="/login"
              className="rounded-lg px-3 py-1.5 text-sm font-medium"
              style={{ background: 'var(--accent)', color: '#fff' }}>
              {t('landing.login')}
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1 w-full">
        {/* Hero */}
        <section className="max-w-5xl mx-auto px-4 pt-16 pb-14 text-center flex flex-col items-center">
          <h1 className="text-3xl sm:text-4xl font-semibold max-w-2xl" style={{ color: 'var(--text-primary)' }}>
            {t('landing.heroTitle')}
          </h1>
          <p className="mt-4 text-base max-w-xl" style={{ color: 'var(--text-secondary)' }}>
            {t('landing.heroSubtitle')}
          </p>
          <button onClick={() => navigate('/pricing')}
            className="mt-7 rounded-lg px-6 py-3 text-sm font-medium flex items-center gap-2"
            style={{ background: 'var(--accent)', color: '#fff' }}>
            {t('landing.heroCta')} <ArrowRight size={16} />
          </button>
          <p className="mt-3 text-xs" style={{ color: 'var(--text-muted)' }}>{t('landing.heroTrialHint')}</p>
        </section>

        {/* Qué es Nokfi / info de empresa */}
        <section className="max-w-5xl mx-auto px-4 py-12">
          <div className="text-center mb-8">
            <h2 className="text-xl font-semibold" style={{ color: 'var(--text-primary)' }}>{t('landing.aboutHeading')}</h2>
            <p className="mt-3 text-sm max-w-2xl mx-auto" style={{ color: 'var(--text-secondary)' }}>{t('landing.aboutBody')}</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {Array.isArray(features) && features.map((f, i) => {
              const Icon = FEATURE_ICONS[i] || FileText;
              return (
                <div key={i} className="rounded-xl p-5 flex gap-3 items-start"
                     style={{ background: 'var(--surface-1)', border: '0.5px solid var(--border)' }}>
                  <div className="shrink-0 rounded-lg p-2" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>
                    <Icon size={18} />
                  </div>
                  <div>
                    <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{f.t}</p>
                    <p className="mt-1 text-sm" style={{ color: 'var(--text-secondary)' }}>{f.d}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Planes y precios */}
        <section className="max-w-5xl mx-auto px-4 py-12 flex flex-col items-center">
          <h2 className="text-xl font-semibold mb-6" style={{ color: 'var(--text-primary)' }}>{t('landing.plansHeading')}</h2>
          <PlanCards plans={plans} notLoaded={notLoaded} failed={failed}
            ctaLabel={t('landing.choosePlan')} onChoose={() => navigate('/pricing')} loadingId={null} />
        </section>

        {/* CTA final */}
        <section className="max-w-5xl mx-auto px-4 py-12">
          <div className="rounded-2xl p-8 text-center flex flex-col items-center gap-4"
               style={{ background: 'var(--accent-soft)', border: '0.5px solid var(--accent)' }}>
            <h2 className="text-2xl font-semibold" style={{ color: 'var(--text-primary)' }}>{t('landing.finalTitle')}</h2>
            <button onClick={() => navigate('/pricing')}
              className="rounded-lg px-6 py-3 text-sm font-medium flex items-center gap-2"
              style={{ background: 'var(--accent)', color: '#fff' }}>
              {t('landing.finalCta')} <ArrowRight size={16} />
            </button>
            <Link to="/login" className="text-sm hover:underline" style={{ color: 'var(--text-secondary)' }}>
              {t('landing.finalLogin')} →
            </Link>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t" style={{ borderColor: 'var(--border)' }}>
        <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
          <Logo variant="icon" />
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>© Nokfi · {t('footer.rights')}</p>
          <LangSwitch />
        </div>
      </footer>
    </div>
  );
}
