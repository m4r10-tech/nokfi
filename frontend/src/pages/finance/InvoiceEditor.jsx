import { useState, useEffect, useMemo } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Plus, Trash2, Loader2, FileCheck2, Undo2 } from 'lucide-react';
import { invoicingApi } from '../../middleware/api';
import { useLang } from '../../context/LangContext';
import { useToast } from '../../context/ToastContext';
import Skeleton from '../../components/Skeleton';
import { Section, Field, ErrorBox, Notice, Segmented, Modal } from '../../components/ui';
import CustomerForm, { emptyCustomer } from '../../components/finance/CustomerForm';
import {
  VAT_RATES, IRPF_RATES, EXEMPTIONS, PAYMENT_METHODS, RECTIFY_KINDS, INVOICE_LANGS, SIMPLIFIED_MAX,
  computeTotals, lineAmount, emptyLine, invoiceError
} from '../../components/finance/invoiceUtils';
import { eur, todayIso } from '../../utils/money';

const addDays = (iso, d) => { const x = new Date(`${iso}T00:00:00Z`); x.setUTCDate(x.getUTCDate() + d); return x.toISOString().slice(0, 10); };

/**
 * Sesión 11 (tanda 2): factura nueva. ?from=<id> la duplica; ?rectify=<id>
 * prepara una rectificativa por diferencias con las líneas en negativo.
 * Antes de emitir se confirma: una factura emitida ya no se puede editar.
 */
export default function InvoiceEditor() {
  const { t, lang } = useLang();
  const toast = useToast();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const fromId = params.get('from');
  const rectifyId = params.get('rectify');

  const [settings, setSettings] = useState(null);
  const [customers, setCustomers] = useState([]);
  const [original, setOriginal] = useState(null);
  const [mode, setMode] = useState('saved'); // saved | new | none
  const [customerId, setCustomerId] = useState('');
  const [customer, setCustomer] = useState(emptyCustomer());
  const [f, setF] = useState(null);
  const [error, setError] = useState(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const [st, cs, src] = await Promise.all([
        invoicingApi.settings(), invoicingApi.customers(),
        fromId || rectifyId ? invoicingApi.get(fromId || rectifyId) : Promise.resolve(null)
      ]);
      if (!st.ok) { setError(invoiceError(t, st)); return; }
      const p = st.data.profile;
      setSettings(st.data);
      const list = cs.ok ? cs.data.customers : [];
      setCustomers(list);
      const today = todayIso();
      const base = {
        issue_date: today, due_date: addDays(today, p.payment_terms_days), operation_date: '', irpf_rate: p.default_irpf_rate,
        exemption: 'E1', payment_method: 'transfer', iban: p.iban, notes: '', lang: p.invoice_lang, equivalence_surcharge: false,
        lines: [emptyLine(p.default_vat_rate)], rectification_kind: 'R1', rectification_reason: ''
      };
      const inv = src?.ok ? src.data.invoice : null;
      if (inv) {
        const lines = inv.lines.map(l => ({ description: l.description, quantity: rectifyId ? -l.quantity : l.quantity, unit: l.unit, unit_price: l.unit_price, discount_pct: l.discount_pct, vat_rate: l.vat_rate }));
        Object.assign(base, { lines, irpf_rate: inv.irpf_rate, exemption: inv.exemption || 'E1', payment_method: inv.payment_method, notes: rectifyId ? '' : inv.notes, lang: inv.lang, equivalence_surcharge: inv.equivalence_surcharge });
        if (rectifyId) { setOriginal(inv); base.rectification_kind = inv.kind === 'F2' ? 'R5' : 'R1'; }
        if (inv.customer_id && list.some(c => c.id === inv.customer_id)) { setMode('saved'); setCustomerId(String(inv.customer_id)); }
        else if (inv.customer) { setMode('new'); setCustomer({ ...emptyCustomer(), ...inv.customer, equivalence_surcharge: inv.equivalence_surcharge }); }
        else setMode('none');
      } else if (!list.length) setMode('new');
      setF(base);
    })();
  }, [fromId, rectifyId, t]);

  const set = (k, v) => setF(prev => ({ ...prev, [k]: v }));
  const setLine = (i, k, v) => setF(prev => ({ ...prev, lines: prev.lines.map((l, j) => (j === i ? { ...l, [k]: v } : l)) }));

  const selected = customers.find(c => String(c.id) === customerId);
  const surcharge = mode === 'saved' ? !!selected?.equivalence_surcharge : mode === 'new' ? !!customer.equivalence_surcharge : false;
  const totals = useMemo(() => (f ? computeTotals(f.lines.filter(l => l.description || l.unit_price !== ''), f.irpf_rate, original ? f.equivalence_surcharge : surcharge) : null), [f, surcharge, original]);
  const hasZero = f?.lines.some(l => Number(l.vat_rate) === 0);
  const noNif = original ? !original.customer?.tax_id : mode === 'none' || (mode === 'new' && !customer.tax_id.trim()) || (mode === 'saved' && !selected?.tax_id);

  const body = () => {
    const out = {
      issue_date: f.issue_date, due_date: f.due_date || null, irpf_rate: Number(f.irpf_rate), payment_method: f.payment_method,
      notes: f.notes, lang: f.lang, equivalence_surcharge: original ? f.equivalence_surcharge : surcharge,
      lines: f.lines.map(l => ({ ...l, quantity: Number(l.quantity), unit_price: Number(l.unit_price), discount_pct: Number(l.discount_pct) || 0, vat_rate: Number(l.vat_rate) }))
    };
    if (f.operation_date) out.operation_date = f.operation_date;
    if (hasZero) out.exemption = f.exemption;
    if (['transfer', 'direct_debit'].includes(f.payment_method)) out.iban = f.iban;
    if (original) {
      Object.assign(out, { rectifies_id: original.id, rectification_kind: f.rectification_kind, rectification_reason: f.rectification_reason });
    } else if (mode === 'saved' && customerId) out.customer_id = Number(customerId);
    else if (mode === 'new') out.customer = customer;
    return out;
  };

  const issue = async () => {
    setBusy(true); setError(null);
    const res = await invoicingApi.issue(body());
    setBusy(false); setConfirming(false);
    if (!res.ok) { setError(invoiceError(t, res)); return; }
    toast.success(t('invoices.issuedOk', { n: res.data.number }));
    navigate(`/app/finanzas/facturas?open=${res.data.id}`);
  };

  if (!f) {
    return error ? <ErrorBox>{error}</ErrorBox> : <div className="card p-4 flex flex-col gap-3" aria-busy="true">{[0, 1, 2, 3].map(i => <Skeleton key={i} className="h-10" />)}</div>;
  }
  const valid = f.lines.length > 0 && f.lines.every(l => l.description.trim() && l.unit_price !== '' && Number(l.quantity) !== 0)
    && (original ? f.rectification_reason.trim() : mode !== 'saved' || customerId) && (mode !== 'new' || original || customer.name.trim());

  return (
    <form onSubmit={(e) => { e.preventDefault(); if (valid) setConfirming(true); }} className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <Link to="/app/finanzas/facturas" className="btn btn-ghost btn-sm"><ArrowLeft size={15} /> {t('invoices.back')}</Link>
        <h2 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>{original ? t('invoices.rectifyTitle', { n: original.number }) : t('invoices.new')}</h2>
      </div>

      {settings.missing.length > 0 && <Notice tone="warning">{t('invoices.missingData')}</Notice>}

      {original ? (
        <Section title={t('invoices.rectification')}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <p className="sm:col-span-2 text-sm" style={{ color: 'var(--text-secondary)' }}>{t('invoices.rectifyIntro', { n: original.number, customer: original.customer?.name || t('invoices.noCustomer') })}</p>
            {original.kind !== 'F2' && (
              <Field label={t('invoices.rectifyKind')} htmlFor="ie-rk">
                <select id="ie-rk" value={f.rectification_kind} onChange={(e) => set('rectification_kind', e.target.value)} className="input">
                  {RECTIFY_KINDS.map(k => <option key={k} value={k}>{k} · {t(`invoices.rectifyKinds.${k}`)}</option>)}
                </select>
              </Field>
            )}
            <Field label={t('invoices.reason')} htmlFor="ie-rr" className={original.kind === 'F2' ? 'sm:col-span-2' : ''}>
              <input id="ie-rr" value={f.rectification_reason} onChange={(e) => set('rectification_reason', e.target.value)} maxLength={300} className="input" required placeholder={t('invoices.reasonPlaceholder')} />
            </Field>
          </div>
        </Section>
      ) : (
        <Section title={t('finance.client')}>
          <div className="flex flex-col gap-3">
            <Segmented value={mode} onChange={setMode} size="sm" label={t('finance.client')} options={[
              ...(customers.length ? [{ value: 'saved', label: t('invoices.savedCustomer') }] : []),
              { value: 'new', label: t('invoices.newCustomer') }, { value: 'none', label: t('invoices.noCustomerOption') }
            ]} />
            {mode === 'saved' && (
              <select value={customerId} onChange={(e) => setCustomerId(e.target.value)} className="input" aria-label={t('finance.client')} required>
                <option value="">{t('invoices.pickCustomer')}</option>
                {customers.map(c => <option key={c.id} value={c.id}>{c.name}{c.tax_id ? ` · ${c.tax_id}` : ''}</option>)}
              </select>
            )}
            {mode === 'new' && <CustomerForm value={customer} onChange={setCustomer} idPrefix="ie-c" />}
            {mode === 'none' && <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{t('invoices.simplifiedHint', { max: SIMPLIFIED_MAX })}</p>}
            {mode !== 'none' && noNif && <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{t('invoices.noNifHint', { max: SIMPLIFIED_MAX })}</p>}
          </div>
        </Section>
      )}

      <Section title={t('invoices.lines')}>
        <div className="flex flex-col gap-3">
          {f.lines.map((l, i) => (
            <div key={i} className="grid grid-cols-2 sm:grid-cols-[1fr_80px_110px_70px_90px_96px_36px] gap-2 items-end pb-3" style={{ borderBottom: '1px solid var(--border)' }}>
              <Field label={i === 0 ? t('invoices.description') : ''} htmlFor={`ie-d${i}`} className="col-span-2 sm:col-span-1">
                <input id={`ie-d${i}`} value={l.description} onChange={(e) => setLine(i, 'description', e.target.value)} maxLength={500} className="input" required aria-label={t('invoices.description')} />
              </Field>
              <Field label={i === 0 ? t('invoices.qty') : ''} htmlFor={`ie-q${i}`}>
                <input id={`ie-q${i}`} type="number" step="any" value={l.quantity} onChange={(e) => setLine(i, 'quantity', e.target.value)} className="input" inputMode="decimal" aria-label={t('invoices.qty')} />
              </Field>
              <Field label={i === 0 ? t('invoices.price') : ''} htmlFor={`ie-p${i}`}>
                <input id={`ie-p${i}`} type="number" step="any" value={l.unit_price} onChange={(e) => setLine(i, 'unit_price', e.target.value)} className="input" inputMode="decimal" required aria-label={t('invoices.price')} />
              </Field>
              <Field label={i === 0 ? t('invoices.discount') : ''} htmlFor={`ie-ds${i}`}>
                <input id={`ie-ds${i}`} type="number" min="0" max="100" step="any" value={l.discount_pct} onChange={(e) => setLine(i, 'discount_pct', e.target.value)} className="input" inputMode="decimal" aria-label={t('invoices.discount')} />
              </Field>
              <Field label={i === 0 ? t('finance.vatRate') : ''} htmlFor={`ie-v${i}`}>
                <select id={`ie-v${i}`} value={l.vat_rate} onChange={(e) => setLine(i, 'vat_rate', Number(e.target.value))} className="input" aria-label={t('finance.vatRate')}>
                  {VAT_RATES.map(v => <option key={v} value={v}>{v} %</option>)}
                </select>
              </Field>
              <p className="text-sm font-medium tabular text-right sm:pb-2.5" style={{ color: 'var(--text-primary)' }}>{eur(lineAmount(l), lang)}</p>
              <button type="button" onClick={() => setF(prev => ({ ...prev, lines: prev.lines.filter((_, j) => j !== i) }))} disabled={f.lines.length === 1}
                className="btn btn-ghost btn-sm !px-2 justify-self-end" aria-label={t('invoices.removeLine')}><Trash2 size={14} /></button>
            </div>
          ))}
          <button type="button" onClick={() => set('lines', [...f.lines, emptyLine(settings.profile.default_vat_rate)])} className="btn btn-secondary btn-sm self-start" disabled={f.lines.length >= 200}>
            <Plus size={14} /> {t('invoices.addLine')}
          </button>
        </div>
      </Section>

      <Section title={t('invoices.details')}>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Field label={t('finance.date')} htmlFor="ie-date"><input id="ie-date" type="date" value={f.issue_date} max={todayIso()} onChange={(e) => set('issue_date', e.target.value)} className="input" required /></Field>
          {!original && <Field label={t('finance.dueDate')} htmlFor="ie-due"><input id="ie-due" type="date" value={f.due_date || ''} min={f.issue_date} onChange={(e) => set('due_date', e.target.value)} className="input" /></Field>}
          <Field label={t('invoices.operationDate')} htmlFor="ie-op" hint={t('invoices.operationHint')}><input id="ie-op" type="date" value={f.operation_date} onChange={(e) => set('operation_date', e.target.value)} className="input" /></Field>
          <Field label={t('finance.irpfRate')} htmlFor="ie-irpf" hint={t('invoices.irpfHint')}>
            <select id="ie-irpf" value={f.irpf_rate} onChange={(e) => set('irpf_rate', Number(e.target.value))} className="input">
              {IRPF_RATES.map(v => <option key={v} value={v}>{v} %</option>)}
            </select>
          </Field>
          {!original && (
            <Field label={t('invoices.paymentMethod')} htmlFor="ie-pm">
              <select id="ie-pm" value={f.payment_method} onChange={(e) => set('payment_method', e.target.value)} className="input">
                {PAYMENT_METHODS.map(m => <option key={m} value={m}>{t(`invoices.methods.${m}`)}</option>)}
              </select>
            </Field>
          )}
          {!original && ['transfer', 'direct_debit'].includes(f.payment_method) && (
            <Field label={t('invoices.iban')} htmlFor="ie-iban"><input id="ie-iban" value={f.iban} onChange={(e) => set('iban', e.target.value)} className="input" maxLength={42} spellCheck={false} /></Field>
          )}
          <Field label={t('invoices.invoiceLang')} htmlFor="ie-lang">
            <select id="ie-lang" value={f.lang} onChange={(e) => set('lang', e.target.value)} className="input">
              {INVOICE_LANGS.map(l => <option key={l} value={l}>{t(`invoices.langs.${l}`)}</option>)}
            </select>
          </Field>
          {hasZero && (
            <Field label={t('invoices.exemption')} htmlFor="ie-ex" className="sm:col-span-2">
              <select id="ie-ex" value={f.exemption} onChange={(e) => set('exemption', e.target.value)} className="input">
                {EXEMPTIONS.map(x => <option key={x} value={x}>{x} · {t(`invoices.exemptions.${x}`)}</option>)}
              </select>
            </Field>
          )}
          <Field label={t('invoices.notes')} htmlFor="ie-notes" className="sm:col-span-3">
            <textarea id="ie-notes" value={f.notes} onChange={(e) => set('notes', e.target.value)} maxLength={1000} rows={2} className="input !h-auto py-2" />
          </Field>
        </div>
      </Section>

      <Section>
        <dl className="ml-auto w-full sm:w-80 grid grid-cols-2 gap-y-1 text-sm tabular">
          {totals.taxes.map(g => (
            <div key={`${g.vat_rate}-${g.re_rate}`} className="contents">
              <dt style={{ color: 'var(--text-muted)' }}>{t('finance.vat')} {g.vat_rate} % · {eur(g.base, lang)}</dt><dd className="text-right">{eur(g.vat_amount, lang)}</dd>
            </div>
          ))}
          <dt style={{ color: 'var(--text-muted)' }}>{t('finance.base')}</dt><dd className="text-right">{eur(totals.base, lang)}</dd>
          {totals.re_amount !== 0 && <><dt style={{ color: 'var(--text-muted)' }}>{t('invoices.surchargeShort')}</dt><dd className="text-right">{eur(totals.re_amount, lang)}</dd></>}
          {totals.irpf_amount !== 0 && <><dt style={{ color: 'var(--text-muted)' }}>{t('finance.irpf')} ({f.irpf_rate} %)</dt><dd className="text-right">{eur(-totals.irpf_amount, lang)}</dd></>}
          <dt className="font-semibold pt-1 text-base" style={{ color: 'var(--text-primary)', borderTop: '1px solid var(--border)' }}>{t('finance.total')}</dt>
          <dd className="text-right font-semibold pt-1 text-base" style={{ color: 'var(--text-primary)', borderTop: '1px solid var(--border)' }}>{eur(totals.total, lang)}</dd>
        </dl>
        {!original && noNif && totals.total > SIMPLIFIED_MAX && <p className="text-xs mt-2 text-right" style={{ color: 'var(--warning)' }}>{t('invoices.errors.customer_tax_id_required', { max: SIMPLIFIED_MAX })}</p>}
      </Section>

      {error && <ErrorBox>{error}</ErrorBox>}
      <div className="flex justify-end gap-2">
        <Link to="/app/finanzas/facturas" className="btn btn-secondary">{t('common.cancel')}</Link>
        <button type="submit" disabled={!valid || busy || settings.missing.length > 0} className="btn btn-primary">
          {original ? <Undo2 size={15} /> : <FileCheck2 size={15} />} {original ? t('invoices.issueRectification') : t('invoices.issue')}
        </button>
      </div>

      {confirming && (
        <Modal title={original ? t('invoices.issueRectification') : t('invoices.issue')} onClose={() => setConfirming(false)} footer={<>
          <button type="button" onClick={() => setConfirming(false)} className="btn btn-ghost">{t('invoices.review')}</button>
          <button type="button" onClick={issue} disabled={busy} className="btn btn-primary" autoFocus>{busy && <Loader2 size={15} className="animate-spin" />} {t('invoices.confirmIssue', { total: eur(totals.total, lang) })}</button>
        </>}>
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{t('invoices.issueWarning')}</p>
        </Modal>
      )}
    </form>
  );
}
