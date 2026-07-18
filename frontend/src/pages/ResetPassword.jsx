import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Loader2, CheckCircle2, Lock, Eye, EyeOff, AlertCircle } from 'lucide-react';
import { authApi } from '../middleware/api';
import { useAuth } from '../context/AuthContext';
import { useLang } from '../context/LangContext';
import Logo from '../components/Logo';

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
  return token ? <ConfirmStep token={token} /> : <RequestStep />;
}

function RequestStep() {
  const [email, setEmail] = useState('');
  const [licenseKey, setLicenseKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);
  const { t } = useLang();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg(null);
    const { status, data } = await authApi.requestPasswordReset(email, licenseKey);
    setLoading(false);

    if (status === 429) { setErrorMsg(data.message); return; }
    setSent(true); // respuesta siempre genérica por diseño anti-enumeración
  };

  return (
    <Shell>
      <h1 className="text-xl font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>{t('resetPassword.title')}</h1>

      {sent ? (
        <div className="flex flex-col items-center gap-3 py-6 text-center">
          <CheckCircle2 size={40} style={{ color: 'var(--positive)' }} />
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{t('resetPassword.sent')}</p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col gap-3 mt-4">
          <input required type="email" placeholder={t('resetPassword.email')} value={email}
            onChange={(e) => setEmail(e.target.value)} style={inputStyle} />
          <input required type="text" placeholder="XXXX-XXXX-XXXX-XXXX" value={licenseKey}
            onChange={(e) => setLicenseKey(e.target.value.toUpperCase())} style={inputStyle} />
          {errorMsg && (
            <div className="text-sm rounded-lg px-3 py-2" style={{ background: 'var(--negative-soft)', color: 'var(--negative)' }}>{errorMsg}</div>
          )}
          <button type="submit" disabled={loading}
            className="mt-2 rounded-lg py-2.5 text-sm font-medium flex items-center justify-center gap-2 disabled:opacity-60"
            style={{ background: 'var(--accent)', color: '#fff' }}>
            {loading && <Loader2 size={16} className="animate-spin" />}
            {t('resetPassword.submitConfirm')}
          </button>
        </form>
      )}
    </Shell>
  );
}

function ConfirmStep({ token }) {
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [localError, setLocalError] = useState(null);
  const [status, setStatus] = useState('idle'); // idle | confirming | success | error
  const [errorMsg, setErrorMsg] = useState(null);
  const { applySession } = useAuth();
  const { t } = useLang();
  const navigate = useNavigate();

  const submit = async (e) => {
    e.preventDefault();
    setLocalError(null);
    if (!newPassword) { setLocalError(t('login.password')); return; }
    if (newPassword !== confirm) { setLocalError(t('login.passwordMismatch')); return; }
    setStatus('confirming');
    const { ok, data } = await authApi.confirmPasswordReset(token, newPassword, navigator.platform);
    if (ok && data.success) {
      applySession(data.token, data.license);
      setStatus('success');
      setTimeout(() => navigate('/app/home'), 1500);
    } else {
      setStatus('error');
      setErrorMsg(data.message || t('resetPassword.invalidToken'));
    }
  };

  return (
    <Shell>
      <h1 className="text-xl font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>{t('resetPassword.confirmTitle')}</h1>

      {status === 'success' && (
        <div className="flex flex-col items-center gap-3 py-6 text-center">
          <CheckCircle2 size={40} style={{ color: 'var(--positive)' }} />
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{t('resetPassword.success')}</p>
        </div>
      )}

      {status === 'error' && (
        <div className="flex flex-col items-center gap-3 py-6 text-center">
          <AlertCircle size={40} style={{ color: 'var(--negative)' }} />
          <p className="text-sm rounded-lg px-3 py-2" style={{ background: 'var(--negative-soft)', color: 'var(--negative)' }}>{errorMsg}</p>
        </div>
      )}

      {(status === 'idle' || status === 'confirming') && (
        <form onSubmit={submit} className="flex flex-col gap-3 mt-4">
          <PasswordInput icon placeholder={t('login.newPassword')} value={newPassword}
            onChange={setNewPassword} show={showPwd} toggle={setShowPwd} />
          <PasswordInput icon placeholder={t('login.confirmPassword')} value={confirm}
            onChange={setConfirm} show={showPwd} toggle={setShowPwd} />
          {localError && (
            <div className="text-sm rounded-lg px-3 py-2" style={{ background: 'var(--negative-soft)', color: 'var(--negative)' }}>{localError}</div>
          )}
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{t('resetPassword.noGeneratorHint')}</p>
          <button type="submit" disabled={status === 'confirming'}
            className="mt-2 rounded-lg py-2.5 text-sm font-medium flex items-center justify-center gap-2 disabled:opacity-60"
            style={{ background: 'var(--accent)', color: '#fff' }}>
            {status === 'confirming' && <Loader2 size={16} className="animate-spin" />}
            {t('resetPassword.submit')}
          </button>
        </form>
      )}
    </Shell>
  );
}

function PasswordInput({ placeholder, value, onChange, show, toggle }) {
  return (
    <div className="relative">
      <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
      <input type={show ? 'text' : 'password'} placeholder={placeholder} value={value}
        onChange={(e) => onChange(e.target.value)} required
        className="w-full rounded-lg py-2.5 pl-9 pr-10 text-sm outline-none"
        style={{ background: 'var(--surface-2)', border: '0.5px solid var(--border-strong)', color: 'var(--text-primary)' }} />
      <button type="button" onClick={() => toggle(!show)}
        className="absolute right-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }}>
        {show ? <EyeOff size={16} /> : <Eye size={16} />}
      </button>
    </div>
  );
}

function Shell({ children }) {
  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ background: 'var(--bg-base)' }}>
      <div className="w-full max-w-sm">
        <div className="flex justify-center mb-8"><Logo size="lg" /></div>
        <div className="rounded-2xl p-8" style={{ background: 'var(--surface-1)', border: '0.5px solid var(--border)' }}>
          {children}
        </div>
      </div>
    </div>
  );
}

const inputStyle = {
  width: '100%', borderRadius: '8px', padding: '10px 12px', fontSize: '14px',
  background: 'var(--surface-2)', border: '0.5px solid var(--border-strong)', color: 'var(--text-primary)', outline: 'none'
};
