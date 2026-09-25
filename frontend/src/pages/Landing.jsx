import { useEffect } from 'react';
import { useNavigate, Link, useSearchParams, useLocation } from 'react-router-dom';
import {
  ClipboardList, FileSpreadsheet, FileText, Calculator, ArrowRight, ChevronDown, Building2, Sparkles, ListChecks
} from 'lucide-react';
import { useLang } from '../context/LangContext';
import { useToast } from '../context/ToastContext';
import PlanCards from '../components/PlanCards';
import { PublicHeader, PublicFooter } from '../components/PublicChrome';
import { usePlans } from '../hooks/usePlans';
import { usePageMeta } from '../hooks/usePageMeta';
import { useReveal, useCountUp } from '../hooks/useReveal';
import { localeOf } from '../utils/dates';

/**
 * Home pública — nokfi.app/home (sesión 3, Tanda H; "/" redirige aquí).
 *
 * Es lo que ve CUALQUIERA antes de autenticarse: qué es Nokfi, cómo funciona,
 * módulos, planes y precios, FAQ y CTA hacia /pricing y /login. Las funciones
 * de la app siguen bajo /app/* protegidas por ProtectedRoute.
 *
 * Conserva el copy trabajado de la landing anterior (claves landing.* de
 * i18n: hero, aboutFeatures, faqItems, final…); lo nuevo es estructura, ritmo
 * e interacciones: secciones que entran al hacer scroll, cifras animadas y
 * una vista previa del producto.
 *
 * HONESTIDAD: nada de logos ni testimonios inventados. Las cifras animadas son
 * hechos del producto (30 preguntas, 6 módulos, 14 días de prueba…) y la
 * vista previa va rotulada como "Informe de ejemplo".
 *
 * Planes: <PlanCards/> con datos de usePlans() (GET /api/payments/plans) → lo
 * que muestra la home == lo que cobra Stripe. El CTA lleva a /pricing?plan=id,
 * donde está el checkout real.
 *
 * Estilo (sección 19): solo variables CSS de tema (var(--*)), nunca hex.
 */
const FEATURE_ICONS = [ClipboardList, FileSpreadsheet, FileText, Calculator];
const STEP_ICONS = [Building2, Sparkles, ListChecks];

export default function Landing() {
  const { t } = useLang();
  const toast = useToast();
  const navigate = useNavigate();
  const { hash } = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const { plans, failed, notLoaded } = usePlans();
  const features = t('landing.aboutFeatures');
  const faqItems = t('landing.faqItems');
  const steps = t('landing.howSteps');
  const facts = t('landing.facts');
  usePageMeta(t('meta.landingTitle'), t('meta.landingDesc'));

  // Stripe devuelve a /?cancelled=true si el usuario abandona el checkout.
  useEffect(() => {
    if (searchParams.get('cancelled') === 'true') {
      toast.info(t('landing.checkoutCancelled'));
      searchParams.delete('cancelled');
      setSearchParams(searchParams, { replace: true });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Enlaces entrantes con ancla (/home#faq desde /pricing).
  useEffect(() => {
    if (!hash) return;
    const el = document.getElementById(hash.slice(1));
    if (el) setTimeout(() => el.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
  }, [hash]);

  const navLinks = [
    { href: '#como-funciona', label: t('landing.navHow') },
    { href: '#modulos', label: t('landing.navModules') },
    { href: '#precios', label: t('landing.navPricing') },
    { href: '#faq', label: t('landing.navFaq') }
  ];

  return (
    <div className="min-h-screen flex flex-col overflow-x-clip" style={{ background: 'var(--bg-base)' }}>
      <PublicHeader links={navLinks} />

      <main className="flex-1 w-full">
        {/* Hero */}
        <section className="max-w-6xl mx-auto px-4 pt-10 md:pt-20 pb-16 md:pb-24 grid lg:grid-cols-[1.05fr_1fr] gap-12 lg:gap-10 items-center">
          <div className="flex flex-col items-center text-center lg:items-start lg:text-left">
            <span className="anim-enter inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium"
              style={{ '--i': 0, background: 'var(--surface-1)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--positive)' }} />
              {t('landing.heroEyebrow')}
            </span>
            <h1 className="anim-enter mt-5 text-[34px] leading-[1.1] sm:text-5xl sm:leading-[1.08] font-semibold tracking-tight max-w-xl"
              style={{ '--i': 1, color: 'var(--text-primary)' }}>
              {t('landing.heroTitle')}
            </h1>
            <p className="anim-enter mt-5 text-base sm:text-lg max-w-lg" style={{ '--i': 2, color: 'var(--text-secondary)' }}>
              {t('landing.heroSubtitle')}
            </p>
            <div className="anim-enter mt-8 flex flex-col sm:flex-row gap-3 w-full sm:w-auto" style={{ '--i': 3 }}>
              <button onClick={() => navigate('/pricing')} className="btn btn-primary !h-12 !px-6 !text-[15px]">
                {t('landing.heroCta')} <ArrowRight size={16} />
              </button>
              <a href="#como-funciona" className="btn btn-secondary !h-12 !px-6 !text-[15px]">{t('landing.heroSecondary')}</a>
            </div>
            <p className="anim-enter mt-4 text-xs" style={{ '--i': 4, color: 'var(--text-muted)' }}>{t('landing.heroTrialHint')}</p>
          </div>

          <ReportPreview t={t} />
        </section>

        {/* Cifras del producto (hechos, no métricas inventadas) */}
        <FactsStrip facts={Array.isArray(facts) ? facts : []} />

        {/* Cómo funciona */}
        <Section id="como-funciona" eyebrow={t('landing.howEyebrow')} title={t('landing.howHeading')} subtitle={t('landing.howSubtitle')}>
          <ol className="grid md:grid-cols-3 gap-4 md:gap-6 relative">
            {Array.isArray(steps) && steps.map((s, i) => {
              const Icon = STEP_ICONS[i] || Sparkles;
              return (
                <RevealItem as="li" key={i} i={i} className="card p-6 relative">
                  <div className="flex items-center justify-between mb-5">
                    <span className="w-10 h-10 rounded-xl grid place-items-center" style={{ background: 'var(--accent-soft)', color: 'var(--accent-text)' }}>
                      <Icon size={19} />
                    </span>
                    <span className="text-sm font-semibold tabular" style={{ color: 'var(--text-muted)' }}>0{i + 1}</span>
                  </div>
                  <h3 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>{s.t}</h3>
                  <p className="mt-2 text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{s.d}</p>
                </RevealItem>
              );
            })}
          </ol>
        </Section>

        {/* Qué es Nokfi / módulos */}
        <Section id="modulos" eyebrow={t('landing.modulesEyebrow')} title={t('landing.aboutHeading')} subtitle={t('landing.aboutBody')}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {Array.isArray(features) && features.map((f, i) => {
              const Icon = FEATURE_ICONS[i] || FileText;
              return (
                <RevealItem key={i} i={i} className="group card card-interactive p-6 flex gap-4 items-start">
                  <span className="shrink-0 w-11 h-11 rounded-xl grid place-items-center transition-transform duration-300 group-hover:scale-105"
                    style={{ background: 'var(--accent-soft)', color: 'var(--accent-text)' }}>
                    <Icon size={20} />
                  </span>
                  <div>
                    <p className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>{f.t}</p>
                    <p className="mt-1.5 text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{f.d}</p>
                  </div>
                </RevealItem>
              );
            })}
          </div>
        </Section>

        {/* Planes y precios */}
        <Section id="precios" eyebrow={t('landing.navPricing')} title={t('landing.plansHeading')} subtitle={t('landing.plansSubtitle')}>
          <div className="flex flex-col items-center">
            <PlanCards plans={plans} notLoaded={notLoaded} failed={failed}
              ctaLabel={t('landing.choosePlan')} onChoose={(id) => navigate(`/pricing?plan=${encodeURIComponent(id)}`)} loadingId={null} />
          </div>
        </Section>

        {/* FAQ — solo información real del producto (planes, trial, cuotas,
            procesado local de archivos). Las respuestas viven en i18n. */}
        <Section id="faq" title={t('landing.faqHeading')} narrow>
          <div className="flex flex-col gap-3">
            {Array.isArray(faqItems) && faqItems.map((f, i) => (
              <RevealItem as="details" key={i} i={i} className="card group px-5 py-4">
                <summary className="flex items-center justify-between gap-4 text-[15px] font-medium cursor-pointer select-none"
                  style={{ color: 'var(--text-primary)' }}>
                  {f.q}
                  <ChevronDown size={18} className="details-chevron shrink-0" style={{ color: 'var(--text-muted)' }} />
                </summary>
                <p className="mt-3 text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{f.a}</p>
              </RevealItem>
            ))}
          </div>
          <p className="mt-6 text-center text-sm">
            <Link to="/privacidad" className="link">{t('landing.faqPrivacyLink')} →</Link>
          </p>
        </Section>

        {/* CTA final */}
        <section className="max-w-6xl mx-auto px-4 pb-20 md:pb-28">
          <RevealItem className="rounded-3xl px-6 py-12 md:py-16 text-center flex flex-col items-center gap-5 relative overflow-hidden"
            style={{ background: 'var(--surface-1)', border: '1px solid var(--border)' }}>
            <div aria-hidden="true" className="absolute inset-0 pointer-events-none"
              style={{ background: 'radial-gradient(60% 80% at 50% 0%, var(--accent-soft), transparent 70%)' }} />
            <h2 className="relative text-3xl md:text-4xl font-semibold tracking-tight max-w-xl" style={{ color: 'var(--text-primary)' }}>{t('landing.finalTitle')}</h2>
            <p className="relative text-base max-w-md" style={{ color: 'var(--text-secondary)' }}>{t('landing.finalSubtitle')}</p>
            <div className="relative flex flex-col sm:flex-row gap-3 w-full sm:w-auto mt-1">
              <button onClick={() => navigate('/pricing')} className="btn btn-primary !h-12 !px-6 !text-[15px]">
                {t('landing.finalCta')} <ArrowRight size={16} />
              </button>
              <Link to="/login" className="btn btn-ghost !h-12 !px-6 !text-[15px]">{t('landing.finalLogin')}</Link>
            </div>
          </RevealItem>
        </section>
      </main>

      <PublicFooter />
    </div>
  );
}

function Section({ id, eyebrow, title, subtitle, children, narrow }) {
  const [ref] = useReveal();
  return (
    <section id={id} className={`${narrow ? 'max-w-3xl' : 'max-w-6xl'} mx-auto px-4 py-16 md:py-24 scroll-mt-16`}>
      <div ref={ref} className="reveal text-center mb-10 md:mb-14 max-w-2xl mx-auto">
        {eyebrow && <p className="text-xs font-semibold uppercase tracking-[0.14em] mb-3" style={{ color: 'var(--accent-text)' }}>{eyebrow}</p>}
        <h2 className="text-[28px] leading-tight md:text-4xl font-semibold tracking-tight" style={{ color: 'var(--text-primary)' }}>{title}</h2>
        {subtitle && <p className="mt-4 text-base leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{subtitle}</p>}
      </div>
      {children}
    </section>
  );
}

/** Elemento que entra con fade/slide al hacer scroll; `i` = retardo escalonado. */
function RevealItem({ as: Tag = 'div', i = 0, className = '', style, children }) {
  const [ref] = useReveal();
  return <Tag ref={ref} className={`reveal ${className}`} style={{ '--i': i, ...style }}>{children}</Tag>;
}

function FactsStrip({ facts }) {
  const [ref, visible] = useReveal({ threshold: 0.3 });
  return (
    <section className="max-w-6xl mx-auto px-4">
      <div ref={ref} className="reveal grid grid-cols-2 md:grid-cols-4 rounded-2xl overflow-hidden"
        style={{ border: '1px solid var(--border)', background: 'var(--border)', gap: 1 }}>
        {facts.map((f, i) => <Fact key={i} f={f} visible={visible} />)}
      </div>
    </section>
  );
}

function Fact({ f, visible }) {
  const value = useCountUp(f.n, visible);
  return (
    <div className="px-5 py-6 md:py-8 text-center md:text-left" style={{ background: 'var(--bg-base)' }}>
      <p className="text-3xl md:text-4xl font-semibold tracking-tight tabular" style={{ color: 'var(--text-primary)' }}>
        {value}{f.suffix}
      </p>
      <p className="mt-1.5 text-sm" style={{ color: 'var(--text-secondary)' }}>{f.label}</p>
    </div>
  );
}

/**
 * Vista previa del producto: un informe de EJEMPLO (rotulado como tal) con la
 * forma real de lo que devuelve Nokfi — cifras clave, evolución y prioridades.
 */
function ReportPreview({ t }) {
  const { lang } = useLang();
  const [ref] = useReveal({ threshold: 0.2 });
  const kpis = t('landing.previewKpis');
  const items = t('landing.previewItems');
  const bars = [46, 58, 52, 69, 63, 80];
  const now = new Date();
  const months = bars.map((_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (bars.length - 1 - i), 1);
    const m = d.toLocaleDateString(localeOf(lang), { month: 'short' }).replace('.', '');
    return m.charAt(0).toUpperCase() + m.slice(1);
  });
  const tones = ['var(--negative)', 'var(--warning)', 'var(--positive)'];

  return (
    <div className="relative anim-enter" style={{ '--i': 3 }}>
      <div aria-hidden="true" className="absolute -inset-8 pointer-events-none"
        style={{ background: 'radial-gradient(closest-side, var(--accent-soft), transparent)' }} />
      <div ref={ref} className="relative rounded-2xl p-5 sm:p-6"
        style={{ background: 'var(--surface-1)', border: '1px solid var(--border-strong)', boxShadow: 'var(--shadow-lg)' }}
        role="img" aria-label={t('landing.previewLabel')}>
        <div className="flex items-center justify-between gap-3 mb-5">
          <div className="flex items-center gap-2.5 min-w-0">
            <img src="/favicon.svg" alt="" width={22} height={22} />
            <div className="min-w-0">
              <p className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>{t('landing.previewTitle')}</p>
              <p className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>{t('landing.previewCompany')}</p>
            </div>
          </div>
          <span className="shrink-0 text-[11px] font-medium rounded-full px-2.5 py-1"
            style={{ background: 'var(--surface-2)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}>
            {t('landing.previewLabel')}
          </span>
        </div>

        <div className="grid grid-cols-3 gap-2 mb-5">
          {Array.isArray(kpis) && kpis.map((k, i) => (
            <div key={i} className="rounded-xl p-3" style={{ background: 'var(--surface-2)' }}>
              <p className="text-[11px] leading-tight" style={{ color: 'var(--text-muted)' }}>{k.l}</p>
              <p className="text-lg font-semibold tabular mt-1" style={{ color: 'var(--text-primary)' }}>{k.v}</p>
            </div>
          ))}
        </div>

        <div className="rounded-xl p-4 mb-5" style={{ background: 'var(--surface-2)' }}>
          <p className="text-xs font-medium mb-3" style={{ color: 'var(--text-secondary)' }}>{t('landing.previewChart')}</p>
          <div className="flex items-end gap-2 sm:gap-3 h-24">
            {bars.map((h, i) => (
              <div key={i} className="flex-1 flex flex-col items-center gap-1.5 h-full justify-end">
                <div className="grow-bar w-full rounded-md" style={{
                  '--i': i, height: `${h}%`,
                  background: i === bars.length - 1 ? 'var(--accent)' : 'var(--border-strong)'
                }} />
                <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{months[i]}</span>
              </div>
            ))}
          </div>
        </div>

        <p className="text-xs font-medium mb-2.5" style={{ color: 'var(--text-secondary)' }}>{t('landing.previewPriorities')}</p>
        <ul className="flex flex-col gap-2">
          {Array.isArray(items) && items.map((it, i) => (
            <li key={i} className="flex items-start gap-2.5 text-sm" style={{ color: 'var(--text-primary)' }}>
              <span className="mt-1.5 w-2 h-2 rounded-full shrink-0" style={{ background: tones[i] || 'var(--accent)' }} />
              {it}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
