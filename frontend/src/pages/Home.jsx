import { useState, useEffect, useCallback, useMemo } from 'react';
import { useOutletContext, Link } from 'react-router-dom';
import {
  X, Check, ClipboardList, FileSpreadsheet, Calculator, ArrowRight, ChevronRight, Gift, FileText,
  Landmark, HandCoins, Droplets, LineChart, CalendarDays, BookOpen, AlertTriangle
} from 'lucide-react';
import { analysesApi, dashboardApi, actionsApi } from '../middleware/api';
import { ScoreRing, healthTone } from '../components/HealthScore';
import { eur, isoDate } from '../utils/money';
import { apiErrorMessage, isConnectivityError } from '../middleware/errors';
import { useLang } from '../context/LangContext';
import { useAuth } from '../context/AuthContext';
import Skeleton from '../components/Skeleton';
import ErrorState from '../components/ErrorState';
import { toolLabelKey } from '../utils/nokfiLinks';
import { parseDbDate, relativeTime, utcDay, localeOf, formatTime } from '../utils/dates';
import { KIND_ICON, kindLabel, analysisTitle, analysisSource, analysisResult } from './Historial';

/**
 * Panel de inicio (/app/home) — sesión 8: Inicio en DOS MODOS (decidido en la
 * revisión de la sesión 5).
 *
 *   - Sin datos en el libro: casi solo los Primeros pasos, con UNO principal
 *     (subir facturas) y el próximo plazo fiscal como pieza útil.
 *   - Con datos: arriba el dinero (Hacienda, cobros vencidos, caja a 90 días)
 *     junto al próximo plazo en grande; después el plan de acción del último
 *     informe. Las métricas de uso (análisis, cuota) bajan a una línea al final.
 *
 * Todo sale de GET /api/dashboard (cálculos del backend) y GET /api/analyses.
 */
export default function Home() {
  const { profile, updateProfile, loading: profileLoading } = useOutletContext();
  const { license } = useAuth();
  const { t, lang } = useLang();
  const [items, setItems] = useState(null);
  const [failure, setFailure] = useState(null);
  const [dash, setDash] = useState(null);

  const load = useCallback(async () => {
    setFailure(null);
    const [res, d] = await Promise.all([analysesApi.list(), dashboardApi.get()]);
    if (res.ok) setItems(res.data.analyses || []);
    else setFailure(res);
    if (d.ok) setDash(d.data);
    else if (res.ok) setFailure(d);
  }, []);
  useEffect(() => { load(); }, [load]);

  const stats = useMemo(() => {
    if (!items) return null;
    const today = utcDay(new Date());
    const kinds = new Set(items.map(a => a.kind));
    if (dash?.ledger_count) kinds.add('ledger');
    const usedToday = items.filter(a => { const d = parseDbDate(a.created_at); return d && utcDay(d) === today; }).length;
    return { total: items.length, usedToday, kinds };
  }, [items, dash]);

  const trialEnd = license?.trial_ends_at ? new Date(license.trial_ends_at) : null;
  const trialDaysLeft = trialEnd && trialEnd > new Date() ? Math.ceil((trialEnd - new Date()) / 86400000) : null;
  const ready = stats && dash && !profileLoading;
  const hasData = !!dash?.ledger_count;

  return (
    <div className="flex flex-col gap-5 md:gap-6">
      <header>
        <h1 className="text-[22px] md:text-2xl font-semibold tracking-tight" style={{ color: 'var(--text-primary)' }}>{greeting(t)}</h1>
        <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
          {profile.companyName ? `${profile.companyName} · ` : ''}
          <span className="first-letter:uppercase inline-block">{new Date().toLocaleDateString(localeOf(lang), { weekday: 'long', day: 'numeric', month: 'long' })}</span>
        </p>
      </header>

      {trialDaysLeft != null && (
        <div className="flex items-center gap-3 rounded-xl px-4 py-3 text-sm"
          style={{ background: 'var(--accent-soft)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}>
          <Gift size={16} className="shrink-0" style={{ color: 'var(--accent-text)' }} />
          <span className="flex-1">{t('home.trialBanner', { n: trialDaysLeft })}</span>
          <Link to="/app/configuracion?s=plan" className="link text-sm font-medium shrink-0">{t('home.trialManage')}</Link>
        </div>
      )}

      <NewsNotice t={t} />

      {failure ? (
        <ErrorState compact offline={isConnectivityError(failure)} message={apiErrorMessage(t, failure)} onRetry={load} />
      ) : !ready ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4" aria-busy="true">
          <Skeleton className="h-48 lg:col-span-1" /><Skeleton className="h-48 lg:col-span-2" />
        </div>
      ) : hasData ? (
        <WithData dash={dash} stats={stats} items={items} license={license} onChange={load} t={t} lang={lang} />
      ) : (
        <WithoutData dash={dash} stats={stats} items={items} profile={profile} onChange={load}
          onDismiss={() => updateProfile({ welcomeCardDismissed: true })} t={t} lang={lang} />
      )}
    </div>
  );
}

/**
 * Aviso de novedad (sesión 11, 2-10-2026): emisión de facturas y términos
 * actualizados. Se cierra por dispositivo (es solo informativo).
 */
const NEWS_KEY = 'nokfi.news.2026-10-invoicing';
function NewsNotice({ t }) {
  const [open, setOpen] = useState(() => { try { return !localStorage.getItem(NEWS_KEY); } catch { return true; } });
  if (!open) return null;
  const close = () => { try { localStorage.setItem(NEWS_KEY, '1'); } catch { /* nada */ } setOpen(false); };
  return (
    <div className="flex items-start gap-3 rounded-xl px-4 py-3 text-sm" style={{ background: 'var(--accent-soft)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}>
      <FileText size={16} className="shrink-0 mt-0.5" style={{ color: 'var(--accent-text)' }} />
      <div className="flex-1">
        <p><span className="font-semibold">{t('home.newsTitle')}</span> {t('home.newsText')}</p>
        <p className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
          <Link to="/app/finanzas/facturas" className="link font-medium">{t('home.newsCta')}</Link>
          <Link to="/terminos" className="link">{t('home.newsTerms')}</Link>
          <Link to="/encargo-tratamiento" className="link">{t('home.newsDpa')}</Link>
          <Link to="/privacidad" className="link">{t('home.newsPrivacy')}</Link>
        </p>
      </div>
      <button onClick={close} className="btn btn-ghost btn-sm !px-2 -mr-1 -mt-1" aria-label={t('common.close')} title={t('common.close')}><X size={15} /></button>
    </div>
  );
}

function greeting(t) {
  const h = new Date().getHours();
  if (h >= 6 && h < 13) return t('home.goodMorning');
  if (h >= 13 && h < 20) return t('home.goodAfternoon');
  return t('home.goodEvening');
}

/* ── Modo sin datos: primeros pasos + próximo plazo ── */
function WithoutData({ dash, stats, items, profile, onChange, onDismiss, t, lang }) {
  const showGuide = !profile.welcomeCardDismissed;
  return (
    <>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-5 items-start">
        {showGuide
          ? <GettingStarted stats={stats} profile={profile} onDismiss={onDismiss} t={t} className="lg:col-span-2" />
          : <LedgerInvite t={t} className="lg:col-span-2" />}
        <DeadlineCard deadline={dash.next_deadline} t={t} lang={lang} />
      </div>
      {dash.actions.total > 0 && <ActionsCard actions={dash.actions} t={t} onChange={onChange} />}
      {stats.total > 0 && <RecentCard items={items} t={t} lang={lang} />}
    </>
  );
}

function LedgerInvite({ t, className = '' }) {
  return (
    <Link to="/app/finanzas/libro" className={`card card-interactive p-5 md:p-6 flex items-center gap-4 ${className}`} style={{ borderColor: 'var(--border-strong)' }}>
      <div className="flex-1 min-w-0">
        <p className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>{t('home.financeEmptyTitle')}</p>
        <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>{t('home.financeEmptyDesc')}</p>
      </div>
      <ArrowRight size={18} className="shrink-0" style={{ color: 'var(--text-muted)' }} />
    </Link>
  );
}

function GettingStarted({ stats, profile, onDismiss, t, className = '' }) {
  // El libro va primero: es lo que desbloquea impuestos, cobros y caja.
  const steps = [
    { done: stats.kinds.has('ledger'), title: t('home.stepLedger'), desc: t('home.stepLedgerDesc'), to: '/app/finanzas/libro' },
    { done: stats.kinds.has('cuestionario'), title: t('home.stepDiagnosis'), desc: t('home.stepDiagnosisDesc'), to: '/app/cuestionario' },
    { done: !!profile.companyName?.trim(), title: t('home.stepProfile'), to: '/app/configuracion' },
    { done: stats.kinds.has('excel'), title: t('home.stepExcel'), desc: t('home.stepExcelDesc'), to: '/app/excel' }
  ];
  const main = steps.find(s => !s.done);
  const rest = steps.filter(s => s !== main);
  const doneCount = steps.filter(s => s.done).length;
  return (
    <section className={`card p-5 md:p-6 ${className}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>{t('home.guideTitle')}</h2>
          <p className="text-xs mt-0.5 tabular" style={{ color: 'var(--text-muted)' }}>{t('home.guideProgress', { n: doneCount, total: steps.length })}</p>
        </div>
        <button onClick={onDismiss} className="btn btn-ghost btn-sm !px-2 -mr-1 -mt-1" aria-label={t('home.guideDismiss')} title={t('home.guideDismiss')}>
          <X size={16} />
        </button>
      </div>

      {main && (
        <div className="mt-4 rounded-xl p-4" style={{ background: 'var(--surface-2)' }}>
          <p className="text-xs font-medium" style={{ color: 'var(--accent-text)' }}>{t('home.guideStart')}</p>
          <p className="text-lg font-semibold mt-1" style={{ color: 'var(--text-primary)' }}>{main.title}</p>
          {main.desc && <p className="text-sm mt-0.5" style={{ color: 'var(--text-secondary)' }}>{main.desc}</p>}
          <Link to={main.to} className="btn btn-primary mt-3">{t('home.guideGo')} <ArrowRight size={15} /></Link>
        </div>
      )}

      <ol className="flex flex-col mt-3 -mx-2">
        {rest.map(s => (
          <li key={s.to}>
            <Link to={s.to} className="nav-item flex items-center gap-3 rounded-lg px-2 py-2.5">
              <span className="shrink-0 w-5 h-5 rounded-full grid place-items-center"
                style={s.done ? { background: 'var(--positive)', color: 'var(--on-accent)' } : { border: '1.5px solid var(--border-strong)' }}>
                {s.done && <Check size={12} strokeWidth={3} />}
              </span>
              <span className={`flex-1 min-w-0 text-sm ${s.done ? 'line-through' : 'font-medium'}`} style={{ color: s.done ? 'var(--text-muted)' : 'var(--text-primary)' }}>{s.title}</span>
              {!s.done && <ChevronRight size={15} className="shrink-0" style={{ color: 'var(--text-muted)' }} />}
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
}

/* ── Modo con datos: el dinero y el plazo arriba ── */
function WithData({ dash, stats, items, license, onChange, t, lang }) {
  return (
    <>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-5 items-stretch">
        <DeadlineCard deadline={dash.next_deadline} t={t} lang={lang} big />
        <MoneyCard dash={dash} t={t} lang={lang} className="lg:col-span-2" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-5 items-start">
        <ActionsCard actions={dash.actions} t={t} onChange={onChange} className="lg:col-span-2" />
        <HealthCard health={dash.health} t={t} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-5 items-start">
        <RecentCard items={items} t={t} lang={lang} className="lg:col-span-2" />
        <QuickActions t={t} />
      </div>

      <UsageLine total={stats.total} used={dash.ai_used_today ?? stats.usedToday} quota={license?.ai_quota ?? null} t={t} lang={lang} />
    </>
  );
}

function DeadlineCard({ deadline, t, lang, big }) {
  if (!deadline) return null;
  const n = deadline.days_left;
  const urgent = n <= 7;
  return (
    <Link to="/app/finanzas/calendario" className="card card-interactive p-5 md:p-6 flex flex-col">
      <p className="section-title flex items-center gap-1.5"><CalendarDays size={15} style={{ color: 'var(--text-muted)' }} /> {t('home.deadlineTitle')}</p>
      <p className={`${big ? 'text-3xl md:text-4xl' : 'text-2xl'} font-semibold tracking-tight mt-3 first-letter:uppercase`} style={{ color: 'var(--text-primary)' }}>
        {isoDate(deadline.date, lang, { day: 'numeric', month: 'long' })}
      </p>
      <p className="text-sm font-medium mt-1" style={{ color: urgent ? 'var(--warning)' : 'var(--text-secondary)' }}>
        {n === 0 ? t('home.deadlineToday') : t('home.deadlineDays', { n })}
      </p>
      <p className="text-sm mt-3" style={{ color: 'var(--text-secondary)' }}>{t('home.deadlineModels', { m: deadline.models.join(', '), period: deadline.period })}</p>
      <span className="mt-auto pt-4 text-sm font-medium inline-flex items-center gap-1" style={{ color: 'var(--accent-text)' }}>
        {t('home.deadlineSee')} <ArrowRight size={14} />
      </span>
    </Link>
  );
}

function MoneyCard({ dash, t, lang, className = '' }) {
  const tx = dash.taxes, rec = dash.receivables, fc = dash.forecast, lk = dash.leaks;
  const q = `${tx.quarter}T`;
  const rows = [
    tx.total_estimated > 0
      ? { to: '/app/finanzas/impuestos', icon: Landmark, label: t('home.mTaxSave', { q }), value: eur(tx.total_estimated, lang),
          hint: tx.missing > 0 ? t('finance.taxes.missing', { v: eur(tx.missing, lang) }) : t('finance.taxes.reserved', { v: eur(tx.reserved, lang) }), warn: tx.missing > 0 }
      : tx.vat_refund > 0
        ? { to: '/app/finanzas/impuestos', icon: Landmark, label: t('home.mTaxCompensate', { q }), value: eur(tx.vat_refund, lang), hint: t('home.mTaxCompensateHint') }
        : { to: '/app/finanzas/impuestos', icon: Landmark, label: t('home.mTaxNone', { q }), value: eur(0, lang), hint: t('finance.taxes.nothingToPay') },
    rec.overdue_total > 0
      ? { to: '/app/finanzas/cobros', icon: HandCoins, label: t('home.mOverdue'), value: eur(rec.overdue_total, lang), warn: true,
          hint: rec.top_overdue ? t('home.mOverdueTop', { name: rec.top_overdue.party_name || '—', n: rec.top_overdue.days_overdue }) : t('home.fOverdue', { v: eur(rec.overdue_total, lang) }) }
      : { to: '/app/finanzas/cobros', icon: HandCoins, label: t('home.fReceivables'), value: eur(rec.total, lang), hint: t('home.mNoOverdue') },
    fc
      ? { to: '/app/finanzas/prevision', icon: LineChart, label: t('home.fForecast'), value: eur(fc.at90, lang), warn: !!fc.first_below,
          hint: fc.first_below ? t('home.fBelow', { date: isoDate(fc.first_below.date, lang, { day: 'numeric', month: 'short' }) }) : t('home.fForecastOk') }
      : { to: '/app/finanzas/prevision', icon: LineChart, label: t('home.fForecast'), value: '—', hint: t('home.fForecastSetup') }
  ];
  if (lk.alerts > 0) {
    rows.push({ to: '/app/finanzas/fugas', icon: Droplets, label: t('home.fLeaksAlerts'), value: t('home.fLeaksHint', { n: lk.alerts }),
      hint: lk.recurring_monthly_total > 0 ? t('home.fRecurring', { v: eur(lk.recurring_monthly_total, lang) }) : '' });
  }
  return (
    <section className={`card p-2 md:p-3 ${className}`}>
      <h2 className="sr-only">{t('home.moneyTitle')}</h2>
      <ul className="flex flex-col">
        {rows.map((r, i) => (
          <li key={r.to} style={{ borderTop: i ? '1px solid var(--border)' : 'none' }}>
            <Link to={r.to} className="nav-item group flex items-center gap-3 rounded-lg px-3 py-3.5">
              <r.icon size={17} className="shrink-0" style={{ color: 'var(--text-muted)' }} aria-hidden="true" />
              <span className="flex-1 min-w-0">
                <span className="block text-sm" style={{ color: 'var(--text-secondary)' }}>{r.label}</span>
                {r.hint && (
                  <span className="block text-xs mt-0.5" style={{ color: r.warn ? 'var(--warning)' : 'var(--text-muted)' }}>
                    {r.warn && <AlertTriangle size={12} className="inline -mt-0.5 mr-1" />}{r.hint}
                  </span>
                )}
              </span>
              <span className="text-xl md:text-2xl font-semibold tabular shrink-0" style={{ color: 'var(--text-primary)' }}>{r.value}</span>
              <ChevronRight size={16} className="shrink-0 transition-transform group-hover:translate-x-0.5" style={{ color: 'var(--text-muted)' }} />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ── C2: plan de acción (pendientes del último informe, ya ordenadas por plazo) ── */
function ActionsCard({ actions, t, onChange, className = '' }) {
  const [busy, setBusy] = useState(null);
  const toggle = async (a) => {
    setBusy(a.id);
    await actionsApi.setDone(a.id, true);
    setBusy(null);
    onChange();
  };
  const from = actions.next[0]?.analysis_title;
  return (
    <section className={`card p-4 md:p-5 ${className}`}>
      <div className="flex items-baseline justify-between gap-3 mb-2">
        <h2 className="section-title">{t('home.actionsTitle')}</h2>
        {from && <span className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>{t('home.actionsFrom', { title: from })}</span>}
      </div>
      {actions.total === 0 ? (
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{t('home.actionsEmpty')}</p>
      ) : actions.next.length === 0 ? (
        <p className="text-sm" style={{ color: 'var(--positive)' }}>{t('home.actionsAllDone')}</p>
      ) : (
        <ul className="flex flex-col -mx-2">
          {actions.next.map(a => (
            <li key={a.id} className="flex items-start gap-1">
              <button onClick={() => toggle(a)} disabled={busy === a.id} aria-label={t('home.actionDone', { title: a.title })}
                className="nav-item flex-1 min-w-0 text-left flex items-start gap-3 rounded-lg px-2 py-2.5">
                <span className="shrink-0 mt-0.5 w-5 h-5 rounded-md" style={{ border: '1.5px solid var(--border-strong)' }} />
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{a.title}</span>
                  {a.timeframe && <span className="block text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{a.timeframe}</span>}
                </span>
              </button>
              {toolLabelKey(a.link) && (
                <Link to={a.link} className="btn btn-ghost btn-sm shrink-0 mt-1.5" title={t('report.goTo', { name: t(toolLabelKey(a.link)) })} aria-label={t('report.goTo', { name: t(toolLabelKey(a.link)) })}>
                  <span className="hidden sm:inline">{t(toolLabelKey(a.link))}</span> <ArrowRight size={13} />
                </Link>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/* ── C1: nota de salud (reglas fijas, del último diagnóstico) ── */
function HealthCard({ health, t }) {
  if (!health) {
    return (
      <Link to="/app/cuestionario" className="card card-interactive p-4 md:p-5 flex items-center gap-4">
        <span className="w-14 h-14 rounded-full grid place-items-center shrink-0" style={{ border: '2px dashed var(--border-strong)', color: 'var(--text-muted)' }}>?</span>
        <div className="min-w-0">
          <p className="section-title">{t('report.healthTitle')}</p>
          <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>{t('home.healthEmpty')}</p>
        </div>
      </Link>
    );
  }
  const { band } = healthTone(health.score);
  return (
    <Link to={`/app/historial/${health.analysis_id}`} className="card card-interactive p-4 md:p-5 flex items-center gap-4">
      <ScoreRing score={health.score} size={64} />
      <div className="min-w-0">
        <p className="section-title">{t('report.healthTitle')}</p>
        <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>{t(`report.health_${band}`)}</p>
      </div>
    </Link>
  );
}

function RecentCard({ items, t, lang, className = '' }) {
  return (
    <section className={`card p-4 md:p-5 ${className}`}>
      <div className="flex items-center justify-between mb-2">
        <h2 className="section-title">{t('home.recent')}</h2>
        {items.length > 0 && <Link to="/app/historial" className="link text-sm font-medium">{t('home.seeAll')}</Link>}
      </div>
      {items.length ? (
        <ul className="flex flex-col -mx-2">
          {items.slice(0, 4).map(a => {
            const Icon = KIND_ICON[a.kind] || FileText;
            return (
              <li key={a.id}>
                <Link to={`/app/historial/${a.id}`} className="nav-item flex items-center gap-3 rounded-lg px-2 py-2.5">
                  <Icon size={16} className="shrink-0" style={{ color: 'var(--text-muted)' }} aria-hidden="true" />
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>{analysisTitle(a, lang)}</span>
                    <span className="block text-xs truncate" style={{ color: 'var(--text-muted)' }}>{[analysisResult(a, t, lang) || analysisSource(a) || kindLabel(a.kind, t), relativeTime(a.created_at, lang)].join(' · ')}</span>
                  </span>
                  <ChevronRight size={15} className="shrink-0" style={{ color: 'var(--text-muted)' }} />
                </Link>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-sm py-4" style={{ color: 'var(--text-secondary)' }}>{t('home.recentEmpty')}</p>
      )}
    </section>
  );
}

function QuickActions({ t }) {
  const list = [
    { to: '/app/finanzas/libro', icon: BookOpen, title: t('home.qaLedger') },
    { to: '/app/cuestionario', icon: ClipboardList, title: t('home.qaDiagnosis') },
    { to: '/app/excel', icon: FileSpreadsheet, title: t('home.qaExcel') },
    { to: '/app/calculadoras', icon: Calculator, title: t('home.qaCalc') }
  ];
  return (
    <section className="card p-4 md:p-5">
      <h2 className="section-title mb-2">{t('home.quickActions')}</h2>
      <ul className="flex flex-col -mx-2">
        {list.map(({ to, icon: Icon, title }) => (
          <li key={to}>
            <Link to={to} className="nav-item flex items-center gap-3 rounded-lg px-2 py-2.5 text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
              <Icon size={16} className="shrink-0" style={{ color: 'var(--text-muted)' }} aria-hidden="true" />
              <span className="flex-1">{title}</span>
              <ChevronRight size={15} className="shrink-0" style={{ color: 'var(--text-muted)' }} />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Métricas de uso en una línea discreta (antes eran las tres tarjetas de arriba). */
function UsageLine({ total, used, quota, t, lang }) {
  const now = new Date();
  const reset = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
  return (
    <p className="text-xs tabular" style={{ color: 'var(--text-muted)' }}>
      {t('home.usageTotal', { n: total })}
      {quota != null && ` · ${t('home.usageToday', { used, quota, time: formatTime(reset, lang) })}`}
    </p>
  );
}
