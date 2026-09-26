import { useState, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { KeyRound, Mail, Lock, Eye, EyeOff, Loader2, Laptop } from 'lucide-react';
import { authApi } from '../middleware/api';
import { apiErrorMessage } from '../middleware/errors';
import { useAuth } from '../context/AuthContext';
import { useLang } from '../context/LangContext';
import PasswordGenerator from '../components/PasswordGenerator';
import AuthShell, { FormMessage } from '../components/AuthShell';
import FormField from '../components/FormField';
import { useShake } from '../hooks/useShake';
import { formatLicenseKey, KEY_REGEX, EMAIL_REGEX } from '../utils/license';
import { usePageMeta } from '../hooks/usePageMeta';

/**
 * /login — inicio de sesión y activación inicial (primera contraseña).
 * Sesión 3, Tanda L: labels visibles con placeholders de ejemplo, clave con
 * formato automático, error concreto por código del backend, shake sutil del
 * formulario + borde rojo en el campo que falla (y foco en él).
 */
export default function Login() {
  const [mode, setMode] = useState('login'); // 'login' | 'activate'
  const [email, setEmail] = useState('');
  const [licenseKey, setLicenseKey] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [deviceName, setDeviceName] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null); // { msg, fields: [], support? }
  const [showResetHint, setShowResetHint] = useState(false);
  const [formRef, shake] = useShake();
  const refs = { email: useRef(null), key: useRef(null), password: useRef(null), confirm: useRef(null) };

  const { applySession } = useAuth();
  const { t } = useLang();
  const navigate = useNavigate();
  usePageMeta(t('meta.loginTitle'));

  const fail = (msg, fields = [], extra = {}) => {
    setError({ msg, fields, ...extra });
    shake();
    if (fields[0]) refs[fields[0]]?.current?.focus();
  };
  const invalid = (f) => !!error?.fields?.includes(f);

  const validate = () => {
    if (!EMAIL_REGEX.test(email.trim())) return fail(t('login.invalidEmail'), ['email']), false;
    if (!KEY_REGEX.test(licenseKey.trim())) return fail(t('login.invalidKeyFormat'), ['key']), false;
    if (!password) return fail(t('login.passwordRequired'), ['password']), false;
    if (mode === 'activate' && password !== confirmPassword) return fail(t('login.passwordMismatch'), ['confirm']), false;
    return true;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (loading) return;
    setError(null);
    setShowResetHint(false);
    if (!validate()) return;

    setLoading(true);
    const res = mode === 'activate'
      ? await authApi.activate(email.trim(), licenseKey, password, deviceName || navigator.platform)
      : await authApi.login(email.trim(), licenseKey, password);
    setLoading(false);
    const { ok, data } = res;

    if (ok && data.success) {
      applySession(data.token, data.license);
      navigate('/app/home');
      return;
    }

    switch (data.error) {
      case 'not_found':
        fail(t('login.notFound'), ['email', 'key']);
        break;
      case 'invalid_credentials':
        // #19 (sesión 2): si el par email+clave es válido pero la contraseña
        // falla, el enlace directo a restablecerla es justo lo que hace falta.
        fail(t('login.invalidCredentials'), ['password']);
        if (mode === 'login') setShowResetHint(true);
        break;
      case 'not_activated':
        setMode('activate');
        setError({ msg: t('login.notActivated'), fields: [], tone: 'accent' });
        setTimeout(() => refs.confirm.current?.focus(), 50);
        break;
      case 'already_activated':
        setMode('login');
        setError({ msg: t('login.alreadyActivatedMsg'), fields: [], tone: 'accent' });
        break;
      case 'license_inactive':
        fail(t('errors.license_inactive'), [], { support: true });
        break;
      case 'weak_password':
        fail(data.message || t('login.weakPassword'), ['password']);
        break;
      default:
        fail(apiErrorMessage(t, res));
    }
  };

  const switchMode = () => {
    setMode(m => (m === 'login' ? 'activate' : 'login'));
    setError(null); setShowResetHint(false); setConfirmPassword('');
  };
  const fillBoth = (pwd) => { setPassword(pwd); setConfirmPassword(pwd); setShowPwd(true); };

  const eye = (
    <button type="button" onClick={() => setShowPwd(s => !s)} aria-label={t(showPwd ? 'login.hidePassword' : 'login.showPassword')}
      className="absolute right-1 top-1/2 -translate-y-1/2 w-9 h-9 grid place-items-center rounded-md" style={{ color: 'var(--text-muted)' }}>
      {showPwd ? <EyeOff size={16} /> : <Eye size={16} />}
    </button>
  );

  return (
    <AuthShell footer={<>
      <Link to="/recuperar" className="hover:underline" style={{ color: 'var(--text-secondary)' }}>{t('login.forgotKey')} →</Link>
      <Link to="/pricing" className="hover:underline" style={{ color: 'var(--text-secondary)' }}>{t('login.noLicense')} →</Link>
    </>}>
      <h1 className="text-xl font-semibold tracking-tight" style={{ color: 'var(--text-primary)' }}>
        {mode === 'activate' ? t('login.activateTitle') : t('login.title')}
      </h1>
      <p className="text-sm mt-1 mb-6" style={{ color: 'var(--text-secondary)' }}>
        {mode === 'activate' ? t('login.activateSubtitle') : t('login.subtitle')}
      </p>

      <form ref={formRef} onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
        <FormField ref={refs.email} id="login-email" label={t('login.email')} icon={Mail} type="email" inputMode="email"
          autoComplete="email" autoCapitalize="none" spellCheck={false} placeholder={t('login.emailPlaceholder')}
          value={email} onChange={(e) => setEmail(e.target.value)} invalid={invalid('email')} />

        <FormField ref={refs.key} id="login-key" label={t('login.licenseKey')} icon={KeyRound} type="text"
          autoComplete="off" autoCapitalize="characters" spellCheck={false} maxLength={19}
          placeholder="XXXX-XXXX-XXXX-XXXX" inputClassName="font-mono tracking-wider"
          value={licenseKey} onChange={(e) => setLicenseKey(formatLicenseKey(e.target.value))} invalid={invalid('key')} />

        <FormField ref={refs.password} id="login-password" label={mode === 'activate' ? t('login.choosePassword') : t('login.password')}
          hint={mode === 'login' && (
            <Link to="/recuperar" className="text-xs hover:underline" style={{ color: 'var(--text-secondary)' }}>{t('login.forgotShort')}</Link>
          )}
          icon={Lock} type={showPwd ? 'text' : 'password'}
          autoComplete={mode === 'activate' ? 'new-password' : 'current-password'}
          placeholder={mode === 'activate' ? t('login.newPasswordPlaceholder') : t('login.passwordPlaceholder')}
          value={password} onChange={(e) => setPassword(e.target.value)} invalid={invalid('password')} trailing={eye} />

        {mode === 'activate' && (
          <div className="flex flex-col gap-4 anim-msg">
            <FormField ref={refs.confirm} id="login-confirm" label={t('login.confirmPassword')} icon={Lock}
              type={showPwd ? 'text' : 'password'} autoComplete="new-password" placeholder={t('login.confirmPlaceholder')}
              value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} invalid={invalid('confirm')} />
            <PasswordGenerator onGenerate={fillBoth} label={t('login.generator')} />
            <FormField id="login-device" label={t('login.deviceNameOptional')} icon={Laptop} type="text" autoComplete="off"
              placeholder={t('login.devicePlaceholder')} value={deviceName} onChange={(e) => setDeviceName(e.target.value)} />
          </div>
        )}

        {error && (
          <FormMessage tone={error.tone || 'negative'}>
            {error.msg}
            {error.support && (
              <a href="mailto:soporte@nokfi.app?subject=Licencia%20Nokfi" className="block mt-1 font-medium underline">soporte@nokfi.app</a>
            )}
          </FormMessage>
        )}

        {showResetHint && (
          <Link to="/reset-password" className="anim-msg text-sm text-center hover:underline -mt-1" style={{ color: 'var(--accent-text)' }}>
            {t('login.requestReset')} →
          </Link>
        )}

        <button type="submit" disabled={loading} className="btn btn-primary w-full mt-1">
          {loading && <Loader2 size={16} className="animate-spin" />}
          {mode === 'activate' ? t('login.activateBtn') : t('login.loginBtn')}
        </button>
      </form>

      <div className="mt-5 pt-5 text-center text-sm" style={{ borderTop: '1px solid var(--border)' }}>
        <button onClick={switchMode} className="hover:underline" style={{ color: 'var(--text-secondary)' }}>
          {mode === 'login' ? t('login.firstTime') : t('login.alreadyActivated')}
        </button>
      </div>
    </AuthShell>
  );
}
