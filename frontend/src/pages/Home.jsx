import { useState, useEffect, useCallback, useMemo } from 'react';
import { useOutletContext, Link } from 'react-router-dom';
import {
  X, Check, ClipboardList, FileSpreadsheet, Calculator, ArrowRight, BarChart3, Clock, Sparkles, ChevronRight, Gift,
  Landmark, HandCoins, Droplets, LineChart, CalendarDays, ListChecks, Wallet, BookOpen, AlertTriangle
} from 'lucide-react';
import { analysesApi, dashboardApi, actionsApi } from '../middleware/api';
import { ScoreRing, healthTone } from '../components/HealthScore';
import { eur, isoDate } from '../utils/money';
import { apiErrorMessage, isConnectivityError } from '../middleware/errors';
import { useLang } from '../context/LangContext';
import { useAuth } from '../context/AuthContext';
import Skeleton from '../components/Skeleton';
import ErrorState from '../components/ErrorState';
import { parseDbDate, relativeTime, utcDay, localeOf, formatTime } from '../utils/dates';
import { KIND_ICON, kindLabel } from './Historial';

/**
 * Panel de inicio (/app/home) — sesión 3, Tanda D ("dashboard vivo").
 *
 * Antes: 3 KPI cards con valores FIJOS ("—", "0", "Sin datos aún") que nunca
 * se alimentaban. Ahora todo sale de datos reales que ya expone la API:
 *   - GET /api/analyses → nº de análisis, este mes, último, actividad reciente
 *     y los análisis de HOY (día UTC, el mismo corte que la cuota del backend).
 *   - license.ai_quota (login/verify) → cuota diaria del plan.
 * "Salud financiera" y "Alertas activas" se retiraron: no hay motor de scoring
 * y mostrar números inventados rompía la confianza (plan D.3: nada falso).
 *
 * Usuario nuevo: guía de primeros pasos (sustituye a la welcome card) con los
 * pasos marcados según lo que ya hizo; se puede descartar (welcomeCardDismissed).
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
    setItems(null);
    const [res, d] = await Promise.all([analysesApi.list(), dashboardApi.get()]);
    if (res.ok) setItems(res.data.analyses || []);
    else setFailure(res);
    if (d.ok) setDash(d.data);
  }, []);
  useEffect(() => { load(); }, [load]);

  const stats = useMemo(() => {
    if (!items) return null;
    const now = new Date();
    const today = utcDay(now);
    let month = 0, usedToday = 0;
    const kinds = new Set();
    for (const a of items) {
      const d = parseDbDate(a.created_at);
      kinds.add(a.kind);
      if (!d) continue;
      if (d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()) month++;
      if (utcDay(d) === today) usedToday++;
    }
    if (dash?.ledger_count) kinds.add('ledger');
    return { total: items.length, month, usedToday, last: items[0] || null, kinds };
  }, [items, dash]);

  const dismissGuide = () => updateProfile({ welcomeCardDismissed: true });
  const showGuide = !profileLoading && stats && !profile.welcomeCardDismissed
    && !(stats.kinds.has('cuestionario') && stats.kinds.has('ledger'));

  const quota = license?.ai_quota ?? null;
  const trialEnd = license?.trial_ends_at ? new Date(license.trial_ends_at) : null;
  const trialDaysLeft = trialEnd && trialEnd > new Date() ? Math.ceil((trialEnd - new Date()) / 86400000) : null;

  return (
    <div className="flex flex-col gap-5 md:gap-6">
      <header>
        <h1 className="text-[22px] md:text-2xl font-semibold tracking-tight" style={{ color: 'var(--text-primary)' }}>
          {greeting(t)}{profile.companyName ? `, ${profile.companyName}` : ''}
        </h1>
        <p className="text-sm mt-1 first-letter:uppercase" style={{ color: 'var(--text-secondary)' }}>
          {new Date().toLocaleDateString(localeOf(lang), { weekday: 'long', day: 'numeric', month: 'long' })}
        </p>
      </header>

      {trialDaysLeft != null && (
        <div className="anim-enter flex items-center gap-3 rounded-xl px-4 py-3 text-sm"
          style={{ background: 'var(--accent-soft)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}>
          <Gift size={16} className="shrink-0" style={{ color: 'var(--accent-text)' }} />
          <span className="flex-1">{t('home.trialBanner', { n: trialDaysLeft })}</span>
          <Link to="/app/configuracion" className="link text-sm font-medium shrink-0">{t('home.trialManage')}</Link>
        </div>
      )}

      {showGuide && <GettingStarted stats={stats} onDismiss={dismissGuide} t={t} />}

      {failure ? (
        <ErrorState compact offline={isConnectivityError(failure)} message={apiErrorMessage(t, failure)} onRetry={load} />
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 md:gap-4">
          <KpiCard i={0} icon={BarChart3} label={t('home.kpiTotal')} loading={!stats}
            value={stats?.total} hint={stats && (stats.total ? t('home.kpiMonth').replace('{n}', stats.month) : t('home.kpiTotalEmpty'))} />
          <KpiCard i={1} icon={Clock} label={t('home.lastAnalysis')} loading={!stats}
            className="col-span-2 sm:col-span-1 order-last sm:order-none"
            value={stats?.last ? relativeTime(stats.last.created_at, lang) : t('home.none')}
            valueSmall
            hint={stats?.last ? stats.last.title : t('home.lastEmpty')}
            to={stats?.last ? `/app/historial/${stats.last.id}` : null} />
          <QuotaCard i={2} loading={!stats} used={stats?.usedToday ?? 0} quota={quota} t={t} lang={lang} />
        </div>
      )}

      {dash && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-5">
          <HealthCard health={dash.health} t={t} />
          <ActionsCard actions={dash.actions} t={t} onChange={load} />
        </div>
      )}

      {dash && <FinanceStrip dash={dash} t={t} lang={lang} />}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-5">
        <section className="card lg:col-span-2 p-4 md:p-5 anim-enter" style={{ '--i': 3 }}>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{t('home.recent')}</h2>
            {stats?.total > 0 && <Link to="/app/historial" className="link text-sm font-medium">{t('home.seeAll')}</Link>}
          </div>
          {!stats && !failure ? (
            <div className="flex flex-col gap-1" aria-busy="true">
              {[0, 1, 2].map(i => (
                <div key={i} className="flex items-center gap-3 py-2.5">
                  <Skeleton className="w-9 h-9 !rounded-lg" /><div className="flex-1"><Skeleton className="h-3.5 w-1/2 mb-2" /><Skeleton className="h-3 w-24" /></div>
                </div>
              ))}
            </div>
          ) : stats?.total ? (
            <ul className="flex flex-col -mx-2">
              {items.slice(0, 5).map(a => {
                const Icon = KIND_ICON[a.kind] || Sparkles;
                return (
                  <li key={a.id}>
                    <Link to={`/app/historial/${a.id}`} className="nav-item flex items-center gap-3 rounded-lg px-2 py-2.5">
                      <span className="shrink-0 w-9 h-9 rounded-lg grid place-items-center" style={{ background: 'var(--surface-2)' }}><Icon size={16} /></span>
                      <span className="flex-1 min-w-0">
                        <span className="block text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>{a.title}</span>
                        <span className="block text-xs" style={{ color: 'var(--text-muted)' }}>{kindLabel(a.kind, t)} · {relativeTime(a.created_at, lang)}</span>
                      </span>
                      <ChevronRight size={15} className="shrink-0" style={{ color: 'var(--text-muted)' }} />
                    </Link>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-sm py-6 text-center" style={{ color: 'var(--text-secondary)' }}>{t('home.recentEmpty')}</p>
          )}
        </section>

        <section className="anim-enter flex flex-col gap-3" style={{ '--i': 4 }}>
          <h2 className="sr-only">{t('home.quickActions')}</h2>
          <QuickAction to="/app/finanzas/libro" icon={BookOpen} title={t('home.qaLedger')} desc={t('home.qaLedgerDesc')} />
          <QuickAction to="/app/cuestionario" icon={ClipboardList} title={t('home.qaDiagnosis')} desc={t('home.qaDiagnosisDesc')} />
          <QuickAction to="/app/excel" icon={FileSpreadsheet} title={t('home.qaExcel')} desc={t('home.qaExcelDesc')} />
          <QuickAction to="/app/calculadoras" icon={Calculator} title={t('home.qaCalc')} desc={t('home.qaCalcDesc')} />
        </section>
      </div>
    </div>
  );
}

function greeting(t) {
  const h = new Date().getHours();
  if (h >= 6 && h < 13) return t('home.goodMorning');
  if (h >= 13 && h < 20) return t('home.goodAfternoon');
  return t('home.goodEvening');
}

function KpiCard({ icon: Icon, label, value, valueSmall, hint, loading, to, i, className = '' }) {
  const body = (
    <>
      <div className="flex items-center gap-2 mb-3" style={{ color: 'var(--text-muted)' }}>
        <Icon size={15} />
        <span className="text-xs font-medium uppercase tracking-wide">{label}</span>
      </div>
      {loading ? (
        <><Skeleton className="h-7 w-16 mb-2" /><Skeleton className="h-3 w-28" /></>
      ) : (
        <>
          <div className={`${valueSmall ? 'text-lg md:text-xl leading-9' : 'text-2xl md:text-3xl'} font-semibold tabular mb-1 first-letter:uppercase truncate`}
            style={{ color: 'var(--text-primary)' }}>{value}</div>
          <div className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>{hint}</div>
        </>
      )}
    </>
  );
  const cls = `card anim-enter p-4 md:p-5 min-w-0 ${className}`;
  return to
    ? <Link to={to} className={`${cls} card-interactive`} style={{ '--i': i }}>{body}</Link>
    : <div className={cls} style={{ '--i': i }}>{body}</div>;
}

/** Cuota IA de hoy: usados (análisis con fecha UTC de hoy) / cuota del plan. */
function QuotaCard({ used, quota, loading, t, lang, i }) {
  const pct = quota ? Math.min(100, (used / quota) * 100) : 0;
  const tone = pct >= 100 ? 'var(--negative)' : pct >= 80 ? 'var(--warning)' : 'var(--accent)';
  // El contador se reinicia a medianoche UTC → se muestra en la hora local.
  const now = new Date();
  const reset = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
  return (
    <div className="card anim-enter p-4 md:p-5 min-w-0" style={{ '--i': i }}>
      <div className="flex items-center gap-2 mb-3" style={{ color: 'var(--text-muted)' }}>
        <Sparkles size={15} />
        <span className="text-xs font-medium uppercase tracking-wide">{t('home.kpiQuota')}</span>
      </div>
      {loading ? (
        <><Skeleton className="h-7 w-20 mb-3" /><Skeleton className="h-1.5 w-full" /></>
      ) : (
        <>
          <div className="flex items-baseline gap-1 mb-2.5">
            <span className="text-2xl md:text-3xl font-semibold tabular" style={{ color: 'var(--text-primary)' }}>{used}</span>
            {quota != null && <span className="text-sm tabular" style={{ color: 'var(--text-muted)' }}>/ {quota}</span>}
          </div>
          {quota != null && (
            <div className="h-1.5 rounded-full overflow-hidden mb-2" style={{ background: 'var(--surface-2)' }}
              role="progressbar" aria-valuemin={0} aria-valuemax={quota} aria-valuenow={used} aria-label={t('home.kpiQuota')}>
              <div className="h-full rounded-full" style={{ width: `${pct}%`, background: tone, transition: 'width 700ms var(--ease-out)' }} />
            </div>
          )}
          <div className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>
            {t('home.quotaReset').replace('{time}', formatTime(reset, lang))}
          </div>
        </>
      )}
    </div>
  );
}

function QuickAction({ to, icon: Icon, title, desc }) {
  return (
    <Link to={to} className="group card card-interactive p-4 flex items-center gap-3">
      <span className="shrink-0 w-10 h-10 rounded-xl grid place-items-center" style={{ background: 'var(--accent-soft)', color: 'var(--accent-text)' }}>
        <Icon size={18} />
      </span>
      <span className="flex-1 min-w-0">
        <span className="block text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{title}</span>
        <span className="block text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>{desc}</span>
      </span>
      <ArrowRight size={16} className="shrink-0 transition-transform duration-200 group-hover:translate-x-0.5" style={{ color: 'var(--text-muted)' }} />
    </Link>
  );
}

function GettingStarted({ stats, onDismiss, t }) {
  const steps = [
    { done: true, title: t('home.stepProfile'), to: '/app/configuracion' },
    { done: stats.kinds.has('cuestionario'), title: t('home.stepDiagnosis'), desc: t('home.stepDiagnosisDesc'), to: '/app/cuestionario' },
    { done: stats.kinds.has('ledger'), title: t('home.stepLedger'), desc: t('home.stepLedgerDesc'), to: '/app/finanzas/libro' },
    { done: stats.kinds.has('excel'), title: t('home.stepExcel'), desc: t('home.stepExcelDesc'), to: '/app/excel' }
  ];
  const doneCount = steps.filter(s => s.done).length;
  return (
    <section className="card anim-enter p-4 md:p-5" style={{ borderColor: 'var(--border-strong)' }}>
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <h2 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>{t('home.guideTitle')}</h2>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-secondary)' }}>{t('home.welcomeCard')}</p>
        </div>
        <button onClick={onDismiss} className="btn btn-ghost btn-sm !px-2 -mr-1 -mt-1" aria-label={t('home.guideDismiss')} title={t('home.guideDismiss')}>
          <X size={16} />
        </button>
      </div>
      <div className="flex items-center gap-3 mb-3">
        <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--surface-2)' }}>
          <div className="h-full rounded-full" style={{ width: `${(doneCount / steps.length) * 100}%`, background: 'var(--positive)', transition: 'width 700ms var(--ease-out)' }} />
        </div>
        <span className="text-xs tabular shrink-0" style={{ color: 'var(--text-muted)' }}>{t('home.guideProgress').replace('{n}', doneCount).replace('{total}', steps.length)}</span>
      </div>
      <ol className="flex flex-col gap-1 -mx-2">
        {steps.map((s, i) => (
          <li key={i}>
            <Link to={s.to} className="nav-item flex items-center gap-3 rounded-lg px-2 py-2.5">
              <span className="shrink-0 w-6 h-6 rounded-full grid place-items-center text-xs font-semibold"
                style={s.done
                  ? { background: 'var(--positive)', color: 'var(--on-accent)' }
                  : { border: '1.5px solid var(--border-strong)', color: 'var(--text-muted)' }}>
                {s.done ? <Check size={13} strokeWidth={3} /> : i + 1}
              </span>
              <span className="flex-1 min-w-0">
                <span className={`block text-sm font-medium ${s.done ? 'line-through' : ''}`}
                  style={{ color: s.done ? 'var(--text-muted)' : 'var(--text-primary)' }}>{s.title}</span>
                {!s.done && s.desc && <span className="block text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>{s.desc}</span>}
              </span>
              {!s.done && <ArrowRight size={15} className="shrink-0" style={{ color: 'var(--text-muted)' }} />}
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
}

/* ── C1: nota de salud (reglas fijas, del último diagnóstico) ── */
function HealthCard({ health, t }) {
  if (!health) {
    return (
      <Link to="/app/cuestionario" className="card card-interactive anim-enter p-4 md:p-5 flex items-center gap-4" style={{ '--i': 2 }}>
        <span className="w-14 h-14 rounded-full grid place-items-center shrink-0" style={{ border: '2px dashed var(--border-strong)', color: 'var(--text-muted)' }}>?</span>
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>{t('report.healthTitle')}</p>
          <p className="text-sm font-medium mt-1" style={{ color: 'var(--text-primary)' }}>{t('home.healthEmpty')}</p>
        </div>
      </Link>
    );
  }
  const { band } = healthTone(health.score);
  const lost = (health.lost || []).slice(0, 2);
  return (
    <Link to={`/app/historial/${health.analysis_id}`} className="card card-interactive anim-enter p-4 md:p-5 flex items-center gap-4" style={{ '--i': 2 }}>
      <ScoreRing score={health.score} size={72} />
      <div className="min-w-0">
        <p className="text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>{t('report.healthTitle')}</p>
        <p className="text-sm font-semibold mt-1" style={{ color: 'var(--text-primary)' }}>{t(`report.health_${band}`)}</p>
        {lost.length > 0 && (
          <p className="text-xs mt-1 truncate" style={{ color: 'var(--text-secondary)' }}>
            {t('report.healthLost')}: {lost.map(l => t(`questionnaire.items.${l.id}`)).join(', ')}
          </p>
        )}
      </div>
    </Link>
  );
}

/* ── C2: plan de acción (tareas pendientes de los informes) ── */
function ActionsCard({ actions, t, onChange }) {
  const [busy, setBusy] = useState(null);
  const toggle = async (a) => {
    setBusy(a.id);
    await actionsApi.setDone(a.id, true);
    setBusy(null);
    onChange();
  };
  const pct = actions.total ? Math.round((actions.done / actions.total) * 100) : 0;
  return (
    <section className="card anim-enter p-4 md:p-5 lg:col-span-2" style={{ '--i': 3 }}>
      <div className="flex items-center justify-between gap-3 mb-3">
        <h2 className="text-sm font-semibold flex items-center gap-2" style={{ color: 'var(--text-primary)' }}><ListChecks size={16} /> {t('home.actionsTitle')}</h2>
        {actions.total > 0 && <span className="text-xs tabular" style={{ color: 'var(--text-muted)' }}>{t('report.progress').replace('{n}', actions.done).replace('{total}', actions.total)}</span>}
      </div>
      {actions.total === 0 ? (
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{t('home.actionsEmpty')}</p>
      ) : (
        <>
          <div className="h-1.5 rounded-full overflow-hidden mb-3" style={{ background: 'var(--surface-2)' }}>
            <div className="h-full rounded-full" style={{ width: `${pct}%`, background: 'var(--positive)', transition: 'width 600ms var(--ease-out)' }} />
          </div>
          {actions.next.length === 0 ? (
            <p className="text-sm" style={{ color: 'var(--positive)' }}>{t('home.actionsAllDone')}</p>
          ) : (
            <ul className="flex flex-col -mx-2">
              {actions.next.slice(0, 3).map(a => (
                <li key={a.id}>
                  <button onClick={() => toggle(a)} disabled={busy === a.id} className="nav-item w-full text-left flex items-start gap-3 rounded-lg px-2 py-2">
                    <span className="shrink-0 mt-0.5 w-5 h-5 rounded-md" style={{ border: '1.5px solid var(--border-strong)' }} />
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>{a.title}</span>
                      {a.analysis_title && <span className="block text-xs truncate" style={{ color: 'var(--text-muted)' }}>{a.analysis_title}</span>}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}

/* ── Núcleo de valor: impuestos, cobros, fugas y caja (V2-V5) ── */
function FinanceStrip({ dash, t, lang }) {
  const deadline = dash.next_deadline;
  if (!dash.ledger_count) {
    return (
      <Link to="/app/finanzas/libro" className="card card-interactive anim-enter p-4 md:p-5 flex items-center gap-4" style={{ '--i': 4, borderColor: 'var(--border-strong)' }}>
        <span className="w-11 h-11 rounded-xl grid place-items-center shrink-0" style={{ background: 'var(--accent)', color: 'var(--on-accent)' }}><Wallet size={20} /></span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{t('home.financeEmptyTitle')}</p>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>{t('home.financeEmptyDesc')}</p>
        </div>
        <ArrowRight size={16} className="shrink-0" style={{ color: 'var(--text-muted)' }} />
      </Link>
    );
  }
  const fc = dash.forecast;
  const cards = [
    { to: '/app/finanzas/impuestos', icon: Landmark, label: t('home.fTaxes').replace('{q}', `${dash.taxes.quarter}T`), value: eur(dash.taxes.total_estimated, lang),
      hint: dash.taxes.missing > 0 ? t('finance.taxes.missing').replace('{v}', eur(dash.taxes.missing, lang)) : t('finance.taxes.covered'), warn: dash.taxes.missing > 0 },
    { to: '/app/finanzas/cobros', icon: HandCoins, label: t('home.fReceivables'), value: eur(dash.receivables.total, lang),
      hint: dash.receivables.overdue_60 > 0 ? t('home.fOverdue').replace('{v}', eur(dash.receivables.overdue_60, lang)) : t('finance.receivables.invoices', { n: dash.receivables.count }), warn: dash.receivables.overdue_60 > 0 },
    { to: '/app/finanzas/fugas', icon: Droplets, label: t('home.fLeaks'), value: eur(dash.leaks.detected_this_month, lang),
      hint: t('home.fLeaksHint', { n: dash.leaks.alerts }) },
    fc
      ? { to: '/app/finanzas/prevision', icon: LineChart, label: t('home.fForecast'), value: eur(fc.at90, lang),
          hint: fc.first_below ? t('home.fBelow').replace('{date}', isoDate(fc.first_below.date, lang, { day: 'numeric', month: 'short' })) : t('home.fForecastOk'), warn: !!fc.first_below }
      : { to: '/app/finanzas/prevision', icon: LineChart, label: t('home.fForecast'), value: '—', hint: t('home.fForecastSetup') }
  ];
  return (
    <section className="anim-enter flex flex-col gap-3" style={{ '--i': 4 }}>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        {cards.map((c, i) => (
          <Link key={i} to={c.to} className="card card-interactive p-4 min-w-0">
            <div className="flex items-center gap-2 mb-2" style={{ color: 'var(--text-muted)' }}>
              <c.icon size={15} /><span className="text-xs font-medium uppercase tracking-wide truncate">{c.label}</span>
            </div>
            <p className="text-xl md:text-2xl font-semibold tabular truncate" style={{ color: 'var(--text-primary)' }}>{c.value}</p>
            <p className="text-xs mt-1 truncate flex items-center gap-1" style={{ color: c.warn ? 'var(--warning)' : 'var(--text-muted)' }}>
              {c.warn && <AlertTriangle size={12} className="shrink-0" />}{c.hint}
            </p>
          </Link>
        ))}
      </div>
      {deadline && (
        <Link to="/app/finanzas/calendario" className="inline-flex items-center gap-2 self-start rounded-full px-3 py-1.5 text-xs font-medium"
          style={{ background: 'var(--surface-1)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
          <CalendarDays size={13} style={{ color: 'var(--accent-text)' }} />
          {t('home.nextDeadline', { m: deadline.models.join(', '), n: deadline.days_left, date: isoDate(deadline.date, lang, { day: 'numeric', month: 'short' }) })}
        </Link>
      )}
    </section>
  );
}
