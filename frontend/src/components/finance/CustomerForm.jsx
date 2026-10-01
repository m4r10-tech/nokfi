import { useLang } from '../../context/LangContext';
import { Field } from '../ui';
import { withProvince } from './invoiceUtils';

/**
 * Sesión 11: campos de un cliente (libreta y factura nueva). Controlado:
 * value = { name, tax_id, email, address, postal_code, city, province, country, equivalence_surcharge }.
 */
export const emptyCustomer = () => ({ name: '', tax_id: '', email: '', address: '', postal_code: '', city: '', province: '', country: 'ES', equivalence_surcharge: false });

export default function CustomerForm({ value, onChange, idPrefix = 'cu' }) {
  const { t } = useLang();
  const set = (k, v) => onChange(withProvince({ ...value, [k]: v }, value));
  const input = (k, props = {}) => (
    <input id={`${idPrefix}-${k}`} value={value[k] ?? ''} onChange={(e) => set(k, e.target.value)} className="input" {...props} />
  );
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <Field label={t('invoices.customerName')} htmlFor={`${idPrefix}-name`}>{input('name', { maxLength: 160, required: true })}</Field>
      <Field label={t('finance.nif')} htmlFor={`${idPrefix}-tax_id`} hint={t('invoices.customerNifHint')}>{input('tax_id', { maxLength: 20, autoCapitalize: 'characters' })}</Field>
      <Field label={t('invoices.address')} htmlFor={`${idPrefix}-address`} className="sm:col-span-2">{input('address', { maxLength: 200 })}</Field>
      <div className="grid grid-cols-[1fr_2fr] gap-2">
        <Field label={t('invoices.postalCode')} htmlFor={`${idPrefix}-postal_code`}>{input('postal_code', { maxLength: 12 })}</Field>
        <Field label={t('invoices.city')} htmlFor={`${idPrefix}-city`}>{input('city', { maxLength: 80 })}</Field>
      </div>
      <div className="grid grid-cols-[2fr_1fr] gap-2">
        <Field label={t('invoices.province')} htmlFor={`${idPrefix}-province`}>{input('province', { maxLength: 80 })}</Field>
        <Field label={t('invoices.country')} htmlFor={`${idPrefix}-country`}>
          {input('country', { maxLength: 2, autoCapitalize: 'characters', onChange: (e) => set('country', e.target.value.toUpperCase().replace(/[^A-Z]/g, '')) })}
        </Field>
      </div>
      <Field label={t('finance.clientEmail')} htmlFor={`${idPrefix}-email`} className="sm:col-span-2">{input('email', { type: 'email', maxLength: 160, autoComplete: 'off' })}</Field>
      <label className="flex items-start gap-2 text-sm sm:col-span-2" style={{ color: 'var(--text-secondary)' }}>
        <input type="checkbox" checked={!!value.equivalence_surcharge} onChange={(e) => set('equivalence_surcharge', e.target.checked)} className="w-4 h-4 mt-0.5" />
        <span>{t('invoices.surcharge')}<span className="block text-xs" style={{ color: 'var(--text-muted)' }}>{t('invoices.surchargeHint')}</span></span>
      </label>
    </div>
  );
}
