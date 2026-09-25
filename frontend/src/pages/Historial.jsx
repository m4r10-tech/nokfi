import { useState, useEffect, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { History, ClipboardList, FileSpreadsheet, Sparkles, Search, ChevronRight } from 'lucide-react';
import { analysesApi } from '../middleware/api';
import { apiErrorMessage, isConnectivityError } from '../middleware/errors';
import { useLang } from '../context/LangContext';
import PageHeader from '../components/PageHeader';
import EmptyState from '../components/EmptyState';
import ErrorState from '../components/ErrorState';
import Skeleton from '../components/Skeleton';
import { parseDbDate, dayDiff, formatDate, formatTime } from '../utils/dates';

/**
 * Historial de análisis (sección 14) — sesión 3, Tanda N: Historial e Informes
 * eran la MISMA pantalla y se fusionaron aquí (/app/informes redirige). Lista
 * ligera (GET /api/analyses, sin result_html), con filtro por tipo, búsqueda
 * por título y agrupación por fecha. El detalle es una ruta propia
 * (/app/historial/:id → HistorialDetalle) para que el "atrás" del navegador y
 * los enlaces directos funcionen.
 */
export const KIND_ICON = { cuestionario: ClipboardList, excel: FileSpreadsheet };

export function kindLabel(kind, t) {
  if (kind === 'cuestionario') return t('history.typeCuestionario');
  if (kind === 'excel') return t('history.typeExcel');
  return t('history.typeAnalysis');
}

export default function Historial() {
  const { t, lang } = useLang();
  const [items, setItems] = useState(null); // null = cargando
  const [failure, setFailure] = useState(null); // resultado fallido de la API
  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');

  const load = useCallback(async () => {
    setFailure(null);
    setItems(null);
    const res = await analysesApi.list();
    if (res.ok) setItems(res.data.analyses || []);
    else { setFailure(res); setItems([]); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const counts = useMemo(() => {
    const c = { all: 0, cuestionario: 0, excel: 0 };
    (items || []).forEach(a => { c.all++; if (c[a.kind] != null) c[a.kind]++; });
    return c;
  }, [items]);

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = (items || []).filter(a =>
      (filter === 'all' || a.kind === filter) && (!q || (a.title || '').toLowerCase().includes(q)));
    return groupByDate(list, t, lang);
  }, [items, filter, query, t, lang]);

  const header = <PageHeader title={t('history.title')} description={t('history.subtitle')} />;

  if (failure) {
    return (
      <div className="max-w-4xl">
        {header}
        <ErrorState offline={isConnectivityError(failure)} message={apiErrorMessage(t, failure, 'history.loadError')} onRetry={load} />
      </div>
    );
  }

  if (items === null) {
    return (
      <div className="max-w-4xl" aria-busy="true" aria-label={t('history.loading')}>
        {header}
        <div className="flex gap-2 mb-5"><Skeleton className="h-10 flex-1 max-w-sm" /><Skeleton className="h-10 w-48 hidden sm:block" /></div>
        <Skeleton className="h-3 w-16 mb-3" />
        <div className="flex flex-col gap-2">{[0, 1, 2, 3, 4].map(i => <RowSkeleton key={i} />)}</div>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="max-w-4xl">
        {header}
        <EmptyState icon={History} title={t('history.emptyTitle')} description={t('history.emptyDesc')}>
          <Link to="/app/cuestionario" className="btn btn-primary"><ClipboardList size={16} /> {t('history.emptyCta')}</Link>
          <Link to="/app/excel" className="btn btn-secondary"><FileSpreadsheet size={16} /> {t('history.emptyCtaExcel')}</Link>
        </EmptyState>
      </div>
    );
  }

  const FILTERS = [
    { id: 'all', label: t('history.filterAll') },
    { id: 'cuestionario', label: t('history.typeCuestionario') },
    { id: 'excel', label: t('history.typeExcel') }
  ];

  return (
    <div className="max-w-4xl">
      {header}

      <div className="flex flex-col sm:flex-row gap-2 mb-6">
        <div className="relative flex-1 sm:max-w-sm">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--text-muted)' }} />
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)}
            placeholder={t('history.searchPlaceholder')} aria-label={t('history.searchPlaceholder')}
            className="input !pl-9" />
        </div>
        <div role="tablist" className="flex gap-1 rounded-xl p-1 self-start" style={{ background: 'var(--surface-1)', border: '1px solid var(--border)' }}>
          {FILTERS.map(f => (
            <button key={f.id} role="tab" aria-selected={filter === f.id} onClick={() => setFilter(f.id)}
              className="rounded-lg px-3 h-8 text-sm font-medium transition-colors flex items-center gap-1.5"
              style={filter === f.id
                ? { background: 'var(--surface-2)', color: 'var(--text-primary)', boxShadow: '0 0 0 1px var(--border-strong)' }
                : { color: 'var(--text-secondary)' }}>
              {f.label}
              <span className="text-xs tabular" style={{ color: 'var(--text-muted)' }}>{counts[f.id]}</span>
            </button>
          ))}
        </div>
      </div>

      {groups.length === 0 ? (
        <p className="text-sm py-10 text-center anim-fade" style={{ color: 'var(--text-secondary)' }}>{t('history.noResults')}</p>
      ) : (
        <div className="flex flex-col gap-6">
          {groups.map((g, gi) => (
            <section key={g.label}>
              <h2 className="text-xs font-medium uppercase tracking-wide mb-2" style={{ color: 'var(--text-muted)' }}>{g.label}</h2>
              <div className="flex flex-col gap-2">
                {g.items.map((a, i) => <Row key={a.id} a={a} t={t} lang={lang} showTime={g.recent} i={Math.min(gi * 3 + i, 10)} />)}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function Row({ a, t, lang, showTime, i }) {
  const Icon = KIND_ICON[a.kind] || Sparkles;
  const d = parseDbDate(a.created_at);
  return (
    <Link to={`/app/historial/${a.id}`} className="card card-interactive anim-enter p-3.5 md:p-4 flex items-center gap-3"
      style={{ '--i': i }}>
      <span className="shrink-0 w-10 h-10 rounded-xl grid place-items-center" style={{ background: 'var(--surface-2)', color: 'var(--text-secondary)' }}>
        <Icon size={18} />
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>{a.title}</p>
        <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
          {kindLabel(a.kind, t)} · {d ? (showTime ? formatTime(d, lang) : formatDate(a.created_at, lang)) : '—'}
        </p>
      </div>
      <ChevronRight size={16} className="shrink-0" style={{ color: 'var(--text-muted)' }} />
    </Link>
  );
}

function RowSkeleton() {
  return (
    <div className="card p-4 flex items-center gap-3">
      <Skeleton className="w-10 h-10 !rounded-xl shrink-0" />
      <div className="flex-1"><Skeleton className="h-3.5 w-1/2 mb-2" /><Skeleton className="h-3 w-28" /></div>
    </div>
  );
}

/** Agrupa (ya ordenados desc por el backend) en Hoy / Ayer / Últimos 7 días / por mes. */
function groupByDate(list, t, lang) {
  const now = new Date();
  const out = [];
  const push = (label, a, recent) => {
    const last = out[out.length - 1];
    if (last && last.label === label) last.items.push(a);
    else out.push({ label, items: [a], recent });
  };
  for (const a of list) {
    const d = parseDbDate(a.created_at);
    if (!d) { push('—', a, false); continue; }
    const diff = dayDiff(d, now);
    if (diff <= 0) push(t('history.groupToday'), a, true);
    else if (diff === 1) push(t('history.groupYesterday'), a, true);
    else if (diff < 7) push(t('history.groupWeek'), a, false);
    else {
      const m = d.toLocaleDateString(lang === 'en' ? 'en-GB' : 'es-ES', { month: 'long', year: 'numeric' });
      push(m.charAt(0).toUpperCase() + m.slice(1), a, false);
    }
  }
  return out;
}
