import { useState, useEffect, useCallback, useMemo } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Plus, FileText, Users, Building2, Download, Send, Copy, Undo2, Ban, Loader2, Search, AlertTriangle, ChevronDown, Check, XCircle } from 'lucide-react';
import { invoicingApi } from '../../middleware/api';
import { apiErrorMessage, isConnectivityError } from '../../middleware/errors';
import { useLang } from '../../context/LangContext';
import { useToast } from '../../context/ToastContext';
import EmptyState from '../../components/EmptyState';
import ErrorState from '../../components/ErrorState';
import Skeleton from '../../components/Skeleton';
import { Section, Kpi, Segmented, Badge, Modal, Field, ErrorBox, Notice } from '../../components/ui';
import BillingSettings from '../../components/finance/BillingSettings';
import Customers from '../../components/finance/Customers';
import { invoiceState, invoiceError, EINVOICE_FORMATS } from '../../components/finance/invoiceUtils';
import { eur, isoDate, num, currentQuarter, todayIso } from '../../utils/money';

/**
 * Sesión 11 (tanda 2) — Finanzas › Facturas: emitir facturas (y rectificarlas
 * o anularlas, nunca editarlas), descargar el PDF y enviarlo al cliente. Cada
 * factura emitida entra sola en el libro como ingreso pendiente de cobro.
 */
export default function Invoices() {
  const { t, lang } = useLang();
  const [params, setParams] = useSearchParams();
  const cq = currentQuarter();
  const [year, setYear] = useState(cq.year);
  const [status, setStatus] = useState('all');
  const [q, setQ] = useState('');
  const [list, setList] = useState(null);
  const [failure, setFailure] = useState(null);
  const [missing, setMissing] = useState([]);
  const [modal, setModal] = useState(null); // 'settings' | 'customers'
  const openId = Number(params.get('open')) || null;

  const load = useCallback(async () => {
    setFailure(null);
    const [res, st] = await Promise.all([invoicingApi.list({ from: `${year}-01-01`, to: `${year}-12-31` }), invoicingApi.settings()]);
    if (res.ok) setList(res.data.invoices);
    else setFailure(res);
    if (st.ok) setMissing(st.data.missing);
  }, [year]);
  useEffect(() => { setList(null); load(); }, [load]);

  const visible = useMemo(() => (list || []).filter(i =>
    (status === 'all' || (status === 'pending' ? i.status === 'issued' && !i.paid && !i.kind.startsWith('R') : i.status === status))
    && (!q || `${i.number} ${i.customer?.name || ''} ${i.customer?.tax_id || ''}`.toLowerCase().includes(q.toLowerCase()))), [list, status, q]);

  const totals = useMemo(() => {
    const s = { billed: 0, pending: 0, count: 0 };
    for (const i of list || []) {
      if (i.status !== 'issued') continue;
      s.billed += i.base; s.count++;
      if (!i.paid && !i.kind.startsWith('R')) s.pending += i.total;
    }
    return s;
  }, [list]);

  const open = (id) => setParams(id ? { open: String(id) } : {}, { replace: true });
  const canIssue = missing.length === 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col lg:flex-row lg:items-center gap-3 justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <select value={year} onChange={(e) => setYear(Number(e.target.value))} className="input !w-auto !h-9 text-sm" aria-label={t('finance.year')}>
            {[cq.year, cq.year - 1, cq.year - 2].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to="/app/finanzas/facturas/nueva" className={`btn btn-primary btn-sm ${canIssue ? '' : 'opacity-60 pointer-events-none'}`} aria-disabled={!canIssue}><Plus size={14} /> {t('invoices.new')}</Link>
          <button onClick={() => setModal('customers')} className="btn btn-secondary btn-sm"><Users size={14} /> {t('invoices.customers')}</button>
          <button onClick={() => setModal('settings')} className="btn btn-secondary btn-sm"><Building2 size={14} /> {t('invoices.settings')}</button>
        </div>
      </div>

      {missing.length > 0 && (
        <Notice tone="warning" icon={AlertTriangle}>
          <span>{t('invoices.missingData')} </span>
          <button onClick={() => setModal('settings')} className="font-semibold underline">{t('invoices.completeData')}</button>
        </Notice>
      )}

      {list?.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-3">
          <Kpi label={t('invoices.billed')} value={eur(totals.billed, lang)} hint={t('invoices.billedHint')} />
          <Kpi label={t('invoices.pendingCollection')} value={eur(totals.pending, lang)} tone={totals.pending > 0 ? 'var(--warning)' : undefined} />
          <Kpi label={t('invoices.count')} value={String(totals.count)} className="hidden lg:block" />
        </div>
      )}

      {failure ? (
        <ErrorState offline={isConnectivityError(failure)} message={apiErrorMessage(t, failure)} onRetry={load} />
      ) : list === null ? (
        <div className="card p-4 flex flex-col gap-3" aria-busy="true">{[0, 1, 2].map(i => <Skeleton key={i} className="h-10" />)}</div>
      ) : list.length === 0 ? (
        <EmptyState icon={FileText} title={t('invoices.emptyTitle')} description={t('invoices.emptyDesc')}>
          {canIssue
            ? <Link to="/app/finanzas/facturas/nueva" className="btn btn-primary"><Plus size={16} /> {t('invoices.new')}</Link>
            : <button onClick={() => setModal('settings')} className="btn btn-primary"><Building2 size={16} /> {t('invoices.completeData')}</button>}
        </EmptyState>
      ) : (
        <Section aside={
          <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
            <div className="relative">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--text-muted)' }} />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('finance.search')} aria-label={t('finance.search')} className="input !h-8 !pl-8 text-sm sm:!w-52" />
            </div>
            <Segmented value={status} onChange={setStatus} size="sm" options={[
              { value: 'all', label: t('history.filterAll') }, { value: 'pending', label: t('invoices.state.pending') }, { value: 'cancelled', label: t('invoices.state.cancelled') }
            ]} />
          </div>}>
          <ul className="flex flex-col -mx-2">
            {visible.map(i => {
              const st = invoiceState(i);
              return (
                <li key={i.id}>
                  <button onClick={() => open(i.id)} className="w-full text-left flex items-center gap-2 sm:gap-3 rounded-lg px-2 py-2.5 hover:bg-[var(--surface-2)]" style={{ borderTop: '1px solid var(--border)' }}>
                    <span className="shrink-0 w-2 h-9 rounded-full" style={{ background: i.status === 'cancelled' ? 'var(--text-muted)' : 'var(--positive)' }} aria-hidden="true" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)', textDecoration: i.status === 'cancelled' ? 'line-through' : undefined }}>
                        {i.customer?.name || t('invoices.noCustomer')}
                      </p>
                      <p className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>
                        {i.number} · {isoDate(i.issue_date, lang)}{i.kind === 'F2' ? ` · ${t('invoices.kind.F2')}` : ''}
                      </p>
                    </div>
                    <p className="text-sm font-semibold tabular shrink-0" style={{ color: 'var(--text-primary)' }}>{eur(i.total, lang)}</p>
                    <span className="shrink-0 hidden sm:inline-flex"><Badge tone={st.tone}>{t(`invoices.state.${st.key}`)}</Badge></span>
                  </button>
                </li>
              );
            })}
          </ul>
          {visible.length === 0 && <p className="text-sm py-6 text-center" style={{ color: 'var(--text-secondary)' }}>{t('history.noResults')}</p>}
        </Section>
      )}

      {openId && <InvoiceDetail id={openId} onClose={() => open(null)} onChanged={load} />}
      {modal === 'settings' && <BillingSettings onClose={() => setModal(null)} onSaved={(d) => setMissing(d.missing)} />}
      {modal === 'customers' && <Customers onClose={() => setModal(null)} />}
    </div>
  );
}

/* ── Detalle de una factura con sus acciones ── */
function InvoiceDetail({ id, onClose, onChanged }) {
  const { t, lang } = useLang();
  const toast = useToast();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [step, setStep] = useState(null); // 'send' | 'cancel' | 'paid' | 'reject'
  const [busy, setBusy] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [menu, setMenu] = useState(false);
  const [to, setTo] = useState('');
  const [message, setMessage] = useState('');
  const [sendFormat, setSendFormat] = useState('');
  const [reason, setReason] = useState('');
  const [paidDate, setPaidDate] = useState(todayIso());

  const load = useCallback(async () => {
    const res = await invoicingApi.get(id);
    if (res.ok) { setData(res.data); setTo(res.data.invoice.customer?.email || ''); } else setError(invoiceError(t, res));
  }, [id, t]);
  useEffect(() => { load(); }, [load]);

  const inv = data?.invoice;
  const download = async (format) => {
    setMenu(false);
    setDownloading(true);
    const res = format === 'pdf' ? await invoicingApi.pdf(inv.id, inv.number) : await invoicingApi.einvoice(inv.id, inv.number, format);
    setDownloading(false);
    if (!res.ok) toast.error(invoiceError(t, res));
    else if (format !== 'pdf') load();
  };
  const changeStatus = async (body, okKey) => {
    setBusy(true); setError(null);
    const res = await invoicingApi.setStatus(inv.id, body);
    setBusy(false);
    if (!res.ok) { setError(invoiceError(t, res)); return; }
    toast.success(t(okKey));
    setStep(null); setReason(''); load(); onChanged();
  };
  const send = async (e) => {
    e.preventDefault();
    setBusy(true); setError(null);
    const res = await invoicingApi.send(inv.id, { to, message, ...(sendFormat ? { format: sendFormat } : {}) });
    setBusy(false);
    if (!res.ok) { setError(invoiceError(t, res)); return; }
    toast.success(t('invoices.sentTo', { to: res.data.to }));
    setStep(null); load();
  };
  const cancel = async (e) => {
    e.preventDefault();
    setBusy(true); setError(null);
    const res = await invoicingApi.cancel(inv.id, reason);
    setBusy(false);
    if (!res.ok) { setError(invoiceError(t, res)); return; }
    toast.success(t('invoices.cancelledOk'));
    setStep(null); load(); onChanged();
  };

  if (step === 'send') {
    return (
      <Modal title={t('invoices.sendTitle', { n: inv.number })} onClose={() => setStep(null)} footer={<>
        <button type="button" onClick={() => setStep(null)} className="btn btn-secondary">{t('common.cancel')}</button>
        <button type="submit" form="send-form" disabled={busy || !to} className="btn btn-primary">{busy ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />} {t('invoices.send')}</button>
      </>}>
        <form id="send-form" onSubmit={send} className="flex flex-col gap-3">
          <Field label={t('invoices.sendTo')} htmlFor="sd-to"><input id="sd-to" type="email" value={to} onChange={(e) => setTo(e.target.value)} className="input" required autoFocus /></Field>
          <Field label={t('invoices.sendFormat')} htmlFor="sd-format">
            <select id="sd-format" value={sendFormat} onChange={(e) => setSendFormat(e.target.value)} className="input">
              <option value="">{t('invoices.formats.pdf')}</option>
              {EINVOICE_FORMATS.map(f => <option key={f} value={f}>{t(`invoices.sendFormats.${f}`)}</option>)}
            </select>
          </Field>
          <Field label={t('invoices.sendMessage')} htmlFor="sd-msg" hint={t('invoices.sendHint')}>
            <textarea id="sd-msg" value={message} onChange={(e) => setMessage(e.target.value)} maxLength={2000} rows={4} className="input !h-auto py-2" />
          </Field>
          {error && <ErrorBox>{error}</ErrorBox>}
        </form>
      </Modal>
    );
  }
  if (step === 'cancel') {
    return (
      <Modal title={t('invoices.cancelTitle', { n: inv.number })} onClose={() => setStep(null)} footer={<>
        <button type="button" onClick={() => setStep(null)} className="btn btn-ghost">{t('common.cancel')}</button>
        <button type="submit" form="cancel-form" disabled={busy} className="btn btn-danger">{busy && <Loader2 size={15} className="animate-spin" />} {t('invoices.cancel')}</button>
      </>}>
        <form id="cancel-form" onSubmit={cancel} className="flex flex-col gap-3">
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{t('invoices.cancelText')}</p>
          <Field label={t('invoices.cancelReason')} htmlFor="cn-reason"><input id="cn-reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} className="input" autoFocus /></Field>
          {error && <ErrorBox>{error}</ErrorBox>}
        </form>
      </Modal>
    );
  }

  if (step === 'paid' || step === 'reject') {
    const paid = step === 'paid';
    return (
      <Modal title={paid ? t('invoices.markPaidTitle', { n: inv.number }) : t('invoices.rejectTitle', { n: inv.number })} onClose={() => setStep(null)} footer={<>
        <button type="button" onClick={() => setStep(null)} className="btn btn-ghost">{t('common.cancel')}</button>
        <button type="submit" form="status-form" disabled={busy || (!paid && !reason.trim())} className={`btn ${paid ? 'btn-primary' : 'btn-danger'}`}>
          {busy && <Loader2 size={15} className="animate-spin" />} {paid ? t('invoices.markPaid') : t('invoices.reject')}
        </button>
      </>}>
        <form id="status-form" onSubmit={(e) => { e.preventDefault(); changeStatus(paid ? { status: 'paid', date: paidDate } : { status: 'rejected', reason }, paid ? 'invoices.paidOk' : 'invoices.rejectedOk'); }} className="flex flex-col gap-3">
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{paid ? t('invoices.markPaidText') : t('invoices.rejectText')}</p>
          {paid
            ? <Field label={t('invoices.paidOn')} htmlFor="st-date"><input id="st-date" type="date" value={paidDate} min={inv.issue_date} max={todayIso()} onChange={(e) => setPaidDate(e.target.value)} className="input" required autoFocus /></Field>
            : <Field label={t('invoices.rejectReason')} htmlFor="st-reason"><input id="st-reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} className="input" required autoFocus /></Field>}
          {error && <ErrorBox>{error}</ErrorBox>}
        </form>
      </Modal>
    );
  }

  const issued = inv?.status === 'issued';
  const st = inv ? invoiceState(inv) : null;
  return (
    <Modal title={inv ? `${inv.kind.startsWith('R') ? t('invoices.kind.R') : t('invoices.invoice')} ${inv.number}` : t('invoices.invoice')} onClose={onClose} wide footer={inv && <>
      {issued && !inv.rectified_by.length && <button onClick={() => { setError(null); setStep('cancel'); }} className="btn btn-ghost sm:mr-auto" style={{ color: 'var(--negative)' }}><Ban size={15} /> {t('invoices.cancel')}</button>}
      {issued && !inv.kind.startsWith('R') && <button onClick={() => navigate(`/app/finanzas/facturas/nueva?rectify=${inv.id}`)} className="btn btn-secondary"><Undo2 size={15} /> {t('invoices.rectify')}</button>}
      {!inv.kind.startsWith('R') && <button onClick={() => navigate(`/app/finanzas/facturas/nueva?from=${inv.id}`)} className="btn btn-secondary"><Copy size={15} /> {t('invoices.duplicate')}</button>}
      {issued && <button onClick={() => { setError(null); setStep('send'); }} className="btn btn-secondary"><Send size={15} /> {t('invoices.send')}</button>}
      <div className="relative">
        <button onClick={() => setMenu(m => !m)} disabled={downloading} className="btn btn-primary w-full" aria-haspopup="menu" aria-expanded={menu}>
          {downloading ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />} {t('invoices.download')} <ChevronDown size={14} />
        </button>
        {menu && (
          <div role="menu" className="absolute right-0 bottom-full mb-2 w-72 rounded-xl p-1 z-10 anim-fade" style={{ background: 'var(--surface-1)', border: '1px solid var(--border-strong)', boxShadow: 'var(--shadow-lg, 0 8px 24px rgba(0,0,0,.25))' }}>
            {['pdf', ...EINVOICE_FORMATS].map(f => (
              <button key={f} role="menuitem" onClick={() => download(f)} className="w-full text-left rounded-lg px-3 py-2 hover:bg-[var(--surface-2)]">
                <span className="block text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{t(`invoices.formats.${f}`)}</span>
                <span className="block text-xs" style={{ color: 'var(--text-muted)' }}>{t(`invoices.formatsHint.${f}`)}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </>}>
      {!inv ? (error ? <ErrorBox>{error}</ErrorBox> : <div className="flex flex-col gap-3">{[0, 1, 2].map(i => <Skeleton key={i} className="h-10" />)}</div>) : (
        <div className="flex flex-col gap-4 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={st.tone}>{t(`invoices.state.${st.key}`)}</Badge>
            <Badge>{t(`invoices.kind.${inv.kind.startsWith('R') ? 'R' : inv.kind}`)} · {inv.kind}</Badge>
            <span style={{ color: 'var(--text-muted)' }}>{isoDate(inv.issue_date, lang)}{inv.due_date && !inv.kind.startsWith('R') ? ` · ${t('finance.dueDate')} ${isoDate(inv.due_date, lang)}` : ''}</span>
          </div>
          {issued && !inv.kind.startsWith('R') && (
            <div className="flex flex-wrap items-center gap-2 rounded-xl px-3 py-2" style={{ background: 'var(--surface-2)' }}>
              <span className="text-xs mr-auto" style={{ color: 'var(--text-secondary)' }}>
                {inv.customer_status === 'rejected' ? `${t('invoices.state.rejected')}: ${inv.customer_status_reason}`
                  : inv.paid ? t('invoices.paidOnDate', { date: isoDate(inv.paid_at, lang) }) : t('invoices.statusPending')}
              </span>
              {inv.customer_status === 'rejected' ? (
                <button onClick={() => changeStatus({ status: 'accepted' }, 'invoices.acceptedOk')} disabled={busy} className="btn btn-secondary btn-sm"><Undo2 size={14} /> {t('invoices.undoReject')}</button>
              ) : inv.paid ? (
                <button onClick={() => changeStatus({ status: 'unpaid' }, 'invoices.unpaidOk')} disabled={busy} className="btn btn-secondary btn-sm"><Undo2 size={14} /> {t('invoices.unmarkPaid')}</button>
              ) : (<>
                <button onClick={() => { setError(null); setReason(''); setStep('reject'); }} className="btn btn-ghost btn-sm" style={{ color: 'var(--negative)' }}><XCircle size={14} /> {t('invoices.reject')}</button>
                <button onClick={() => { setError(null); setPaidDate(todayIso()); setStep('paid'); }} className="btn btn-secondary btn-sm"><Check size={14} /> {t('invoices.markPaid')}</button>
              </>)}
            </div>
          )}
          {inv.status === 'cancelled' && <Notice tone="warning" icon={Ban}>{t('invoices.cancelledNotice')}{inv.cancel_reason ? ` ${t('invoices.reason')}: ${inv.cancel_reason}` : ''}</Notice>}
          {inv.rectifies_number && <p style={{ color: 'var(--text-secondary)' }}>{t('invoices.rectifiesNumber', { n: inv.rectifies_number })} · {inv.rectification_reason}</p>}
          {inv.rectified_by.length > 0 && <p style={{ color: 'var(--text-secondary)' }}>{t('invoices.rectifiedBy')}: {inv.rectified_by.map(r => r.number).join(', ')}</p>}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <p className="field-label">{t('finance.client')}</p>
              <p style={{ color: 'var(--text-primary)' }}>{inv.customer?.name || t('invoices.noCustomer')}</p>
              {inv.customer?.tax_id && <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{t('finance.nif')} {inv.customer.tax_id}</p>}
            </div>
            <div>
              <p className="field-label">{t('invoices.paymentMethod')}</p>
              <p style={{ color: 'var(--text-primary)' }}>{t(`invoices.methods.${inv.payment_method}`)}{inv.iban ? ` · ${inv.iban.replace(/(.{4})/g, '$1 ').trim()}` : ''}</p>
            </div>
          </div>
          <div className="overflow-x-auto -mx-1">
            <table className="w-full text-sm min-w-[460px]">
              <thead><tr style={{ color: 'var(--text-muted)' }} className="text-xs text-left">
                <th className="font-medium px-1 py-1">{t('invoices.description')}</th><th className="font-medium px-1 py-1 text-right">{t('invoices.qty')}</th>
                <th className="font-medium px-1 py-1 text-right">{t('invoices.price')}</th><th className="font-medium px-1 py-1 text-right">{t('finance.vatRate')}</th>
                <th className="font-medium px-1 py-1 text-right">{t('invoices.amount')}</th>
              </tr></thead>
              <tbody>{inv.lines.map(l => (
                <tr key={l.position} style={{ borderTop: '1px solid var(--border)' }}>
                  <td className="px-1 py-1.5" style={{ color: 'var(--text-primary)' }}>{l.description}</td>
                  <td className="px-1 py-1.5 text-right tabular">{num(l.quantity, lang, 3)}{l.unit ? ` ${l.unit}` : ''}</td>
                  <td className="px-1 py-1.5 text-right tabular">{num(l.unit_price, lang, 4)}{l.discount_pct ? ` −${l.discount_pct} %` : ''}</td>
                  <td className="px-1 py-1.5 text-right tabular">{l.vat_rate} %</td>
                  <td className="px-1 py-1.5 text-right tabular">{eur(l.amount, lang)}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
          <dl className="ml-auto w-full sm:w-72 grid grid-cols-2 gap-y-1 tabular">
            <dt style={{ color: 'var(--text-muted)' }}>{t('finance.base')}</dt><dd className="text-right">{eur(inv.base, lang)}</dd>
            <dt style={{ color: 'var(--text-muted)' }}>{t('finance.vat')}</dt><dd className="text-right">{eur(inv.vat_amount, lang)}</dd>
            {inv.re_amount !== 0 && <><dt style={{ color: 'var(--text-muted)' }}>{t('invoices.surchargeShort')}</dt><dd className="text-right">{eur(inv.re_amount, lang)}</dd></>}
            {inv.irpf_amount !== 0 && <><dt style={{ color: 'var(--text-muted)' }}>{t('finance.irpf')} ({inv.irpf_rate} %)</dt><dd className="text-right">{eur(-inv.irpf_amount, lang)}</dd></>}
            <dt className="font-semibold pt-1" style={{ color: 'var(--text-primary)', borderTop: '1px solid var(--border)' }}>{t('finance.total')}</dt>
            <dd className="text-right font-semibold pt-1" style={{ color: 'var(--text-primary)', borderTop: '1px solid var(--border)' }}>{eur(inv.total, lang)}</dd>
          </dl>
          {inv.notes && <p className="text-xs whitespace-pre-line" style={{ color: 'var(--text-secondary)' }}>{inv.notes}</p>}
          {data.events.length > 0 && (
            <div>
              <p className="field-label">{t('invoices.history')}</p>
              <ul className="text-xs flex flex-col gap-0.5" style={{ color: 'var(--text-muted)' }}>
                {data.events.map((e, k) => <li key={k}>{isoDate(e.created_at.slice(0, 10), lang)} · {t(`invoices.events.${e.type}`)}{['emailed', 'rejected'].includes(e.type) && e.detail ? ` (${e.detail})` : e.type === 'exported' ? ` (${t(`invoices.formats.${e.detail}`)})` : e.type === 'paid' && e.detail ? ` (${isoDate(e.detail, lang)})` : ''}</li>)}
              </ul>
            </div>
          )}
          {error && <ErrorBox>{error}</ErrorBox>}
        </div>
      )}
    </Modal>
  );
}
