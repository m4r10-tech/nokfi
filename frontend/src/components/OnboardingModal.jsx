import { useState } from 'react';
import { useLang } from '../context/LangContext';

const SECTORS = ['Comercio', 'Hostelería', 'Salud', 'Legal', 'Construcción', 'Tecnología', 'Consultoría', 'Diseño', 'Educación', 'Otro'];
const SIZES = [
  { value: 'solo', label: 'Solo (autónomo)' },
  { value: '2-5', label: '2–5 personas' },
  { value: '6-20', label: '6–20 personas' },
  { value: '20+', label: '+20 personas' }
];
const EXPENSES = ['Alquiler', 'Personal', 'Proveedores', 'Marketing', 'Suministros', 'Tecnología', 'Transporte', 'Otro'];

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
              placeholder="Taller García" autoComplete="organization" className="input" />
          </Field>

          <Field label={t('onboarding.sector')}>
            <select required value={sector} onChange={(e) => setSector(e.target.value)} className="input">
              <option value="" disabled>Selecciona un sector</option>
              {SECTORS.map(s => <option key={s} value={s}>{s}</option>)}
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
                  {s.label}
                </button>
              ))}
            </div>
          </Field>

          <Field label={t('onboarding.mainExpenses')}>
            <div className="flex flex-wrap gap-2">
              {EXPENSES.map(exp => (
                <button type="button" key={exp} onClick={() => toggleExpense(exp)}
                  aria-pressed={mainExpenses.includes(exp)}
                  className="rounded-full px-3.5 py-2 text-sm sm:text-xs sm:py-1.5 font-medium transition-colors active:scale-95"
                  style={mainExpenses.includes(exp)
                    ? { background: 'var(--accent-soft)', color: 'var(--accent-text)', border: '0.5px solid var(--accent)' }
                    : { background: 'var(--surface-2)', color: 'var(--text-secondary)', border: '0.5px solid var(--border-strong)' }}>
                  {exp}
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
