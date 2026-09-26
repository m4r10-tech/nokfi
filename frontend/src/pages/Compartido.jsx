import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Eye, Loader2, Link2Off } from 'lucide-react';
import { useLang } from '../context/LangContext';
import { shareApi } from '../middleware/api';
import { usePageMeta } from '../hooks/usePageMeta';
import { PublicHeader, PublicFooter } from '../components/PublicChrome';
import { Section, Kpi } from '../components/ui';
import ExportMenu from '../components/ExportMenu';
import { categoryLabel } from '../components/finance/EntryForm';
import { eur, isoDate } from '../utils/money';

/**
 * Vista de solo lectura para la gestoría (sesión 4). El usuario crea el
 * enlace en Configuración; quien lo abre ve, sin cuenta, el libro del año,
 * las estimaciones 303/130 por trimestre y puede descargarlo en CSV/Excel/PDF.
 * Caduca y se puede revocar. No se indexa (noindex aquí y X-Robots-Tag en la API).
 */
export default function Compartido() {
  const { token } = useParams();
  const { t, lang } = useLang();
  const [year, setYear] = useState(null);
  const [data, setData] = useState(null);
  const [failed, setFailed] = useState(false);
  usePageMeta(t('share.metaTitle'));

  useEffect(() => {
    const meta = document.createElement('meta');
    meta.name = 'robots'; meta.content = 'noindex, nofollow';
    document.head.appendChild(meta);
    return () => meta.remove();
  }, []);

  useEffect(() => {
    let alive = true;
    shareApi.view(token, year || undefined).then(res => {
      if (!alive) return;
      if (res.ok) { setData(res.data); setFailed(false); } else setFailed(true);
    });
    return () => { alive = false; };
  }, [token, year]);

  const entries = data?.entries || [];
  const income = entries.filter(e => e.type === 'income').reduce((s, e) => s + e.base, 0);
  const expense = entries.filter(e => e.type === 'expense').reduce((s, e) => s + e.base, 0);
  const exportTable = {
    name: t('finance.ledgerSheet'),
    columns: [
      ['invoice_date', t('finance.date')], ['type_label', t('finance.type')], ['invoice_number', t('finance.invoiceNumber')],
      ['party_name', t('finance.party')], ['party_nif', t('finance.nif')], ['concept', t('finance.concept')], ['category_label', t('finance.category')],
      ['base', t('finance.base')], ['vat_rate', t('finance.vatRate')], ['vat_amount', t('finance.vat')],
      ['irpf_rate', t('finance.irpfRate')], ['irpf_amount', t('finance.irpf')], ['total', t('finance.total')], ['paid_label', t('finance.paidCol')]
    ].map(([key, label]) => ({ key, label })),
    rows: entries.slice().sort((a, b) => a.invoice_date.localeCompare(b.invoice_date)).map(e => ({
      ...e, type_label: e.type === 'income' ? t('finance.income') : t('finance.expense'),
      category_label: e.category ? categoryLabel(t, e.category) : '', paid_label: e.paid ? t('common.yes') : t('common.no')
    }))
  };

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--bg-base)' }}>
      <PublicHeader />
      <main className="flex-1 w-full max-w-5xl mx-auto px-4 py-8 md:py-12 flex flex-col gap-5">
        {failed ? (
          <div className="card p-8 text-center flex flex-col items-center gap-3">
            <Link2Off size={28} style={{ color: 'var(--text-muted)' }} />
            <h1 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>{t('share.invalidTitle')}</h1>
            <p className="text-sm max-w-md" style={{ color: 'var(--text-secondary)' }}>{t('share.invalidDesc')}</p>
          </div>
        ) : !data ? (
          <p className="text-sm flex items-center gap-2" style={{ color: 'var(--text-secondary)' }}><Loader2 size={15} className="animate-spin" /> {t('common.loading')}</p>
        ) : (
          <>
            <header className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] mb-1.5 inline-flex items-center gap-1.5" style={{ color: 'var(--accent-text)' }}>
                  <Eye size={13} /> {t('share.readOnly')}
                </p>
                <h1 className="text-2xl font-semibold tracking-tight truncate" style={{ color: 'var(--text-primary)' }}>{data.company.name || '—'}</h1>
                <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
                  {[data.company.tax_id, data.company.legal_form && t(data.company.legal_form === 'sociedad' ? 'config.legalSociedad' : 'config.legalAutonomo')].filter(Boolean).join(' · ')}
                </p>
                <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>{t('share.expires', { date: isoDate(data.expires_at.slice(0, 10), lang) })}</p>
              </div>
              <div className="flex items-center gap-2">
                <select value={data.year} onChange={(e) => setYear(Number(e.target.value))} className="input !w-auto !h-9 text-sm" aria-label={t('finance.year')}>
                  {data.years.map(y => <option key={y} value={y}>{y}</option>)}
                </select>
                <ExportMenu formats={['csv', 'xlsx', 'pdf']} doc={{ title: `${data.company.name} · ${t('finance.ledgerSheet')} ${data.year}`, fileBase: `libro_${data.year}`, tables: [exportTable] }} />
              </div>
            </header>

            <div className="grid grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-3">
              <Kpi label={t('finance.incomeBase')} value={eur(income, lang)} />
              <Kpi label={t('finance.expenseBase')} value={eur(expense, lang)} />
              <Kpi className="col-span-2 lg:col-span-1" label={t('share.invoices')} value={String(entries.length)} />
            </div>

            <Section title={t('share.taxesTitle')}>
              <div className="overflow-x-auto -mx-1">
                <table className="w-full text-sm tabular">
                  <thead><tr style={{ color: 'var(--text-muted)' }} className="text-xs text-left">
                    <th className="p-2 font-medium">{t('finance.quarter')}</th>
                    <th className="p-2 font-medium text-right">{t('finance.taxes.vatOutput')}</th>
                    <th className="p-2 font-medium text-right">{t('finance.taxes.vatInput')}</th>
                    <th className="p-2 font-medium text-right">303</th>
                    {data.company.legal_form !== 'sociedad' && <th className="p-2 font-medium text-right">130</th>}
                    <th className="p-2 font-medium text-right">{t('share.due')}</th>
                  </tr></thead>
                  <tbody>
                    {data.quarters.map(q => (
                      <tr key={q.quarter} style={{ borderTop: '1px solid var(--border)', color: 'var(--text-primary)' }}>
                        <td className="p-2">{q.quarter}T</td>
                        <td className="p-2 text-right">{eur(q.vat.output, lang)}</td>
                        <td className="p-2 text-right">{eur(q.vat.input, lang)}</td>
                        <td className="p-2 text-right font-medium">{eur(q.vat.result, lang)}</td>
                        {data.company.legal_form !== 'sociedad' && <td className="p-2 text-right font-medium">{q.irpf130 ? eur(q.irpf130.result, lang) : '—'}</td>}
                        <td className="p-2 text-right" style={{ color: 'var(--text-secondary)' }}>{isoDate(q.due_date, lang)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-xs mt-2" style={{ color: 'var(--text-muted)' }}>{t('share.estimateNote')}</p>
            </Section>

            <Section title={`${t('finance.ledgerSheet')} ${data.year}`}>
              {entries.length === 0 ? (
                <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{t('share.empty')}</p>
              ) : (
                <div className="overflow-x-auto -mx-1">
                  <table className="w-full text-sm tabular">
                    <thead><tr style={{ color: 'var(--text-muted)' }} className="text-xs text-left">
                      <th className="p-2 font-medium">{t('finance.date')}</th>
                      <th className="p-2 font-medium">{t('finance.invoiceNumber')}</th>
                      <th className="p-2 font-medium">{t('finance.party')}</th>
                      <th className="p-2 font-medium text-right">{t('finance.base')}</th>
                      <th className="p-2 font-medium text-right">{t('finance.vat')}</th>
                      <th className="p-2 font-medium text-right">{t('finance.irpf')}</th>
                      <th className="p-2 font-medium text-right">{t('finance.total')}</th>
                    </tr></thead>
                    <tbody>
                      {exportTable.rows.map((e, i) => (
                        <tr key={i} style={{ borderTop: '1px solid var(--border)', color: 'var(--text-primary)' }}>
                          <td className="p-2 whitespace-nowrap">{isoDate(e.invoice_date, lang)}</td>
                          <td className="p-2 whitespace-nowrap">{e.invoice_number || '—'}</td>
                          <td className="p-2 min-w-[160px]">
                            <span className="block truncate max-w-[260px]">{e.party_name || e.party_nif || '—'}</span>
                            <span className="text-xs" style={{ color: e.type === 'income' ? 'var(--positive)' : 'var(--text-muted)' }}>{e.type_label}</span>
                          </td>
                          <td className="p-2 text-right">{eur(e.base, lang)}</td>
                          <td className="p-2 text-right">{eur(e.vat_amount, lang)}</td>
                          <td className="p-2 text-right">{e.irpf_amount ? eur(e.irpf_amount, lang) : '—'}</td>
                          <td className="p-2 text-right font-medium">{eur(e.total, lang)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Section>
          </>
        )}
      </main>
      <PublicFooter />
    </div>
  );
}
