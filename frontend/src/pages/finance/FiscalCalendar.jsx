import { useState, useEffect, useCallback } from 'react';
import { useOutletContext } from 'react-router-dom';
import { CalendarDays, BellRing, Info } from 'lucide-react';
import { financeApi } from '../../middleware/api';
import { apiErrorMessage, isConnectivityError } from '../../middleware/errors';
import { useLang } from '../../context/LangContext';
import ErrorState from '../../components/ErrorState';
import Skeleton from '../../components/Skeleton';
import { Section, Segmented, Notice, Badge } from '../../components/ui';
import { isoDate } from '../../utils/money';

/**
 * C4 — Calendario fiscal con avisos (sesión 4). Plazos de autónomos y pymes
 * en España (303, 130, 111, 115, 390, 347, 100, 200, 202…) con aviso por email
 * 7 días y 1 día antes (opcional). Fechas orientativas: se verifican cada año
 * y no incluyen festivos — no sustituye a la gestoría.
 */
export default function FiscalCalendar() {
  const { profile, updateProfile } = useOutletContext();
  const { t, lang } = useLang();
  const [year, setYear] = useState(new Date().getFullYear());
  const [data, setData] = useState(null);
  const [failure, setFailure] = useState(null);

  const load = useCallback(async () => {
    setFailure(null);
    const res = await financeApi.calendar(year);
    if (res.ok) setData(res.data); else setFailure(res);
  }, [year]);
  useEffect(() => { load(); }, [load, profile.legalForm]);

  if (failure) return <ErrorState offline={isConnectivityError(failure)} message={apiErrorMessage(t, failure)} onRetry={load} />;
  if (!data) return <div className="grid gap-3"><Skeleton className="h-20" /><Skeleton className="h-64" /></div>;

  const next = data.upcoming[0];
  const byMonth = data.deadlines.reduce((acc, d) => {
    const m = d.date.slice(0, 7);
    (acc[m] = acc[m] || []).push(d);
    return acc;
  }, {});

  return (
    <div className="flex flex-col gap-4">
      <div className="grid md:grid-cols-2 gap-4">
        <Section title={t('finance.calendar.next')}>
          {next ? (
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-2xl flex flex-col items-center justify-center shrink-0" style={{ background: 'var(--accent-soft)', color: 'var(--accent-text)' }}>
                <span className="text-2xl font-semibold tabular leading-none">{next.days_left}</span>
                <span className="text-[10px] uppercase tracking-wide mt-1">{t('finance.calendar.daysShort', { n: next.days_left })}</span>
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{t('finance.calendar.models').replace('{m}', next.models.join(', '))} · {next.period}</p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>{t(`finance.calendar.kind_${next.kind}`)}</p>
                <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>{isoDate(next.date, lang, { weekday: 'long', day: 'numeric', month: 'long' })}</p>
              </div>
            </div>
          ) : <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>—</p>}
        </Section>
        <Section title={t('finance.calendar.settings')}>
          <div className="flex flex-col gap-3">
            <div>
              <p className="field-label">{t('config.legalForm')}</p>
              <Segmented value={profile.legalForm || ''} onChange={(v) => updateProfile({ legalForm: v })} size="sm" options={[
                { value: 'autonomo', label: t('config.legalAutonomo') }, { value: 'sociedad', label: t('config.legalSociedad') }, { value: '', label: t('finance.calendar.all') }
              ]} />
            </div>
            <label className="flex items-start gap-2.5 text-sm cursor-pointer" style={{ color: 'var(--text-primary)' }}>
              <input type="checkbox" checked={!!profile.fiscalReminders} onChange={(e) => updateProfile({ fiscalReminders: e.target.checked })} className="w-4 h-4 mt-0.5" />
              <span><span className="font-medium flex items-center gap-1.5"><BellRing size={14} /> {t('finance.calendar.remind')}</span>
                <span className="block text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{t('finance.calendar.remindHint')}</span></span>
            </label>
          </div>
        </Section>
      </div>

      <Section title={t('finance.calendar.yearTitle').replace('{y}', year)} aside={
        <Segmented value={year} onChange={setYear} size="sm" options={[year - 1, new Date().getFullYear(), new Date().getFullYear() + 1].filter((v, i, a) => a.indexOf(v) === i).map(y => ({ value: y, label: String(y) }))} />
      }>
        <div className="flex flex-col gap-5">
          {Object.entries(byMonth).map(([m, list]) => (
            <div key={m}>
              <p className="text-xs font-medium uppercase tracking-wide mb-2 first-letter:uppercase" style={{ color: 'var(--text-muted)' }}>
                {isoDate(`${m}-01`, lang, { month: 'long', year: 'numeric' })}
              </p>
              <ul className="flex flex-col gap-1.5">
                {list.map(d => {
                  const past = d.date < new Date().toISOString().slice(0, 10);
                  return (
                    <li key={d.key} className="flex items-center gap-3 rounded-xl px-3 py-2.5" style={{ background: 'var(--surface-2)', opacity: past ? 0.55 : 1 }}>
                      <CalendarDays size={15} className="shrink-0" style={{ color: 'var(--accent-text)' }} />
                      <span className="text-sm tabular w-16 shrink-0" style={{ color: 'var(--text-primary)' }}>{isoDate(d.date, lang, { day: 'numeric', month: 'short' })}</span>
                      <span className="flex-1 min-w-0">
                        <span className="block text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{t('finance.calendar.models').replace('{m}', d.models.join(', '))} · {d.period}</span>
                        <span className="block text-xs truncate" style={{ color: 'var(--text-secondary)' }}>{t(`finance.calendar.kind_${d.kind}`)}</span>
                      </span>
                      {d.conditional && <Badge tone="muted">{t('finance.calendar.ifApplies')}</Badge>}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      </Section>
      <Notice icon={Info}>{t('finance.calendar.legal')}</Notice>
    </div>
  );
}
