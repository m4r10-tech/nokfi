import { useState } from 'react';
import { useLang } from '../context/LangContext';

// `value` es lo que se GUARDA en el perfil (se mantiene el literal histórico
// en castellano para no romper perfiles existentes ni el prompt); `key` da la
// etiqueta traducida (i18n onboarding.sectors/sizes/expenses).
export const SECTORS = [
  ['Comercio', 'comercio'], ['Hostelería', 'hosteleria'], ['Salud', 'salud'], ['Legal', 'legal'], ['Construcción', 'construccion'],
  ['Tecnología', 'tecnologia'], ['Consultoría', 'consultoria'], ['Diseño', 'diseno'], ['Educación', 'educacion'], ['Otro', 'otro']
].map(([value, key]) => ({ value, key }));
export const SIZES = [
  { value: 'solo', key: 'solo' },
  { value: '2-5', key: 's2' },
  { value: '6-20', key: 's6' },
  { value: '20+', key: 's20' }
];
const EXPENSES = [
  ['Alquiler', 'alquiler'], ['Personal', 'personal'], ['Proveedores', 'proveedores'], ['Marketing', 'marketing'],
  ['Suministros', 'suministros'], ['Tecnología', 'tecnologia'], ['Transporte', 'transporte'], ['Otro', 'otro']
].map(([value, key]) => ({ value, key }));

/** Modal obligatorio de onboarding (sección 14 del proyecto) — no se puede cerrar sin rellenar */
export default function OnboardingModal({ onComplete }) {
  const [companyName, setCompanyName] = useState('');
  const [sector, setSector] = useState('');
  const [size, setSize] = useState('');
  const [mainExpenses, setMainExpenses] = useState([]);
  const { t } = useLang();

  const toggleExpense = (exp) => {
    setMainExpenses(prev => prev.includes(exp) ? prev.filter(e => e !== exp) : [...prev, exp]);
  };

  const isValid = companyName.trim() && sector && size && mainExpenses.length > 0;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!isValid) return;
    onComplete({ companyName: companyName.trim(), sector, size, mainExpenses, onboardingCompleted: true });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 anim-fade" style={{ background: 'var(--overlay)' }}
      role="dialog" aria-modal="true" aria-labelledby="onboarding-title">
      <div className="w-full max-w-lg rounded-t-2xl sm:rounded-2xl p-5 sm:p-8 max-h-[92dvh] overflow-y-auto overscroll-contain safe-bottom"
        style={{ background: 'var(--surface-1)', border: '1px solid var(--border)', animation: 'fade-up var(--dur-slow) var(--ease-out) both' }}>
        <h2 id="onboarding-title" className="text-xl font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>{t('onboarding.welcome')}</h2>
        <p className="text-sm mb-6" style={{ color: 'var(--text-secondary)' }}>{t('onboarding.subtitle')}</p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          <Field label={t('onboarding.companyName')}>
            <input required value={companyName} onChange={(e) => setCompanyName(e.target.value)}
              placeholder={t('onboarding.companyPlaceholder')} autoComplete="organization" className="input" />
          </Field>

          <Field label={t('onboarding.sector')}>
            <select required value={sector} onChange={(e) => setSector(e.target.value)} className="input">
              <option value="" disabled>{t('onboarding.sectorSelect')}</option>
              {SECTORS.map(s => <option key={s.value} value={s.value}>{t(`onboarding.sectors.${s.key}`)}</option>)}
            </select>
          </Field>

          <Field label={t('onboarding.size')}>
            <div className="grid grid-cols-2 gap-2">
              {SIZES.map(s => (
                <button type="button" key={s.value} onClick={() => setSize(s.value)}
                  aria-pressed={size === s.value}
                  className="btn btn-sm !min-h-[44px] sm:!min-h-[38px] !whitespace-normal"
                  style={size === s.value
                    ? { background: 'var(--accent)', color: 'var(--on-accent)' }
                    : { background: 'var(--surface-2)', color: 'var(--text-secondary)', border: '0.5px solid var(--border-strong)' }}>
                  {t(`onboarding.sizes.${s.key}`)}
                </button>
              ))}
            </div>
          </Field>

          <Field label={t('onboarding.mainExpenses')}>
            <div className="flex flex-wrap gap-2">
              {EXPENSES.map(({ value: exp, key }) => (
                <button type="button" key={exp} onClick={() => toggleExpense(exp)}
                  aria-pressed={mainExpenses.includes(exp)}
                  className="rounded-full px-3.5 py-2 text-sm sm:text-xs sm:py-1.5 font-medium transition-colors active:scale-95"
                  style={mainExpenses.includes(exp)
                    ? { background: 'var(--accent-soft)', color: 'var(--accent-text)', border: '0.5px solid var(--accent)' }
                    : { background: 'var(--surface-2)', color: 'var(--text-secondary)', border: '0.5px solid var(--border-strong)' }}>
                  {t(`onboarding.expenses.${key}`)}
                </button>
              ))}
            </div>
          </Field>

          <button type="submit" disabled={!isValid}
            className="btn btn-primary mt-2 w-full">
            {t('onboarding.start')}
          </button>
        </form>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <label className="block text-xs font-medium mb-1.5 uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
        {label}
      </label>
      {children}
    </div>
  );
}
