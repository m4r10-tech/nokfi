import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Loader2, KeyRound, Copy, Check, Mail, ShieldCheck, ChevronDown } from 'lucide-react';
import { authApi } from '../middleware/api';
import { useAuth } from '../context/AuthContext';
import { useLang } from '../context/LangContext';
import { usePageMeta } from '../hooks/usePageMeta';
import Logo from '../components/Logo';

/**
 * /recuperar — Recuperación de acceso con OTP (olvido de clave y/o contraseña).
 *
 * 3 pasos:
 *   1. Email → el backend envía un código de 6 dígitos (respuesta genérica
 *      anti-enumeración: la UI avanza siempre al paso 2).
 *   2. Código → verificación (máx. 5 intentos; quemado → volver al paso 1).
 *   3. Claves → se muestran las claves activas del email, con copiar y
 *      reenvío por email, y un bloque OPCIONAL para cambiar la contraseña
 *      (consume el recovery_token y entra con sesión iniciada).
 *
 * El flujo clásico de reset por enlace (/reset-password) sigue intacto para
 * quien recuerda su clave — esta página no lo sustituye, cubre el caso en el
 * que la clave también se ha perdido.
 */
export default function Recuperar() {
  const [step, setStep] = useState(1); // 1=email | 2=código | 3=claves
  const [email, setEmail] = useState('');
  const [recoveryToken, setRecoveryToken] = useState(null);
  const [keys, setKeys] = useState([]);
  const [error, setError] = useState(null);
  const [burned, setBurned] = useState(false);
  const { t } = useLang();
  usePageMeta(t('meta.recoveryTitle'));

  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ background: 'var(--bg-base)' }}>
      <div className="w-full max-w-sm">
        <div className="flex justify-center mb-8"><Logo size="lg" /></div>
        <div className="rounded-2xl p-8" style={{ background: 'var(--surface-1)', border: '0.5px solid var(--border)' }}>
          <h1 className="text-xl font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>{t('recovery.title')}</h1>

          {step === 1 && (
            <EmailStep
              email={email} setEmail={setEmail}
              onSent={() => { setStep(2); setError(null); setBurned(false); }}
            />
          )}

          {step === 2 && (
            <CodeStep
              email={email}
              error={error} setError={setError}
              burned={burned} setBurned={setBurned}
              onVerified={(token, ks) => { setRecoveryToken(token); setKeys(ks); setStep(3); }}
              onRestart={() => setStep(1)}
            />
          )}

          {step === 3 && (
            <KeysStep email={email} recoveryToken={recoveryToken} keys={keys} />
          )}
        </div>

        <Link to="/login" className="mt-5 text-sm text-center hover:underline block" style={{ color: 'var(--text-secondary)' }}>
          {t('recovery.backToLogin')} →
        </Link>
      </div>
    </div>
  );
}

function EmailStep({ email, setEmail, onSent }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [sent, setSent] = useState(false);
  const { t } = useLang();

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const { status, data } = await authApi.requestRecovery(email.trim());
    setLoading(false);
    if (status === 429) { setError(data.message); return; }
    if (status !== 200) { setError(data.message || t('common.error')); return; }
    setSent(true);
    // Anti-enumeración: avanzamos al paso 2 aunque el email no exista — el
    // backend siempre responde igual y el código solo llega si hay cuenta.
    setTimeout(onSent, 1200);
  };

  return (
    <>
      <p className="text-sm mb-4" style={{ color: 'var(--text-secondary)' }}>{t('recovery.stepEmailDesc')}</p>
      {sent ? (
        <div className="flex flex-col items-center gap-3 py-4 text-center">
          <Mail size={36} style={{ color: 'var(--positive)' }} />
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{t('recovery.sentGeneric')}</p>
        </div>
      ) : (
        <form onSubmit={submit} className="flex flex-col gap-3 mt-2">
          <input required type="email" placeholder={t('recovery.emailPlaceholder')} value={email}
            onChange={(e) => setEmail(e.target.value)} style={inputStyle} />
          {error && <ErrorBox>{error}</ErrorBox>}
          <button type="submit" disabled={loading}
            className="mt-1 rounded-lg py-2.5 text-sm font-medium flex items-center justify-center gap-2 disabled:opacity-60"
            style={{ background: 'var(--accent)', color: '#fff' }}>
            {loading && <Loader2 size={16} className="animate-spin" />}
            {t('recovery.sendCode')}
          </button>
        </form>
      )}
    </>
  );
}

function CodeStep({ email, error, setError, burned, setBurned, onVerified, onRestart }) {
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const { t } = useLang();

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const { status, data } = await authApi.verifyRecoveryOtp(email, code);
    setLoading(false);
    if (status === 200) { onVerified(data.recovery_token, data.keys || []); return; }
    if (data.error === 'code_burned') { setBurned(true); setError(data.message); return; }
    setError(data.message || t('recovery.invalidCode'));
  };

  return (
    <>
      <p className="text-sm mb-4" style={{ color: 'var(--text-secondary)' }}>{t('recovery.stepCodeDesc')}</p>
      <form onSubmit={submit} className="flex flex-col gap-3 mt-2">
        <input required inputMode="numeric" autoComplete="one-time-code" maxLength={6}
          placeholder={t('recovery.codePlaceholder')} value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
          style={{ ...inputStyle, textAlign: 'center', fontFamily: 'monospace', fontSize: '22px', letterSpacing: '6px' }} />
        {error && <ErrorBox>{error}</ErrorBox>}
        {burned ? (
          <button type="button" onClick={onRestart}
            className="mt-1 rounded-lg py-2.5 text-sm font-medium"
            style={{ background: 'var(--accent)', color: '#fff' }}>
            {t('recovery.requestNewCode')}
          </button>
        ) : (
          <button type="submit" disabled={loading || code.length !== 6}
            className="mt-1 rounded-lg py-2.5 text-sm font-medium flex items-center justify-center gap-2 disabled:opacity-60"
            style={{ background: 'var(--accent)', color: '#fff' }}>
            {loading && <Loader2 size={16} className="animate-spin" />}
            {t('recovery.verifyCode')}
          </button>
        )}
      </form>
    </>
  );
}

function KeysStep({ recoveryToken, keys }) {
  const [copiedIdx, setCopiedIdx] = useState(null);
  const [emailSent, setEmailSent] = useState(false);
  const [sendingKeys, setSendingKeys] = useState(false);
  const [showPwdForm, setShowPwdForm] = useState(false);
  const { t } = useLang();

  const copyKey = async (key, i) => {
    try {
      await navigator.clipboard.writeText(key);
      setCopiedIdx(i);
      setTimeout(() => setCopiedIdx(null), 2000);
    } catch { /* clipboard no disponible */ }
  };

  const sendKeys = async () => {
    setSendingKeys(true);
    const { status } = await authApi.resendRecoveredKeys(recoveryToken);
    setSendingKeys(false);
    if (status === 200) setEmailSent(true);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="text-center">
        <ShieldCheck size={36} className="mx-auto mb-2" style={{ color: 'var(--positive)' }} />
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{t('recovery.stepKeysDesc')}</p>
      </div>

      {keys.map((k, i) => (
        <div key={k.key}>
          <p className="text-xs font-medium uppercase tracking-wide mb-1.5 flex items-center gap-1.5"
             style={{ color: 'var(--text-muted)' }}>
            <KeyRound size={12} /> {k.plan}
          </p>
          <div className="flex items-center gap-2 rounded-lg px-3 py-3"
            style={{ background: 'var(--surface-2)', border: '0.5px solid var(--border-strong)' }}>
            <code className="flex-1 font-mono text-base tracking-wide break-all"
              style={{ color: 'var(--text-primary)' }}>{k.key}</code>
            <button onClick={() => copyKey(k.key, i)}
              className="shrink-0 rounded-md p-2 transition-colors"
              style={{ background: 'var(--surface-1)', color: copiedIdx === i ? 'var(--positive)' : 'var(--text-secondary)' }}
              title={copiedIdx === i ? t('recovery.copied') : t('recovery.copy')}>
              {copiedIdx === i ? <Check size={16} /> : <Copy size={16} />}
            </button>
          </div>
        </div>
      ))}

      <button onClick={sendKeys} disabled={sendingKeys || emailSent}
        className="rounded-lg py-2.5 text-sm font-medium flex items-center justify-center gap-2 disabled:opacity-60"
        style={{ background: 'var(--surface-2)', color: 'var(--text-primary)', border: '0.5px solid var(--border-strong)' }}>
        {sendingKeys && <Loader2 size={16} className="animate-spin" />}
        {emailSent ? t('recovery.keysSent') : t('recovery.sendKeysEmail')}
      </button>

      {/* Cambio de contraseña opcional — consume el recovery_token */}
      {!showPwdForm ? (
        <button onClick={() => setShowPwdForm(true)}
          className="text-sm flex items-center justify-center gap-1 hover:underline"
          style={{ color: 'var(--text-secondary)' }}>
          {t('recovery.changePwdTitle')} <ChevronDown size={14} />
        </button>
      ) : (
        <PasswordForm recoveryToken={recoveryToken} keys={keys} />
      )}

      <Link to="/login" className="text-sm text-center hover:underline" style={{ color: 'var(--accent)' }}>
        {t('recovery.goLogin')} →
      </Link>
    </div>
  );
}

function PasswordForm({ recoveryToken, keys }) {
  const [selectedKey, setSelectedKey] = useState(keys[0]?.key || '');
  const [pwd, setPwd] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const { applySession } = useAuth();
  const { t } = useLang();
  const navigate = useNavigate();

  const submit = async (e) => {
    e.preventDefault();
    setError(null);
    if (pwd !== confirm) { setError(t('recovery.passwordMismatch')); return; }
    setLoading(true);
    const { ok, data } = await authApi.confirmRecovery(recoveryToken, selectedKey, pwd, navigator.platform);
    setLoading(false);
    if (ok && data.success) {
      applySession(data.token, data.license);
      navigate('/app/home');
      return;
    }
    setError(data.message || t('common.error'));
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-3 rounded-lg p-4"
      style={{ background: 'var(--surface-2)', border: '0.5px solid var(--border)' }}>
      <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{t('recovery.changePwdDesc')}</p>

      {keys.length > 1 && (
        <div className="flex flex-col gap-1.5">
          <p className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>{t('recovery.chooseKey')}</p>
          {keys.map(k => (
            <label key={k.key} className="flex items-center gap-2 rounded-lg px-3 py-2 cursor-pointer"
              style={{
                background: selectedKey === k.key ? 'var(--accent-soft)' : 'var(--surface-1)',
                border: `0.5px solid ${selectedKey === k.key ? 'var(--accent)' : 'var(--border)'}`
              }}>
              <input type="radio" name="recovery-key" checked={selectedKey === k.key}
                onChange={() => setSelectedKey(k.key)} />
              <code className="font-mono text-xs" style={{ color: 'var(--text-primary)' }}>{k.key}</code>
              <span className="text-xs ml-auto" style={{ color: 'var(--text-muted)' }}>{k.plan}</span>
            </label>
          ))}
        </div>
      )}

      <input required type="password" minLength={8} placeholder={t('recovery.newPassword')} value={pwd}
        onChange={(e) => setPwd(e.target.value)} style={inputStyle} />
      <input required type="password" minLength={8} placeholder={t('recovery.confirmPassword')} value={confirm}
        onChange={(e) => setConfirm(e.target.value)} style={inputStyle} />
      {error && <ErrorBox>{error}</ErrorBox>}
      <button type="submit" disabled={loading}
        className="rounded-lg py-2.5 text-sm font-medium flex items-center justify-center gap-2 disabled:opacity-60"
        style={{ background: 'var(--accent)', color: '#fff' }}>
        {loading && <Loader2 size={16} className="animate-spin" />}
        {t('recovery.changePwdBtn')}
      </button>
    </form>
  );
}

function ErrorBox({ children }) {
  return (
    <div className="text-sm rounded-lg px-3 py-2" style={{ background: 'var(--negative-soft)', color: 'var(--negative)' }}>
      {children}
    </div>
  );
}

const inputStyle = {
  width: '100%', borderRadius: '8px', padding: '10px 12px', fontSize: '14px',
  background: 'var(--surface-2)', border: '0.5px solid var(--border-strong)', color: 'var(--text-primary)', outline: 'none'
};
