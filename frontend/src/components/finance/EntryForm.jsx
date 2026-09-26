import { useState } from 'react';
import { Loader2, AlertTriangle } from 'lucide-react';
import { useLang } from '../../context/LangContext';
import { Modal, Segmented, Field, ErrorBox } from '../ui';
import { todayIso } from '../../utils/money';

/**
 * Alta / edición de un apunte del libro (V1). La IA se equivoca: el usuario
 * revisa y corrige aquí. IVA, IRPF y total se recalculan al tocar la base o
 * los tipos (se pueden sobrescribir a mano). Aviso si base + IVA − IRPF ≠ total.
 */
export const CATEGORIES = [
  ['Ventas', 'sales'], ['Servicios profesionales', 'services'], ['Proveedores', 'suppliers'], ['Alquiler', 'rent'],
  ['Suministros', 'utilities'], ['Personal', 'staff'], ['Marketing', 'marketing'], ['Tecnología', 'tech'],
  ['Transporte', 'transport'], ['Otro', 'other']
];
export const categoryLabel = (t, value) => {
  const c = CATEGORIES.find(([v]) => v === value);
  return c ? t(`finance.categories.${c[1]}`) : (value || '—');
};

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

export function emptyEntry(type = 'expense') {
  return { type, invoice_date: todayIso(), due_date: '', party_name: '', party_nif: '', party_email: '', invoice_number: '', concept: '', category: '',
    base: '', vat_rate: 21, vat_amount: '', irpf_rate: 0, irpf_amount: '', total: '', paid: type === 'expense' };
}

export function checkOk(e) {
  return Math.abs(r2(e.base) + r2(e.vat_amount) - r2(e.irpf_amount) - r2(e.total)) <= 0.05;
}

export default function EntryForm({ initial, onSave, onClose, saving, error }) {
  const { t } = useLang();
  const [e, setE] = useState(() => ({ ...emptyEntry(), ...initial, due_date: initial?.due_date || '' }));
  const set = (k, v) => setE(prev => {
    const next = { ...prev, [k]: v };
    if (['base', 'vat_rate', 'irpf_rate'].includes(k)) {
      next.vat_amount = r2((Number(next.base) || 0) * (Number(next.vat_rate) || 0) / 100);
      next.irpf_amount = r2((Number(next.base) || 0) * (Number(next.irpf_rate) || 0) / 100);
      next.total = r2((Number(next.base) || 0) + next.vat_amount - next.irpf_amount);
    }
    return next;
  });
  const valid = e.invoice_date && (e.party_name || e.party_nif) && e.total !== '';
  const mismatch = e.total !== '' && !checkOk(e);

  const submit = (ev) => {
    ev.preventDefault();
    if (!valid) return;
    onSave({
      ...e,
      due_date: e.due_date || null,
      base: r2(e.base), vat_rate: r2(e.vat_rate), vat_amount: r2(e.vat_amount),
      irpf_rate: r2(e.irpf_rate), irpf_amount: r2(e.irpf_amount), total: r2(e.total)
    });
  };

  const input = (k, props = {}) => (
    <input id={`ef-${k}`} value={e[k] ?? ''} onChange={(ev) => set(k, ev.target.value)} className="input" {...props} />
  );

  return (
    <Modal title={initial?.id ? t('finance.editEntry') : t('finance.addEntry')} onClose={onClose} wide
      footer={<>
        <button type="button" onClick={onClose} className="btn btn-secondary">{t('common.cancel')}</button>
        <button type="submit" form="entry-form" disabled={!valid || saving} className="btn btn-primary">
          {saving && <Loader2 size={15} className="animate-spin" />} {t('common.save')}
        </button>
      </>}>
      <form id="entry-form" onSubmit={submit} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="sm:col-span-2">
          <Segmented value={e.type} onChange={(v) => set('type', v)} label={t('finance.type')} options={[
            { value: 'expense', label: t('finance.expense') }, { value: 'income', label: t('finance.income') }
          ]} />
        </div>
        <Field label={t('finance.date')} htmlFor="ef-invoice_date">{input('invoice_date', { type: 'date', required: true })}</Field>
        <Field label={t('finance.dueDate')} htmlFor="ef-due_date">{input('due_date', { type: 'date' })}</Field>
        <Field label={e.type === 'income' ? t('finance.client') : t('finance.supplier')} htmlFor="ef-party_name">{input('party_name', { maxLength: 160 })}</Field>
        <Field label={t('finance.nif')} htmlFor="ef-party_nif">{input('party_nif', { maxLength: 20, autoCapitalize: 'characters' })}</Field>
        {e.type === 'income' && (
          <Field label={t('finance.clientEmail')} htmlFor="ef-party_email" className="sm:col-span-2">
            {input('party_email', { type: 'email', maxLength: 160, autoComplete: 'off', placeholder: t('finance.clientEmailHint') })}
          </Field>
        )}
        <Field label={t('finance.invoiceNumber')} htmlFor="ef-invoice_number">{input('invoice_number', { maxLength: 60 })}</Field>
        <Field label={t('finance.category')} htmlFor="ef-category">
          <select id="ef-category" value={e.category} onChange={(ev) => set('category', ev.target.value)} className="input">
            <option value="">—</option>
            {CATEGORIES.map(([v, k]) => <option key={v} value={v}>{t(`finance.categories.${k}`)}</option>)}
          </select>
        </Field>
        <Field label={t('finance.concept')} htmlFor="ef-concept" className="sm:col-span-2">{input('concept', { maxLength: 200 })}</Field>
        <Field label={t('finance.base')} htmlFor="ef-base">{input('base', { type: 'number', step: '0.01', inputMode: 'decimal' })}</Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label={t('finance.vatRate')} htmlFor="ef-vat_rate">
            <select id="ef-vat_rate" value={e.vat_rate} onChange={(ev) => set('vat_rate', Number(ev.target.value))} className="input">
              {[21, 10, 4, 0].map(v => <option key={v} value={v}>{v} %</option>)}
            </select>
          </Field>
          <Field label={t('finance.vat')} htmlFor="ef-vat_amount">{input('vat_amount', { type: 'number', step: '0.01', inputMode: 'decimal' })}</Field>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Field label={t('finance.irpfRate')} htmlFor="ef-irpf_rate">
            <select id="ef-irpf_rate" value={e.irpf_rate} onChange={(ev) => set('irpf_rate', Number(ev.target.value))} className="input">
              {[0, 7, 15, 19].map(v => <option key={v} value={v}>{v} %</option>)}
            </select>
          </Field>
          <Field label={t('finance.irpf')} htmlFor="ef-irpf_amount">{input('irpf_amount', { type: 'number', step: '0.01', inputMode: 'decimal' })}</Field>
        </div>
        <Field label={t('finance.total')} htmlFor="ef-total">{input('total', { type: 'number', step: '0.01', inputMode: 'decimal', required: true })}</Field>
        <label className="flex items-center gap-2 text-sm sm:col-span-2" style={{ color: 'var(--text-secondary)' }}>
          <input type="checkbox" checked={!!e.paid} onChange={(ev) => set('paid', ev.target.checked)} className="w-4 h-4" />
          {e.type === 'income' ? t('finance.markCollected') : t('finance.markPaid')}
        </label>
        {mismatch && (
          <p className="sm:col-span-2 text-xs flex items-center gap-1.5" style={{ color: 'var(--warning)' }}><AlertTriangle size={13} /> {t('finance.totalMismatch')}</p>
        )}
        {error && <div className="sm:col-span-2"><ErrorBox>{error}</ErrorBox></div>}
      </form>
    </Modal>
  );
}
