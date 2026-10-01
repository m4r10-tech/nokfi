import { useState, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { invoicingApi } from '../../middleware/api';
import { useLang } from '../../context/LangContext';
import { useToast } from '../../context/ToastContext';
import { Modal, Field, ErrorBox } from '../ui';
import Skeleton from '../Skeleton';
import { VAT_RATES, IRPF_RATES, INVOICE_LANGS, invoiceError, withProvince } from './invoiceUtils';

/**
 * Sesión 11: datos del emisor que salen en cada factura (razón social, NIF,
 * dirección, IBAN…) y valores por defecto. Se rellena con el perfil de empresa
 * la primera vez.
 */
export default function BillingSettings({ onClose, onSaved }) {
  const { t } = useLang();
  const toast = useToast();
  const [p, setP] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    invoicingApi.settings().then(res => {
      if (res.ok) setP({ ...res.data.profile, iban: (res.data.profile.iban || '').replace(/(.{4})/g, '$1 ').trim() });
      else setError(invoiceError(t, res));
    });
  }, [t]);

  const set = (k, v) => setP(prev => withProvince({ ...prev, [k]: v }, prev));
  const input = (k, props = {}) => (
    <input id={`bs-${k}`} value={p[k] ?? ''} onChange={(e) => set(k, e.target.value)} className="input" {...props} />
  );

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true); setError(null);
    const res = await invoicingApi.saveSettings({ ...p, payment_terms_days: Number(p.payment_terms_days) || 0 });
    setSaving(false);
    if (!res.ok) { setError(invoiceError(t, res)); return; }
    toast.success(t('config.saved'));
    onSaved?.(res.data);
    onClose();
  };

  return (
    <Modal title={t('invoices.settingsTitle')} onClose={onClose} wide footer={<>
      <button type="button" onClick={onClose} className="btn btn-secondary">{t('common.cancel')}</button>
      <button type="submit" form="billing-form" disabled={!p || saving} className="btn btn-primary">
        {saving && <Loader2 size={15} className="animate-spin" />} {t('common.save')}
      </button>
    </>}>
      {!p ? (error ? <ErrorBox>{error}</ErrorBox> : <div className="flex flex-col gap-3">{[0, 1, 2].map(i => <Skeleton key={i} className="h-10" />)}</div>) : (
        <form id="billing-form" onSubmit={submit} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <p className="sm:col-span-2 text-sm" style={{ color: 'var(--text-secondary)' }}>{t('invoices.settingsIntro')}</p>
          <Field label={t('invoices.legalName')} htmlFor="bs-legal_name">{input('legal_name', { maxLength: 160, required: true, autoComplete: 'organization' })}</Field>
          <Field label={t('finance.nif')} htmlFor="bs-tax_id">{input('tax_id', { maxLength: 20, required: true, autoCapitalize: 'characters' })}</Field>
          <Field label={t('invoices.address')} htmlFor="bs-address" className="sm:col-span-2">{input('address', { maxLength: 200, required: true, autoComplete: 'street-address' })}</Field>
          <div className="grid grid-cols-[1fr_2fr] gap-2">
            <Field label={t('invoices.postalCode')} htmlFor="bs-postal_code">{input('postal_code', { maxLength: 12, required: true, inputMode: 'numeric', autoComplete: 'postal-code' })}</Field>
            <Field label={t('invoices.city')} htmlFor="bs-city">{input('city', { maxLength: 80, required: true, autoComplete: 'address-level2' })}</Field>
          </div>
          <Field label={t('invoices.province')} htmlFor="bs-province">{input('province', { maxLength: 80, autoComplete: 'address-level1' })}</Field>
          <Field label={t('invoices.email')} htmlFor="bs-email" hint={t('invoices.emailHint')}>{input('email', { type: 'email', maxLength: 160 })}</Field>
          <Field label={t('invoices.phone')} htmlFor="bs-phone">{input('phone', { type: 'tel', maxLength: 30 })}</Field>
          <Field label={t('invoices.iban')} htmlFor="bs-iban" className="sm:col-span-2" hint={t('invoices.ibanHint')}>
            {input('iban', { maxLength: 42, autoCapitalize: 'characters', spellCheck: false, placeholder: 'ES00 0000 0000 0000 0000 0000' })}
          </Field>
          <Field label={t('invoices.termsDays')} htmlFor="bs-payment_terms_days">{input('payment_terms_days', { type: 'number', min: 0, max: 120, inputMode: 'numeric' })}</Field>
          <Field label={t('invoices.invoiceLang')} htmlFor="bs-invoice_lang">
            <select id="bs-invoice_lang" value={p.invoice_lang} onChange={(e) => set('invoice_lang', e.target.value)} className="input">
              {INVOICE_LANGS.map(l => <option key={l} value={l}>{t(`invoices.langs.${l}`)}</option>)}
            </select>
          </Field>
          <Field label={t('invoices.defaultVat')} htmlFor="bs-default_vat_rate">
            <select id="bs-default_vat_rate" value={p.default_vat_rate} onChange={(e) => set('default_vat_rate', Number(e.target.value))} className="input">
              {VAT_RATES.map(v => <option key={v} value={v}>{v} %</option>)}
            </select>
          </Field>
          <Field label={t('invoices.defaultIrpf')} htmlFor="bs-default_irpf_rate" hint={t('invoices.irpfHint')}>
            <select id="bs-default_irpf_rate" value={p.default_irpf_rate} onChange={(e) => set('default_irpf_rate', Number(e.target.value))} className="input">
              {IRPF_RATES.map(v => <option key={v} value={v}>{v} %</option>)}
            </select>
          </Field>
          <Field label={t('invoices.footer')} htmlFor="bs-footer" className="sm:col-span-2" hint={t('invoices.footerHint')}>
            <textarea id="bs-footer" value={p.footer} onChange={(e) => set('footer', e.target.value)} maxLength={500} rows={2} className="input !h-auto py-2" />
          </Field>
          {error && <div className="sm:col-span-2"><ErrorBox>{error}</ErrorBox></div>}
        </form>
      )}
    </Modal>
  );
}
