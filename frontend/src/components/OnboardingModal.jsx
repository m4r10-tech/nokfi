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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.6)' }}>
      <div className="w-full max-w-lg rounded-2xl p-8 max-h-[90vh] overflow-y-auto"
        style={{ background: 'var(--surface-1)', border: '0.5px solid var(--border)' }}>
        <h2 className="text-xl font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>{t('onboarding.welcome')}</h2>
        <p className="text-sm mb-6" style={{ color: 'var(--text-secondary)' }}>{t('onboarding.subtitle')}</p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          <Field label={t('onboarding.companyName')}>
            <input required value={companyName} onChange={(e) => setCompanyName(e.target.value)}
              placeholder="Taller García" style={inputStyle} />
          </Field>

          <Field label={t('onboarding.sector')}>
            <select required value={sector} onChange={(e) => setSector(e.target.value)} style={inputStyle}>
              <option value="" disabled>Selecciona un sector</option>
              {SECTORS.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </Field>

          <Field label={t('onboarding.size')}>
            <div className="grid grid-cols-2 gap-2">
              {SIZES.map(s => (
                <button type="button" key={s.value} onClick={() => setSize(s.value)}
                  className="rounded-lg py-2 text-sm font-medium transition-colors"
                  style={size === s.value
                    ? { background: 'var(--accent)', color: '#fff' }
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
                  className="rounded-full px-3 py-1.5 text-xs font-medium transition-colors"
                  style={mainExpenses.includes(exp)
                    ? { background: 'var(--accent-soft)', color: 'var(--accent)', border: '0.5px solid var(--accent)' }
                    : { background: 'var(--surface-2)', color: 'var(--text-secondary)', border: '0.5px solid var(--border-strong)' }}>
                  {exp}
                </button>
              ))}
            </div>
          </Field>

          <button type="submit" disabled={!isValid}
            className="mt-2 rounded-lg py-2.5 text-sm font-medium disabled:opacity-40 transition-opacity"
            style={{ background: 'var(--accent)', color: '#fff' }}>
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

const inputStyle = {
  width: '100%', borderRadius: '8px', padding: '10px 12px', fontSize: '14px',
  background: 'var(--surface-2)', border: '0.5px solid var(--border-strong)', color: 'var(--text-primary)', outline: 'none'
};
