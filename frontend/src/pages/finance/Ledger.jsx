import { useState, useEffect, useCallback, useMemo } from 'react';
import { useOutletContext } from 'react-router-dom';
import { Plus, Sparkles, Pencil, Trash2, AlertTriangle, BookOpen, Check, Search } from 'lucide-react';
import { ledgerApi } from '../../middleware/api';
import { apiErrorMessage, isConnectivityError } from '../../middleware/errors';
import { useLang } from '../../context/LangContext';
import { useToast } from '../../context/ToastContext';
import InvoiceImport from '../../components/finance/InvoiceImport';
import EntryForm, { emptyEntry, categoryLabel } from '../../components/finance/EntryForm';
import ExportMenu from '../../components/ExportMenu';
import EmptyState from '../../components/EmptyState';
import ErrorState from '../../components/ErrorState';
import Skeleton from '../../components/Skeleton';
import { Section, Kpi, Segmented, Badge } from '../../components/ui';
import { eur, isoDate, currentQuarter, quarterRange } from '../../utils/money';

/**
 * V1 — Libro de ingresos y gastos (sesión 4). Periodo por trimestre o año,
 * filtros, resumen (bases, IVA, resultado) y exportación trimestral para la
 * gestoría (CSV/Excel/ODS con las columnas habituales del libro registro).
 */
export default function Ledger() {
  const { profile } = useOutletContext();
  const { t, lang } = useLang();
  const toast = useToast();
  const cq = currentQuarter();
  const [year, setYear] = useState(cq.year);
  const [quarter, setQuarter] = useState(cq.quarter); // 0 = año completo
  const [type, setType] = useState('all');
  const [q, setQ] = useState('');
  const [entries, setEntries] = useState(null);
  const [failure, setFailure] = useState(null);
  const [importing, setImporting] = useState(false);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);

  const range = quarter ? quarterRange(year, quarter) : { from: `${year}-01-01`, to: `${year}-12-31` };
  const load = useCallback(async () => {
    setFailure(null);
    const res = await ledgerApi.list({ from: range.from, to: range.to });
    if (res.ok) setEntries(res.data.entries);
    else setFailure(res);
  }, [range.from, range.to]);
  useEffect(() => { setEntries(null); load(); }, [load]);

  const visible = useMemo(() => (entries || []).filter(e =>
    (type === 'all' || e.type === type)
    && (!q || `${e.party_name} ${e.invoice_number} ${e.concept}`.toLowerCase().includes(q.toLowerCase()))), [entries, type, q]);

  const totals = useMemo(() => {
    const s = { incomeBase: 0, expenseBase: 0, vatOut: 0, vatIn: 0, review: 0 };
    for (const e of entries || []) {
      if (e.type === 'income') { s.incomeBase += e.base; s.vatOut += e.vat_amount; } else { s.expenseBase += e.base; s.vatIn += e.vat_amount; }
      if (e.needs_review) s.review++;
    }
    return s;
  }, [entries]);

  const save = async (data) => {
    setSaving(true); setFormError(null);
    const res = data.id ? await ledgerApi.update(data.id, data) : await ledgerApi.create([data], false);
    setSaving(false);
    if (res.status === 409) { setFormError(t('finance.duplicateEntry')); return; }
    if (!res.ok) { setFormError(apiErrorMessage(t, res)); return; }
    setEditing(null);
    toast.success(t('config.saved'));
    load();
  };

  const remove = async (e) => {
    if (!window.confirm(t('finance.confirmDelete'))) return;
    const res = await ledgerApi.remove(e.id);
    if (res.ok) { setEntries(list => list.filter(x => x.id !== e.id)); toast.success(t('finance.deleted')); }
    else toast.error(apiErrorMessage(t, res));
  };

  const togglePaid = async (e) => {
    const res = await ledgerApi.update(e.id, { paid: !e.paid });
    if (res.ok) setEntries(list => list.map(x => (x.id === e.id ? res.data.entry : x)));
  };

  // Export para la gestoría: libro registro con columnas estándar.
  const exportTable = {
    name: t('finance.ledgerSheet'),
    columns: [
      ['invoice_date', t('finance.date')], ['type_label', t('finance.type')], ['invoice_number', t('finance.invoiceNumber')],
      ['party_name', t('finance.party')], ['party_nif', t('finance.nif')], ['concept', t('finance.concept')], ['category_label', t('finance.category')],
      ['base', t('finance.base')], ['vat_rate', t('finance.vatRate')], ['vat_amount', t('finance.vat')],
      ['irpf_rate', t('finance.irpfRate')], ['irpf_amount', t('finance.irpf')], ['total', t('finance.total')], ['paid_label', t('finance.paidCol')]
    ].map(([key, label]) => ({ key, label })),
    rows: (entries || []).slice().sort((a, b) => a.invoice_date.localeCompare(b.invoice_date)).map(e => ({
      ...e, type_label: e.type === 'income' ? t('finance.income') : t('finance.expense'),
      category_label: e.category ? categoryLabel(t, e.category) : '', paid_label: e.paid ? t('common.yes') : t('common.no')
    }))
  };
  const periodLabel = quarter ? `${quarter}T_${year}` : `${year}`;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col lg:flex-row lg:items-center gap-3 justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <select value={year} onChange={(e) => setYear(Number(e.target.value))} className="input !w-auto !h-9 text-sm" aria-label={t('finance.year')}>
            {[cq.year + 1, cq.year, cq.year - 1, cq.year - 2].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <Segmented value={quarter} onChange={setQuarter} size="sm" label={t('finance.quarter')}
            options={[{ value: 1, label: '1T' }, { value: 2, label: '2T' }, { value: 3, label: '3T' }, { value: 4, label: '4T' }, { value: 0, label: t('finance.fullYear') }]} />
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setImporting(true)} className="btn btn-primary btn-sm"><Sparkles size={14} /> {t('finance.readInvoices')}</button>
          <button onClick={() => { setFormError(null); setEditing(emptyEntry()); }} className="btn btn-secondary btn-sm"><Plus size={14} /> {t('finance.addEntry')}</button>
          <ExportMenu formats={['csv', 'xlsx', 'ods', 'pdf']} doc={{ title: `${t('finance.ledgerSheet')} ${periodLabel.replace('_', ' ')}`, fileBase: `libro_${periodLabel}`, tables: [exportTable] }} />
        </div>
      </div>

      {importing && <InvoiceImport profile={profile} onCancel={() => setImporting(false)} onSaved={() => { setImporting(false); load(); }} />}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
        <Kpi label={t('finance.incomeBase')} value={eur(totals.incomeBase, lang)} />
        <Kpi label={t('finance.expenseBase')} value={eur(totals.expenseBase, lang)} />
        <Kpi label={t(totals.vatOut - totals.vatIn < 0 ? 'finance.vatBalanceNeg' : 'finance.vatBalance')} value={eur(totals.vatOut - totals.vatIn, lang)} hint={`${eur(totals.vatOut, lang)} − ${eur(totals.vatIn, lang)}`} />
        <Kpi label={t('finance.result')} value={eur(totals.incomeBase - totals.expenseBase, lang)}
          tone={totals.incomeBase - totals.expenseBase >= 0 ? 'var(--positive)' : 'var(--negative)'} />
      </div>

      {failure ? (
        <ErrorState offline={isConnectivityError(failure)} message={apiErrorMessage(t, failure)} onRetry={load} />
      ) : entries === null ? (
        <div className="card p-4 flex flex-col gap-3" aria-busy="true">{[0, 1, 2, 3].map(i => <Skeleton key={i} className="h-10" />)}</div>
      ) : entries.length === 0 && !importing ? (
        <EmptyState icon={BookOpen} title={t('finance.emptyTitle')} description={t('finance.emptyDesc')}>
          <button onClick={() => setImporting(true)} className="btn btn-primary"><Sparkles size={16} /> {t('finance.readInvoices')}</button>
          <button onClick={() => setEditing(emptyEntry())} className="btn btn-secondary"><Plus size={16} /> {t('finance.addEntry')}</button>
        </EmptyState>
      ) : entries.length > 0 && (
        <Section aside={
          <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
            <div className="relative">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--text-muted)' }} />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('finance.search')} aria-label={t('finance.search')} className="input !h-8 !pl-8 text-sm sm:!w-56" />
            </div>
            <Segmented value={type} onChange={setType} size="sm" options={[
              { value: 'all', label: t('history.filterAll') }, { value: 'income', label: t('finance.incomes') }, { value: 'expense', label: t('finance.expenses') }
            ]} />
          </div>}>
          {totals.review > 0 && (
            <p className="text-xs mb-3 flex items-center gap-1.5" style={{ color: 'var(--warning)' }}><AlertTriangle size={13} /> {t('finance.reviewCount', { n: totals.review })}</p>
          )}
          <ul className="flex flex-col -mx-2">
            {visible.map(e => (
              <li key={e.id} className="flex items-center gap-3 rounded-lg px-2 py-2.5" style={{ borderTop: '1px solid var(--border)' }}>
                <span className="shrink-0 w-2 h-9 rounded-full" style={{ background: e.type === 'income' ? 'var(--positive)' : 'var(--text-muted)' }} aria-hidden="true" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
                    {e.party_name || e.party_nif || '—'}
                    {e.needs_review && <AlertTriangle size={13} style={{ color: 'var(--warning)' }} aria-label={t('finance.totalMismatch')} />}
                  </p>
                  <p className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>
                    {isoDate(e.invoice_date, lang)}{e.invoice_number ? ` · ${e.invoice_number}` : ''}{e.category ? ` · ${categoryLabel(t, e.category)}` : ''}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-semibold tabular" style={{ color: e.type === 'income' ? 'var(--positive)' : 'var(--text-primary)' }}>
                    {e.type === 'income' ? '+' : '−'}{eur(e.total, lang)}
                  </p>
                  <p className="text-[11px] tabular" style={{ color: 'var(--text-muted)' }}>{t('finance.vat')} {eur(e.vat_amount, lang)}</p>
                </div>
                <button onClick={() => togglePaid(e)} className="shrink-0 hidden sm:inline-flex" title={e.type === 'income' ? t('finance.markCollected') : t('finance.markPaid')}>
                  {e.paid ? <Badge tone="positive"><Check size={11} /> {e.type === 'income' ? t('finance.collected') : t('finance.paid')}</Badge>
                    : <Badge tone={e.type === 'income' ? 'warning' : 'muted'}>{e.type === 'income' ? t('finance.pendingCollection') : t('finance.pendingPayment')}</Badge>}
                </button>
                <button onClick={() => { setFormError(null); setEditing(e); }} className="btn btn-ghost btn-sm !px-2" aria-label={t('finance.editEntry')}><Pencil size={14} /></button>
                <button onClick={() => remove(e)} className="btn btn-ghost btn-sm !px-2" aria-label={t('finance.delete')}><Trash2 size={14} /></button>
              </li>
            ))}
          </ul>
          {visible.length === 0 && <p className="text-sm py-6 text-center" style={{ color: 'var(--text-secondary)' }}>{t('history.noResults')}</p>}
        </Section>
      )}

      {editing && <EntryForm initial={editing} saving={saving} error={formError} onClose={() => setEditing(null)} onSave={save} />}
    </div>
  );
}
