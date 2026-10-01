import { useState, useEffect, useCallback } from 'react';
import { Plus, Pencil, Trash2, Loader2, Search, Users } from 'lucide-react';
import { invoicingApi } from '../../middleware/api';
import { useLang } from '../../context/LangContext';
import { useToast } from '../../context/ToastContext';
import { Modal, ErrorBox } from '../ui';
import Skeleton from '../Skeleton';
import CustomerForm, { emptyCustomer } from './CustomerForm';
import { invoiceError } from './invoiceUtils';

/** Sesión 11: libreta de clientes (alta, edición y borrado). */
export default function Customers({ onClose }) {
  const { t } = useLang();
  const toast = useToast();
  const [list, setList] = useState(null);
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState(null);
  const [confirmId, setConfirmId] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    const res = await invoicingApi.customers();
    if (res.ok) setList(res.data.customers);
    else setError(invoiceError(t, res));
  }, [t]);
  useEffect(() => { load(); }, [load]);

  const save = async (e) => {
    e.preventDefault();
    setBusy(true); setError(null);
    const res = editing.id ? await invoicingApi.updateCustomer(editing.id, editing) : await invoicingApi.createCustomer(editing);
    setBusy(false);
    if (!res.ok) { setError(invoiceError(t, res)); return; }
    toast.success(t('config.saved'));
    setEditing(null);
    load();
  };

  const remove = async (id) => {
    setBusy(true);
    const res = await invoicingApi.removeCustomer(id);
    setBusy(false); setConfirmId(null);
    if (res.ok) { setList(l => l.filter(c => c.id !== id)); toast.success(t('finance.deleted')); }
    else toast.error(invoiceError(t, res));
  };

  if (editing) {
    return (
      <Modal title={editing.id ? t('invoices.editCustomer') : t('invoices.newCustomer')} onClose={() => setEditing(null)} wide footer={<>
        <button type="button" onClick={() => setEditing(null)} className="btn btn-secondary">{t('common.cancel')}</button>
        <button type="submit" form="customer-form" disabled={busy || !editing.name?.trim()} className="btn btn-primary">
          {busy && <Loader2 size={15} className="animate-spin" />} {t('common.save')}
        </button>
      </>}>
        <form id="customer-form" onSubmit={save} className="flex flex-col gap-3">
          <CustomerForm value={editing} onChange={setEditing} />
          {error && <ErrorBox>{error}</ErrorBox>}
        </form>
      </Modal>
    );
  }

  const visible = (list || []).filter(c => !q || `${c.name} ${c.tax_id} ${c.email}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <Modal title={t('invoices.customers')} onClose={onClose} wide footer={
      <button type="button" onClick={() => { setError(null); setEditing(emptyCustomer()); }} className="btn btn-primary"><Plus size={15} /> {t('invoices.newCustomer')}</button>
    }>
      {error && <ErrorBox>{error}</ErrorBox>}
      {list === null ? (
        <div className="flex flex-col gap-3">{[0, 1, 2].map(i => <Skeleton key={i} className="h-10" />)}</div>
      ) : list.length === 0 ? (
        <div className="py-8 text-center flex flex-col items-center gap-2">
          <Users size={22} style={{ color: 'var(--text-muted)' }} />
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{t('invoices.noCustomers')}</p>
        </div>
      ) : (
        <>
          <div className="relative mb-2">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--text-muted)' }} />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('finance.search')} aria-label={t('finance.search')} className="input !h-9 !pl-8 text-sm" />
          </div>
          <ul className="flex flex-col -mx-2">
            {visible.map(c => (
              <li key={c.id} className="flex items-center gap-2 rounded-lg px-2 py-2.5" style={{ borderTop: '1px solid var(--border)' }}>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>{c.name}</p>
                  <p className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>{[c.tax_id, c.city, c.email].filter(Boolean).join(' · ') || '—'}</p>
                </div>
                {confirmId === c.id ? (
                  <>
                    <button onClick={() => setConfirmId(null)} className="btn btn-ghost btn-sm">{t('common.cancel')}</button>
                    <button onClick={() => remove(c.id)} disabled={busy} className="btn btn-danger btn-sm">{t('finance.delete')}</button>
                  </>
                ) : (
                  <>
                    <button onClick={() => { setError(null); setEditing({ ...c }); }} className="btn btn-ghost btn-sm !px-2" aria-label={t('invoices.editCustomer')}><Pencil size={14} /></button>
                    <button onClick={() => setConfirmId(c.id)} className="btn btn-ghost btn-sm !px-2" aria-label={t('finance.delete')}><Trash2 size={14} /></button>
                  </>
                )}
              </li>
            ))}
          </ul>
          <p className="text-xs mt-3" style={{ color: 'var(--text-muted)' }}>{t('invoices.customersNote')}</p>
        </>
      )}
    </Modal>
  );
}
