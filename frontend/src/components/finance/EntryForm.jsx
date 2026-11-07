import { useState } from 'react';
import { Loader2, AlertTriangle, Trash2 } from 'lucide-react';
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
  ['Seguros', 'insurance'], ['Transporte', 'transport'], ['Otro', 'other']
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

// Gastos: pagados el día de la factura; ingresos: cobrados hoy (siempre se puede cambiar).
function defaultPaidAt(e) {
  return e.type === 'expense' && e.invoice_date ? e.invoice_date : todayIso();
}

/**
 * S15b F5: al marcar una factura como cobrada (o pagada) se pide la fecha, que
 * cuenta para los días medios de cobro y la previsión.
 */
export function PaidDateModal({ entry, onConfirm, onClose, busy, error }) {
  const { t } = useLang();
  const income = entry.type === 'income';
  const [date, setDate] = useState(todayIso() < entry.invoice_date ? entry.invoice_date : todayIso());
  return (
    <Modal title={t('finance.collectTitle', { name: entry.party_name || entry.party_nif || entry.invoice_number || '—' })} onClose={onClose} footer={<>
      <button type="button" onClick={onClose} className="btn btn-ghost">{t('common.cancel')}</button>
      <button type="submit" form="paid-date-form" disabled={busy || !date} className="btn btn-primary">
        {busy && <Loader2 size={15} className="animate-spin" />} {income ? t('finance.markCollected') : t('finance.markPaid')}
      </button>
    </>}>
      <form id="paid-date-form" onSubmit={(ev) => { ev.preventDefault(); if (date) onConfirm(date); }} className="flex flex-col gap-3">
        {income && <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{t('finance.collectText')}</p>}
        <Field label={income ? t('finance.paidAtIncome') : t('finance.paidAtExpense')} htmlFor="pd-date">
          <input id="pd-date" type="date" value={date} min={entry.invoice_date} max={todayIso()} onChange={(ev) => setDate(ev.target.value)} className="input" required autoFocus />
        </Field>
        {error && <ErrorBox>{error}</ErrorBox>}
      </form>
    </Modal>
  );
}

export function checkOk(e) {
  return Math.abs(r2(e.base) + r2(e.vat_amount) - r2(e.irpf_amount) - r2(e.total)) <= 0.05;
}

export default function EntryForm({ initial, onSave, onClose, onDelete, saving, error }) {
  const { t } = useLang();
  const [e, setE] = useState(() => {
    const base = { ...emptyEntry(), ...initial, due_date: initial?.due_date || '' };
    return { ...base, paid_at: base.paid_at ? String(base.paid_at).slice(0, 10) : (base.paid ? defaultPaidAt(base) : '') };
  });
  const set = (k, v) => setE(prev => {
    const next = { ...prev, [k]: v };
    // Al cambiar el tipo en un apunte nuevo: gastos pagados, ingresos pendientes de cobro (V4).
    if (k === 'type' && !initial?.id) { next.paid = v === 'expense'; next.paid_at = next.paid ? defaultPaidAt(next) : ''; }
    // S15b F5: la fecha de cobro/pago se elige (antes era siempre hoy).
    if (k === 'paid') next.paid_at = v ? (prev.paid_at || defaultPaidAt(next)) : '';
    if (k === 'invoice_date' && next.paid_at && v && next.paid_at < v) next.paid_at = v;
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
      paid_at: e.paid ? (e.paid_at || defaultPaidAt(e)) : null,
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
        {/* Sesión 10: en móvil la fila del libro no lleva papelera; se borra desde aquí. */}
        {onDelete && initial?.id && (
          <button type="button" onClick={onDelete} className="btn btn-ghost sm:mr-auto" style={{ color: 'var(--negative)' }}>
            <Trash2 size={15} /> {t('finance.delete')}
          </button>
        )}
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
          {/* S15b L1: la retención siempre en positivo (resta del total). */}
          <Field label={t('finance.irpf')} htmlFor="ef-irpf_amount">{input('irpf_amount', { type: 'number', step: '0.01', min: '0', inputMode: 'decimal' })}</Field>
        </div>
        <Field label={t('finance.total')} htmlFor="ef-total">{input('total', { type: 'number', step: '0.01', inputMode: 'decimal', required: true })}</Field>
        <label className="flex items-center gap-2 text-sm sm:col-span-2" style={{ color: 'var(--text-secondary)' }}>
          <input type="checkbox" checked={!!e.paid} onChange={(ev) => set('paid', ev.target.checked)} className="w-4 h-4" />
          {e.type === 'income' ? t('finance.markCollected') : t('finance.markPaid')}
        </label>
        {!!e.paid && (
          <Field label={e.type === 'income' ? t('finance.paidAtIncome') : t('finance.paidAtExpense')} htmlFor="ef-paid_at">
            {input('paid_at', { type: 'date', required: true, min: e.invoice_date || undefined, max: todayIso() })}
          </Field>
        )}
        {mismatch && (
          <p className="sm:col-span-2 text-xs flex items-center gap-1.5" style={{ color: 'var(--warning)' }}><AlertTriangle size={13} /> {t('finance.totalMismatch')}</p>
        )}
        {error && <div className="sm:col-span-2"><ErrorBox>{error}</ErrorBox></div>}
      </form>
    </Modal>
  );
}
