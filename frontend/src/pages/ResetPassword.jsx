import { useState } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { Loader2, CheckCircle2, Lock, Eye, EyeOff, AlertCircle, Mail, KeyRound } from 'lucide-react';
import { authApi } from '../middleware/api';
import { apiErrorMessage } from '../middleware/errors';
import { useAuth } from '../context/AuthContext';
import { useLang } from '../context/LangContext';
import AuthShell, { FormMessage } from '../components/AuthShell';
import FormField from '../components/FormField';
import { useShake } from '../hooks/useShake';
import { formatLicenseKey, KEY_REGEX, EMAIL_REGEX } from '../utils/license';
import { usePageMeta } from '../hooks/usePageMeta';

/**
 * /reset-password (?token=... en el paso de confirmación)
 *
 * Paso 1 (Request): el usuario introduce email + clave → backend envía email.
 * Paso 2 (Confirm): la URL del email lleva ?token=… → el usuario elige nueva
 *   contraseña (+ confirmación). NO se incluye el generador de contraseñas
 *   en el reset por email (plan C4=b: el generador vive en activar/cambiar).
 */
export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const { t } = useLang();
  usePageMeta(t('meta.resetTitle'));
  return (
    <AuthShell footer={
      <Link to="/login" className="hover:underline" style={{ color: 'var(--text-secondary)' }}>{t('recovery.backToLogin')} →</Link>
    }>
      {token ? <ConfirmStep token={token} /> : <RequestStep />}
    </AuthShell>
  );
}

function RequestStep() {
  const [email, setEmail] = useState('');
  const [licenseKey, setLicenseKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState(null); // { msg, field }
  const [formRef, shake] = useShake();
  const { t } = useLang();

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (loading) return;
    setError(null);
    if (!EMAIL_REGEX.test(email.trim())) { setError({ msg: t('login.invalidEmail'), field: 'email' }); shake(); return; }
    if (!KEY_REGEX.test(licenseKey)) { setError({ msg: t('login.invalidKeyFormat'), field: 'key' }); shake(); return; }
    setLoading(true);
    const res = await authApi.requestPasswordReset(email.trim(), licenseKey);
    setLoading(false);

    // Respuesta siempre genérica por diseño anti-enumeración: solo los
    // límites (429) y los fallos de red/servidor se muestran como error.
    if (res.status === 429 || res.status === 0 || res.status >= 500) {
      setError({ msg: apiErrorMessage(t, res) }); shake(); return;
    }
    setSent(true);
  };

  return (
    <>
      <h1 className="text-xl font-semibold tracking-tight" style={{ color: 'var(--text-primary)' }}>{t('resetPassword.title')}</h1>

      {sent ? (
        <div className="flex flex-col items-center gap-3 py-6 text-center anim-scale">
          <div className="rounded-full p-3" style={{ background: 'var(--positive-soft)', color: 'var(--positive)' }}><CheckCircle2 size={26} /></div>
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{t('resetPassword.sent')}</p>
        </div>
      ) : (
        <>
          <p className="text-sm mt-1 mb-5" style={{ color: 'var(--text-secondary)' }}>{t('resetPassword.requestDesc')}</p>
          <form ref={formRef} onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
            <FormField id="rp-email" label={t('login.email')} icon={Mail} type="email" inputMode="email" autoComplete="email"
              autoCapitalize="none" spellCheck={false} placeholder={t('login.emailPlaceholder')}
              value={email} onChange={(e) => setEmail(e.target.value)} invalid={error?.field === 'email'} />
            <FormField id="rp-key" label={t('login.licenseKey')} icon={KeyRound} type="text" autoComplete="off"
              autoCapitalize="characters" spellCheck={false} maxLength={19} placeholder="XXXX-XXXX-XXXX-XXXX"
              inputClassName="font-mono tracking-wider" value={licenseKey}
              onChange={(e) => setLicenseKey(formatLicenseKey(e.target.value))} invalid={error?.field === 'key'} />
            {error && <FormMessage>{error.msg}</FormMessage>}
            <button type="submit" disabled={loading} className="btn btn-primary w-full mt-1">
              {loading && <Loader2 size={16} className="animate-spin" />}
              {t('resetPassword.submit')}
            </button>
          </form>
          <p className="text-xs mt-4 text-center" style={{ color: 'var(--text-muted)' }}>
            {t('resetPassword.noKeyHint')} <Link to="/recuperar" className="link">{t('resetPassword.noKeyLink')}</Link>
          </p>
        </>
      )}
    </>
  );
}

function ConfirmStep({ token }) {
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [localError, setLocalError] = useState(null); // { msg, field }
  const [status, setStatus] = useState('idle'); // idle | confirming | success | error
  const [errorMsg, setErrorMsg] = useState(null);
  const [formRef, shake] = useShake();
  const { applySession } = useAuth();
  const { t } = useLang();
  const navigate = useNavigate();

  const submit = async (e) => {
    e.preventDefault();
    if (status === 'confirming') return;
    setLocalError(null);
    if (newPassword.length < 8) { setLocalError({ msg: t('login.weakPassword'), field: 'pwd' }); shake(); return; }
    if (newPassword !== confirm) { setLocalError({ msg: t('login.passwordMismatch'), field: 'confirm' }); shake(); return; }
    setStatus('confirming');
    const res = await authApi.confirmPasswordReset(token, newPassword, navigator.platform);
    if (res.ok && res.data.success) {
      applySession(res.data.token, res.data.license);
      setStatus('success');
      setTimeout(() => navigate('/app/home'), 1500);
      return;
    }
    // Contraseña rechazada o fallo de red: el enlace sigue sirviendo → se
    // queda en el formulario. Solo un token inválido/caducado es terminal.
    if (res.data.error === 'weak_password') {
      setStatus('idle'); setLocalError({ msg: res.data.message || t('login.weakPassword'), field: 'pwd' }); shake(); return;
    }
    if (res.status === 0 || res.status >= 500 || res.status === 429) {
      setStatus('idle'); setLocalError({ msg: apiErrorMessage(t, res) }); shake(); return;
    }
    setStatus('error');
    setErrorMsg(res.data.error === 'invalid_or_expired_token' ? t('resetPassword.invalidToken') : apiErrorMessage(t, res, 'resetPassword.invalidToken'));
  };

  const eye = (
    <button type="button" onClick={() => setShowPwd(s => !s)} aria-label={t(showPwd ? 'login.hidePassword' : 'login.showPassword')}
      className="absolute right-1 top-1/2 -translate-y-1/2 w-9 h-9 grid place-items-center rounded-md" style={{ color: 'var(--text-muted)' }}>
      {showPwd ? <EyeOff size={16} /> : <Eye size={16} />}
    </button>
  );

  return (
    <>
      <h1 className="text-xl font-semibold tracking-tight mb-5" style={{ color: 'var(--text-primary)' }}>{t('resetPassword.confirmTitle')}</h1>

      {status === 'success' && (
        <div className="flex flex-col items-center gap-3 py-6 text-center anim-scale">
          <div className="rounded-full p-3" style={{ background: 'var(--positive-soft)', color: 'var(--positive)' }}><CheckCircle2 size={26} /></div>
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{t('resetPassword.success')}</p>
        </div>
      )}

      {status === 'error' && (
        <div className="flex flex-col items-center gap-3 py-4 text-center anim-scale">
          <div className="rounded-full p-3" style={{ background: 'var(--negative-soft)', color: 'var(--negative)' }}><AlertCircle size={26} /></div>
          <p role="alert" className="text-sm" style={{ color: 'var(--text-secondary)' }}>{errorMsg}</p>
          <Link to="/reset-password" className="btn btn-secondary btn-sm mt-1">{t('resetPassword.requestNew')}</Link>
        </div>
      )}

      {(status === 'idle' || status === 'confirming') && (
        <form ref={formRef} onSubmit={submit} noValidate className="flex flex-col gap-4">
          <FormField id="rp-new" label={t('login.newPassword')} icon={Lock} type={showPwd ? 'text' : 'password'} autoComplete="new-password"
            placeholder={t('login.newPasswordPlaceholder')} value={newPassword} onChange={(e) => setNewPassword(e.target.value)}
            invalid={localError?.field === 'pwd'} trailing={eye} autoFocus />
          <FormField id="rp-confirm" label={t('login.confirmPassword')} icon={Lock} type={showPwd ? 'text' : 'password'} autoComplete="new-password"
            placeholder={t('login.confirmPlaceholder')} value={confirm} onChange={(e) => setConfirm(e.target.value)}
            invalid={localError?.field === 'confirm'} />
          {localError && <FormMessage>{localError.msg}</FormMessage>}
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{t('resetPassword.noGeneratorHint')}</p>
          <button type="submit" disabled={status === 'confirming'} className="btn btn-primary w-full">
            {status === 'confirming' && <Loader2 size={16} className="animate-spin" />}
            {t('resetPassword.submitConfirm')}
          </button>
        </form>
      )}
    </>
  );
}
