import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { Moon, Sun, LogOut, KeyRound, Copy, Check, Eye, EyeOff, Loader2, CreditCard } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import { useLang } from '../context/LangContext';
import { useAuth } from '../context/AuthContext';
import { authApi, paymentsApi } from '../middleware/api';
import PasswordGenerator from '../components/PasswordGenerator';

export default function Configuracion() {
  const { profile, updateProfile } = useOutletContext();
  const { theme, toggleTheme } = useTheme();
  const { lang, setLang, t } = useLang();
  const { license, logout } = useAuth();

  return (
    <div className="max-w-xl flex flex-col gap-6">
      <h1 className="text-2xl font-semibold" style={{ color: 'var(--text-primary)' }}>{t('config.title')}</h1>

      <Section title={t('config.appearance')}>
        <div className="flex items-center justify-between">
          <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>{t('config.theme')}</span>
          <button onClick={toggleTheme} className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium"
            style={{ background: 'var(--surface-2)', color: 'var(--text-primary)', border: '0.5px solid var(--border-strong)' }}>
            {theme === 'dark' ? <Moon size={14} /> : <Sun size={14} />}
            {theme === 'dark' ? t('config.dark') : t('config.light')}
          </button>
        </div>
      </Section>

      <Section title={t('config.language')}>
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

      <Section title={t('config.profile')}>
        <Field label={t('config.companyName')} value={profile.companyName} onChange={(v) => updateProfile({ companyName: v })} />
        <Field label={t('config.sector')} value={profile.sector} onChange={(v) => updateProfile({ sector: v })} />
      </Section>

      <SubscriptionSection />

      <RevealKeySection />

      <ChangePasswordSection />

      <Section title={t('config.session')}>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm" style={{ color: 'var(--text-primary)' }}>{license?.email}</p>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              {t('config.planLabel')}: {license?.plan} · {t('config.deviceLabel')}: {license?.device_name || '—'}
            </p>
          </div>
          <button onClick={logout} className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium"
            style={{ background: 'var(--negative-soft)', color: 'var(--negative)' }}>
            <LogOut size={14} /> {t('config.logout')}
          </button>
        </div>
      </Section>
    </div>
  );
}

/* ── Suscripción (Fase 3) — plan, estado, cuota IA, gestión vía Stripe Portal ── */
function SubscriptionSection() {
  const { t } = useLang();
  const { license } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  if (!license) return null;

  const plan = (license.plan || 'mini').toUpperCase();
  const isActive = license.status === 'active';
  const hasSubscription = license.has_subscription;
  const cancelled = license.cancel_at_period_end;
  const renewal = license.current_period_ends_at
    ? new Date(license.current_period_ends_at).toLocaleDateString()
    : null;
  const aiQuota = license.ai_quota;

  const openPortal = async () => {
    setError(null);
    setLoading(true);
    const { ok, data } = await paymentsApi.stripePortal();
    setLoading(false);
    if (ok && data.url) {
      window.location.href = data.url;
    } else {
      setError(data.message || t('config.portalError'));
    }
  };

  return (
    <Section title={t('config.subscriptionSection')}>
      <div className="flex flex-col gap-2.5">
        <Row label={t('config.subscriptionPlan')}>
          <span className="font-medium" style={{ color: 'var(--text-primary)' }}>{plan}</span>
        </Row>
        <Row label={t('config.subscriptionStatus')}>
          <span className="capitalize" style={{
            color: isActive ? 'var(--positive)' : 'var(--negative)'
          }}>
            {license.status}
          </span>
        </Row>
        {aiQuota != null && (
          <Row label={t('config.aiQuota')}>
            <span style={{ color: 'var(--text-primary)' }}>{aiQuota} {t('config.aiQuotaPerDay')}</span>
          </Row>
        )}
        {(hasSubscription || renewal) && (
          <Row label={t('config.subscriptionRenews')}>
            <span style={{ color: 'var(--text-secondary)' }}>
              {cancelled && renewal
                ? `${t('config.subscriptionCancelled')} (${renewal})`
                : (renewal || t('config.subscriptionNoRenewal'))}
            </span>
          </Row>
        )}
      </div>

      {hasSubscription ? (
        <>
          <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>{t('config.manageHint')}</p>
          <button onClick={openPortal} disabled={loading}
            className="mt-2 rounded-lg py-2 text-sm font-medium flex items-center justify-center gap-2 disabled:opacity-60"
            style={{ background: 'var(--surface-2)', color: 'var(--text-primary)', border: '0.5px solid var(--border-strong)' }}>
            {loading ? <Loader2 size={15} className="animate-spin" /> : <CreditCard size={15} />}
            {t('config.manageSubscription')}
          </button>
          {error && <p className="text-sm rounded-lg px-3 py-2" style={{ background: 'var(--negative-soft)', color: 'var(--negative)' }}>{error}</p>}
        </>
      ) : (
        <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>{t('config.legacyNote')}</p>
      )}
    </Section>
  );
}

function Row({ label, children }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>{label}</span>
      {children}
    </div>
  );
}

/* ── Revelar la clave de licencia (A1) — requiere re-introducir la contraseña ── */
function RevealKeySection() {
  const { t } = useLang();
  const [revealed, setRevealed] = useState(null); // clave revelada o null
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);

  const reveal = async () => {
    setLoading(true);
    setError(null);
    const { ok, data } = await authApi.revealKey(password);
    setLoading(false);
    if (ok && data.key) {
      setRevealed(data.key);
    } else if (data.error === 'invalid_credentials') {
      setError(t('login.invalidCredentials'));
    } else {
      setError(data.message || t('common.error'));
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(revealed);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* clipboard no disponible */ }
  };

  return (
    <Section title={t('config.licenseKeySection')}>
      {revealed ? (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2 rounded-lg px-3 py-3"
               style={{ background: 'var(--surface-2)', border: '0.5px solid var(--border-strong)' }}>
            <KeyRound size={14} style={{ color: 'var(--text-muted)' }} />
            <code className="flex-1 font-mono text-sm tracking-wide break-all" style={{ color: 'var(--text-primary)' }}>{revealed}</code>
            <button onClick={copy} className="shrink-0 rounded-md p-2"
              style={{ background: 'var(--surface-1)', color: copied ? 'var(--positive)' : 'var(--text-secondary)' }}>
              {copied ? <Check size={16} /> : <Copy size={16} />}
            </button>
          </div>
          <button onClick={() => { setRevealed(null); setPassword(''); }}
            className="text-sm self-start hover:underline" style={{ color: 'var(--text-secondary)' }}>
            {t('config.hideKey')}
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            {t('config.revealKeyHint')}
          </p>
          <div className="flex gap-2">
            <input type="password" placeholder={t('login.password')} value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="flex-1 rounded-lg px-3 py-2 text-sm outline-none"
              style={{ background: 'var(--surface-2)', border: '0.5px solid var(--border-strong)', color: 'var(--text-primary)' }}
              onKeyDown={(e) => { if (e.key === 'Enter' && password) reveal(); }} />
            <button onClick={reveal} disabled={loading || !password}
              className="rounded-lg px-3 py-2 text-sm font-medium flex items-center gap-2 disabled:opacity-60"
              style={{ background: 'var(--accent)', color: '#fff' }}>
              {loading ? <Loader2 size={15} className="animate-spin" /> : <Eye size={15} />}
              {t('config.showKey')}
            </button>
          </div>
          {error && <p className="text-sm rounded-lg px-3 py-2" style={{ background: 'var(--negative-soft)', color: 'var(--negative)' }}>{error}</p>}
        </div>
      )}
    </Section>
  );
}

/* ── Cambiar contraseña (con generador) ── */
function ChangePasswordSection() {
  const { t } = useLang();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [done, setDone] = useState(false);

  const submit = async () => {
    setError(null);
    if (!current || !next) { setError(t('login.password')); return; }
    if (next !== confirm) { setError(t('login.passwordMismatch')); return; }
    setLoading(true);
    const { ok, data } = await authApi.changePassword(current, next);
    setLoading(false);
    if (ok && data.success) {
      setDone(true);
      setCurrent(''); setNext(''); setConfirm('');
      setTimeout(() => setDone(false), 3000);
    } else {
      setError(data.message || (data.error === 'weak_password' ? t('login.weakPassword') : t('login.invalidCredentials')));
    }
  };

  return (
    <Section title={t('config.changePasswordSection')}>
      <div className="flex flex-col gap-2">
        <PwdInput placeholder={t('config.currentPassword')} value={current} onChange={setCurrent} show={showPwd} toggle={setShowPwd} />
        <PwdInput placeholder={t('config.newPassword')} value={next} onChange={setNext} show={showPwd} toggle={setShowPwd} />
        <PwdInput placeholder={t('login.confirmPassword')} value={confirm} onChange={setConfirm} show={showPwd} toggle={setShowPwd} />
        <PasswordGenerator onGenerate={setNext} label={t('login.generator')} />
        {error && <p className="text-sm rounded-lg px-3 py-2" style={{ background: 'var(--negative-soft)', color: 'var(--negative)' }}>{error}</p>}
        {done && <p className="text-sm rounded-lg px-3 py-2" style={{ background: 'var(--positive-soft)', color: 'var(--positive)' }}>{t('config.passwordChanged')}</p>}
        <button onClick={submit} disabled={loading}
          className="rounded-lg py-2 text-sm font-medium flex items-center justify-center gap-2 disabled:opacity-60"
          style={{ background: 'var(--accent)', color: '#fff' }}>
          {loading && <Loader2 size={15} className="animate-spin" />}
          {t('config.changePasswordBtn')}
        </button>
      </div>
    </Section>
  );
}

function PwdInput({ placeholder, value, onChange, show, toggle }) {
  return (
    <div className="relative">
      <input type={show ? 'text' : 'password'} placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg py-2 pl-3 pr-10 text-sm outline-none"
        style={{ background: 'var(--surface-2)', border: '0.5px solid var(--border-strong)', color: 'var(--text-primary)' }} />
      <button type="button" onClick={() => toggle(!show)}
        className="absolute right-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }}>
        {show ? <EyeOff size={16} /> : <Eye size={16} />}
      </button>
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
