import { useOutletContext } from 'react-router-dom';
import { Moon, Sun, LogOut } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import { useLang } from '../context/LangContext';
import { useAuth } from '../context/AuthContext';

export default function Configuracion() {
  const { profile, updateProfile } = useOutletContext();
  const { theme, toggleTheme } = useTheme();
  const { lang, setLang } = useLang();
  const { license, logout } = useAuth();

  return (
    <div className="max-w-xl flex flex-col gap-6">
      <h1 className="text-2xl font-semibold" style={{ color: 'var(--text-primary)' }}>Configuración</h1>

      <Section title="Apariencia">
        <div className="flex items-center justify-between">
          <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>Tema</span>
          <button onClick={toggleTheme} className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium"
            style={{ background: 'var(--surface-2)', color: 'var(--text-primary)', border: '0.5px solid var(--border-strong)' }}>
            {theme === 'dark' ? <Moon size={14} /> : <Sun size={14} />}
            {theme === 'dark' ? 'Oscuro' : 'Claro'}
          </button>
        </div>
      </Section>

      <Section title="Idioma">
        <div className="flex gap-2">
          {['es', 'en'].map(l => (
            <button key={l} onClick={() => setLang(l)}
              className="rounded-lg px-4 py-1.5 text-sm font-medium"
              style={lang === l
                ? { background: 'var(--accent)', color: '#fff' }
                : { background: 'var(--surface-2)', color: 'var(--text-secondary)', border: '0.5px solid var(--border-strong)' }}>
              {l === 'es' ? 'Español' : 'English'}
            </button>
          ))}
        </div>
      </Section>

      <Section title="Perfil de empresa">
        <Field label="Nombre" value={profile.companyName} onChange={(v) => updateProfile({ companyName: v })} />
        <Field label="Sector" value={profile.sector} onChange={(v) => updateProfile({ sector: v })} />
      </Section>

      <Section title="Sesión">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm" style={{ color: 'var(--text-primary)' }}>{license?.email}</p>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Plan {license?.plan} · Dispositivo: {license?.device_name || '—'}</p>
          </div>
          <button onClick={logout} className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium"
            style={{ background: 'var(--negative-soft)', color: 'var(--negative)' }}>
            <LogOut size={14} /> Cerrar sesión
          </button>
        </div>
      </Section>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div className="rounded-xl p-5 flex flex-col gap-3" style={{ background: 'var(--surface-1)', border: '0.5px solid var(--border)' }}>
      <p className="text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>{title}</p>
      {children}
    </div>
  );
}

function Field({ label, value, onChange }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-sm shrink-0" style={{ color: 'var(--text-secondary)' }}>{label}</span>
      <input value={value} onChange={(e) => onChange(e.target.value)}
        className="rounded-lg px-3 py-1.5 text-sm outline-none text-right"
        style={{ background: 'var(--surface-2)', border: '0.5px solid var(--border-strong)', color: 'var(--text-primary)' }} />
    </div>
  );
}
