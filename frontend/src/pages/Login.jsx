import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { KeyRound, Mail, Lock, Eye, EyeOff, Loader2 } from 'lucide-react';
import { authApi } from '../middleware/api';
import { useAuth } from '../context/AuthContext';
import { useLang } from '../context/LangContext';
import PasswordGenerator from '../components/PasswordGenerator';
import Logo from '../components/Logo';

const KEY_REGEX = /^[A-Fa-f0-9]{4}-[A-Fa-f0-9]{4}-[A-Fa-f0-9]{4}-[A-Fa-f0-9]{4}$/;

export default function Login() {
  const [mode, setMode] = useState('login'); // 'login' | 'activate'
  const [email, setEmail] = useState('');
  const [licenseKey, setLicenseKey] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [deviceName, setDeviceName] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);
  const [showResetHint, setShowResetHint] = useState(false);

  const { applySession } = useAuth();
  const { t } = useLang();
  const navigate = useNavigate();

  const validate = () => {
    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setErrorMsg(t('login.notFound'));
      return false;
    }
    if (!KEY_REGEX.test(licenseKey.trim())) {
      setErrorMsg(t('login.invalidKeyFormat'));
      return false;
    }
    if (!password) {
      setErrorMsg(t('login.password'));
      return false;
    }
    if (mode === 'activate' && password !== confirmPassword) {
      setErrorMsg(t('login.passwordMismatch'));
      return false;
    }
    return true;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg(null);
    setShowResetHint(false);
    if (!validate()) return;

    setLoading(true);

    const call = mode === 'activate'
      ? authApi.activate(email, licenseKey, password, deviceName || navigator.platform)
      : authApi.login(email, licenseKey, password);

    const { ok, data } = await call;
    setLoading(false);

    if (ok && data.success) {
      applySession(data.token, data.license);
      navigate('/app/home');
      return;
    }

    switch (data.error) {
      case 'not_found':
        setErrorMsg(t('login.notFound'));
        break;
      case 'invalid_credentials':
        setErrorMsg(t('login.invalidCredentials'));
        break;
      case 'not_activated':
        setErrorMsg(t('login.notActivated'));
        setMode('activate');
        break;
      case 'already_activated':
        setErrorMsg(t('login.alreadyActivatedMsg'));
        setMode('login');
        break;
      case 'license_inactive':
        setErrorMsg(t('login.licenseInactive'));
        break;
      case 'weak_password':
        setErrorMsg(data.message || t('login.weakPassword'));
        break;
      default:
        setErrorMsg(data.message || t('common.error'));
    }
  };

  const fillBoth = (pwd) => { setPassword(pwd); setConfirmPassword(pwd); };

  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ background: 'var(--bg-base)' }}>
      <div className="w-full max-w-sm">
        <div className="flex justify-center mb-8"><Logo size="lg" /></div>

        <div className="rounded-2xl p-8" style={{ background: 'var(--surface-1)', border: '0.5px solid var(--border)' }}>
          <h1 className="text-xl font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>{t('login.title')}</h1>
          <p className="text-sm mb-6" style={{ color: 'var(--text-secondary)' }}>{t('login.subtitle')}</p>

          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            <Field icon={Mail} type="email" placeholder={t('login.email')} value={email} onChange={setEmail} />

            <Field icon={KeyRound} type="text" placeholder="XXXX-XXXX-XXXX-XXXX" value={licenseKey}
              onChange={(v) => setLicenseKey(v.toUpperCase())} />

            <Field icon={Lock} type={showPwd ? 'text' : 'password'} placeholder={t('login.password')}
              value={password} onChange={setPassword}
              trailing={
                <button type="button" onClick={() => setShowPwd(s => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }}>
                  {showPwd ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              } />

            {mode === 'activate' && (
              <>
                <Field icon={Lock} type={showPwd ? 'text' : 'password'} placeholder={t('login.confirmPassword')}
                  value={confirmPassword} onChange={setConfirmPassword} />
                <PasswordGenerator onGenerate={fillBoth} label={t('login.generator')} />
                <Field type="text" placeholder={t('login.deviceNameOptional')} value={deviceName} onChange={setDeviceName} />
              </>
            )}

            {errorMsg && (
              <div className="text-sm rounded-lg px-3 py-2" style={{ background: 'var(--negative-soft)', color: 'var(--negative)' }}>
                {errorMsg}
              </div>
            )}

            {showResetHint && (
              <Link to="/reset-password" className="text-sm text-center hover:underline" style={{ color: 'var(--accent)' }}>
                {t('login.requestReset')} →
              </Link>
            )}

            <button type="submit" disabled={loading}
              className="mt-2 rounded-lg py-2.5 text-sm font-medium flex items-center justify-center gap-2 transition-opacity disabled:opacity-60"
              style={{ background: 'var(--accent)', color: '#fff' }}>
              {loading && <Loader2 size={16} className="animate-spin" />}
              {mode === 'activate' ? t('login.activateBtn') : t('login.loginBtn')}
            </button>
          </form>

          <button onClick={() => { setMode(m => (m === 'login' ? 'activate' : 'login')); setErrorMsg(null); setConfirmPassword(''); }}
            className="mt-4 text-sm w-full text-center hover:underline" style={{ color: 'var(--text-secondary)' }}>
            {mode === 'login' ? t('login.firstTime') : t('login.alreadyActivated')}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ icon: Icon, type, placeholder, value, onChange, trailing }) {
  return (
    <div className="relative">
      {Icon && <Icon size={16} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />}
      <input type={type} placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)} required
        className={`w-full rounded-lg py-2.5 ${Icon ? 'pl-9' : 'pl-3'} ${trailing ? 'pr-10' : 'pr-3'} text-sm outline-none`}
        style={{ background: 'var(--surface-2)', border: '0.5px solid var(--border-strong)', color: 'var(--text-primary)' }} />
      {trailing}
    </div>
  );
}
