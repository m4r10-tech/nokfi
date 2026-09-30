import { useState, useMemo, useId } from 'react';
import { Link } from 'react-router-dom';
import { Search, Check } from 'lucide-react';
import { useLang } from '../context/LangContext';

// `value` es lo que se GUARDA en el perfil (se mantiene el literal histórico
// en castellano para no romper perfiles existentes, el prompt ni la
// comparación con el INE); `key` da la etiqueta traducida
// (i18n onboarding.sectors/sizes/expenses). Espejo de VALID_SECTORS en
// backend/routes/profile.js y de SECTOR_MAP en scripts/build-benchmarks.js.
export const SECTORS = [
  ['Taller mecánico', 'taller'], ['Automoción', 'automocion'], ['Transporte', 'transporte'], ['Industria', 'industria'],
  ['Comercio', 'comercio'], ['Comercio mayorista', 'mayorista'], ['Hostelería', 'hosteleria'], ['Alojamiento', 'alojamiento'],
  ['Construcción', 'construccion'], ['Inmobiliaria', 'inmobiliaria'], ['Salud', 'salud'], ['Peluquería y estética', 'estetica'],
  ['Deporte y ocio', 'deporte'], ['Educación', 'educacion'], ['Legal', 'legal'], ['Asesoría y gestoría', 'asesoria'],
  ['Consultoría', 'consultoria'], ['Arquitectura e ingeniería', 'arquitectura'], ['Tecnología', 'tecnologia'],
  ['Marketing y publicidad', 'marketing'], ['Diseño', 'diseno'], ['Limpieza', 'limpieza'], ['Agricultura', 'agricultura'], ['Otro', 'otro']
].map(([value, key]) => ({ value, key }));

/** Sectores ordenados por su nombre en el idioma de la app ("Otro" siempre al final). */
export function sortedSectors(t, lang) {
  return SECTORS
    .map(s => ({ ...s, label: t(`onboarding.sectors.${s.key}`) }))
    .sort((a, b) => (a.key === 'otro') - (b.key === 'otro') || a.label.localeCompare(b.label, lang));
}

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

const fold = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// Mismo estado "seleccionado" para todas las opciones del modal.
const chip = (on) => (on
  ? { background: 'var(--accent-soft)', color: 'var(--accent-text)', border: '1px solid var(--accent)' }
  : { background: 'var(--surface-2)', color: 'var(--text-secondary)', border: '1px solid var(--border-strong)' });

/**
 * Onboarding (sección 14; rehecho en la sesión 8): nombre, forma jurídica,
 * sector con buscador, tamaño y gastos principales, con los avisos de plazos
 * fiscales activados por defecto. Se puede omitir ("Omitir por ahora"): lo
 * que falte se completa luego en Configuración.
 */
export default function OnboardingModal({ onComplete }) {
  const { t } = useLang();
  const [companyName, setCompanyName] = useState('');
  const [legalForm, setLegalForm] = useState('');
  const [sector, setSector] = useState('');
  const [size, setSize] = useState('');
  const [mainExpenses, setMainExpenses] = useState([]);
  const [fiscalReminders, setFiscalReminders] = useState(true);

  const toggleExpense = (exp) => {
    setMainExpenses(prev => prev.includes(exp) ? prev.filter(e => e !== exp) : [...prev, exp]);
  };

  const isValid = companyName.trim() && legalForm && sector && size;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!isValid) return;
    onComplete({ companyName: companyName.trim(), legalForm, sector, size, mainExpenses, fiscalReminders, onboardingCompleted: true });
  };

  // Omitir: se guarda lo que ya haya puesto y no se vuelve a abrir.
  const skip = () => {
    const partial = { onboardingCompleted: true, fiscalReminders };
    if (companyName.trim()) partial.companyName = companyName.trim();
    if (legalForm) partial.legalForm = legalForm;
    if (sector) partial.sector = sector;
    if (size) partial.size = size;
    if (mainExpenses.length) partial.mainExpenses = mainExpenses;
    onComplete(partial);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 anim-fade" style={{ background: 'var(--overlay)' }}
      role="dialog" aria-modal="true" aria-labelledby="onboarding-title">
      <div className="w-full max-w-lg rounded-t-2xl sm:rounded-2xl p-5 sm:p-8 max-h-[92dvh] overflow-y-auto overscroll-contain safe-bottom"
        style={{ background: 'var(--surface-1)', border: '1px solid var(--border)', animation: 'fade-up var(--dur-slow) var(--ease-out) both' }}>
        <h2 id="onboarding-title" className="text-xl font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>{t('onboarding.welcome')}</h2>
        <p className="text-sm mb-6" style={{ color: 'var(--text-secondary)' }}>{t('onboarding.subtitle')}</p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          <Field label={t('onboarding.companyName')} htmlFor="ob-name">
            <input id="ob-name" required value={companyName} onChange={(e) => setCompanyName(e.target.value)}
              placeholder={t('onboarding.companyPlaceholder')} autoComplete="organization" className="input" />
          </Field>

          <Field label={t('config.legalForm')} hint={t('onboarding.legalHint')}>
            <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label={t('config.legalForm')}>
              {[['autonomo', 'config.legalAutonomo'], ['sociedad', 'config.legalSociedad']].map(([v, k]) => (
                <button type="button" key={v} role="radio" aria-checked={legalForm === v} onClick={() => setLegalForm(v)}
                  className="btn btn-sm !min-h-[44px] sm:!min-h-[38px]" style={chip(legalForm === v)}>
                  {t(k)}
                </button>
              ))}
            </div>
          </Field>

          <Field label={t('onboarding.sector')}>
            <SectorPicker value={sector} onChange={setSector} />
          </Field>

          <Field label={t('onboarding.size')}>
            <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label={t('onboarding.size')}>
              {SIZES.map(s => (
                <button type="button" key={s.value} role="radio" aria-checked={size === s.value} onClick={() => setSize(s.value)}
                  className="btn btn-sm !min-h-[44px] sm:!min-h-[38px] !whitespace-normal" style={chip(size === s.value)}>
                  {t(`onboarding.sizes.${s.key}`)}
                </button>
              ))}
            </div>
          </Field>

          <Field label={t('onboarding.mainExpenses')} hint={t('onboarding.optional')}>
            <div className="flex flex-wrap gap-2">
              {EXPENSES.map(({ value: exp, key }) => (
                <button type="button" key={exp} onClick={() => toggleExpense(exp)} aria-pressed={mainExpenses.includes(exp)}
                  className="rounded-full px-3.5 py-2 text-sm sm:text-xs sm:py-1.5 font-medium transition-colors active:scale-95"
                  style={chip(mainExpenses.includes(exp))}>
                  {t(`onboarding.expenses.${key}`)}
                </button>
              ))}
            </div>
          </Field>

          <label className="flex items-start gap-3 cursor-pointer">
            <input type="checkbox" checked={fiscalReminders} onChange={(e) => setFiscalReminders(e.target.checked)} className="mt-0.5 w-4 h-4 accent-[var(--accent)]" />
            <span className="text-sm">
              <span className="block font-medium" style={{ color: 'var(--text-primary)' }}>{t('onboarding.reminders')}</span>
              <span className="block text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>{t('onboarding.remindersHint')}</span>
            </span>
          </label>

          <div className="flex flex-col gap-2 mt-1">
            <button type="submit" disabled={!isValid} className="btn btn-primary w-full">{t('onboarding.start')}</button>
            <button type="button" onClick={skip} className="btn btn-ghost w-full">{t('onboarding.skip')}</button>
          </div>
          <p className="text-xs text-center" style={{ color: 'var(--text-muted)' }}>
            {t('onboarding.privacy')} <Link to="/privacidad" className="underline">{t('chat.privacyMore')}</Link>
          </p>
        </form>
      </div>
    </div>
  );
}

/** Buscador de sectores: escribe para filtrar (sin distinguir tildes) y elige de la lista. */
function SectorPicker({ value, onChange }) {
  const { t, lang } = useLang();
  const [query, setQuery] = useState('');
  const listId = useId();
  const all = useMemo(() => sortedSectors(t, lang), [t, lang]);
  const selected = all.find(s => s.value === value);
  const matches = query ? all.filter(s => fold(s.label).includes(fold(query))) : all;
  // Si no encaja ninguno, se ofrece "Otro".
  const shown = matches.length ? matches : all.filter(s => s.key === 'otro');

  if (selected && !query) {
    return (
      <div className="flex items-center gap-2 rounded-lg px-3 min-h-[44px] sm:min-h-[40px]" style={chip(true)}>
        <Check size={15} className="shrink-0" />
        <span className="flex-1 text-sm font-medium">{selected.label}</span>
        <button type="button" onClick={() => onChange('')} className="text-xs font-medium underline">{t('onboarding.change')}</button>
      </div>
    );
  }
  return (
    <div>
      <div className="relative">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--text-muted)' }} />
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('onboarding.sectorSearch')}
          aria-label={t('onboarding.sector')} aria-controls={listId} className="input !pl-9" />
      </div>
      <ul id={listId} role="listbox" aria-label={t('onboarding.sector')} className="mt-2 max-h-44 overflow-y-auto rounded-lg p-1" style={{ border: '1px solid var(--border)' }}>
        {shown.map(s => (
          <li key={s.value} role="option" aria-selected={value === s.value}>
            <button type="button" onClick={() => { onChange(s.value); setQuery(''); }}
              className="nav-item w-full text-left rounded-md px-2.5 py-2 text-sm" style={{ color: 'var(--text-primary)' }}>
              {s.label}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Field({ label, hint, htmlFor, children }) {
  return (
    <div>
      <label htmlFor={htmlFor} className="flex items-baseline justify-between gap-2 text-sm font-medium mb-1.5" style={{ color: 'var(--text-primary)' }}>
        {label}
        {hint && <span className="text-xs font-normal" style={{ color: 'var(--text-muted)' }}>{hint}</span>}
      </label>
      {children}
    </div>
  );
}
