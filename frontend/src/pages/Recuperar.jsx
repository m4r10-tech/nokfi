import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Loader2, KeyRound, Copy, Mail, ShieldCheck, ChevronDown, Lock, ArrowLeft } from 'lucide-react';
import { authApi } from '../middleware/api';
import { apiErrorMessage } from '../middleware/errors';
import { useAuth } from '../context/AuthContext';
import { useLang } from '../context/LangContext';
import { useToast } from '../context/ToastContext';
import { usePageMeta } from '../hooks/usePageMeta';
import { useShake } from '../hooks/useShake';
import AuthShell, { FormMessage } from '../components/AuthShell';
import FormField from '../components/FormField';

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
  const { t } = useLang();
  usePageMeta(t('meta.recoveryTitle'));

  return (
    <AuthShell footer={
      <Link to="/login" className="hover:underline" style={{ color: 'var(--text-secondary)' }}>{t('recovery.backToLogin')} →</Link>
    }>
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-xl font-semibold tracking-tight" style={{ color: 'var(--text-primary)' }}>{t('recovery.title')}</h1>
        <StepDots step={step} label={t('recovery.stepOf').replace('{n}', step)} />
      </div>

      <div key={step} className="anim-fade">
        {step === 1 && (
          <EmailStep email={email} setEmail={setEmail} onSent={() => setStep(2)} />
        )}
        {step === 2 && (
          <CodeStep
            email={email}
            onVerified={(token, ks) => { setRecoveryToken(token); setKeys(ks); setStep(3); }}
            onRestart={() => setStep(1)}
          />
        )}
        {step === 3 && (
          <KeysStep recoveryToken={recoveryToken} keys={keys} />
        )}
      </div>
    </AuthShell>
  );
}

function StepDots({ step, label }) {
  return (
    <div className="flex items-center gap-1.5" role="img" aria-label={label} title={label}>
      {[1, 2, 3].map(n => (
        <span key={n} className="h-1.5 rounded-full" style={{
          width: n === step ? 18 : 6,
          background: n <= step ? 'var(--accent)' : 'var(--border-strong)',
          transition: 'width var(--dur-base) var(--ease-out), background-color var(--dur-base) var(--ease-std)'
        }} />
      ))}
    </div>
  );
}

function EmailStep({ email, setEmail, onSent }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [sent, setSent] = useState(false);
  const [formRef, shake] = useShake();
  const { t } = useLang();

  const submit = async (e) => {
    e.preventDefault();
    if (loading) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) { setError(t('login.invalidEmail')); shake(); return; }
    setLoading(true);
    setError(null);
    const res = await authApi.requestRecovery(email.trim());
    setLoading(false);
    if (res.status !== 200) { setError(apiErrorMessage(t, res)); shake(); return; }
    setSent(true);
    // Anti-enumeración: avanzamos al paso 2 aunque el email no exista — el
    // backend siempre responde igual y el código solo llega si hay cuenta.
    setTimeout(onSent, 1400);
  };

  return (
    <>
      <p className="text-sm mt-1 mb-5" style={{ color: 'var(--text-secondary)' }}>{t('recovery.stepEmailDesc')}</p>
      {sent ? (
        <div className="flex flex-col items-center gap-3 py-4 text-center anim-scale">
          <div className="rounded-full p-3" style={{ background: 'var(--positive-soft)', color: 'var(--positive)' }}><Mail size={24} /></div>
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{t('recovery.sentGeneric')}</p>
        </div>
      ) : (
        <form ref={formRef} onSubmit={submit} noValidate className="flex flex-col gap-4">
          <FormField id="rec-email" label={t('login.email')} icon={Mail} type="email" inputMode="email" autoComplete="email"
            autoCapitalize="none" spellCheck={false} autoFocus placeholder={t('login.emailPlaceholder')}
            value={email} onChange={(e) => setEmail(e.target.value)} invalid={!!error} />
          {error && <FormMessage>{error}</FormMessage>}
          <button type="submit" disabled={loading} className="btn btn-primary w-full">
            {loading && <Loader2 size={16} className="animate-spin" />}
            {t('recovery.sendCode')}
          </button>
        </form>
      )}
    </>
  );
}

function CodeStep({ email, onVerified, onRestart }) {
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [burned, setBurned] = useState(false);
  const [formRef, shake] = useShake();
  const { t } = useLang();

  const submit = async (e) => {
    e.preventDefault();
    if (loading || code.length !== 6) return;
    setLoading(true);
    setError(null);
    const res = await authApi.verifyRecoveryOtp(email, code);
    setLoading(false);
    if (res.status === 200) { onVerified(res.data.recovery_token, res.data.keys || []); return; }
    shake();
    if (res.data.error === 'code_burned') { setBurned(true); setError(t('recovery.codeBurned')); return; }
    if (res.data.error === 'invalid_code') { setError(t('recovery.invalidCode')); setCode(''); return; }
    setError(apiErrorMessage(t, res, 'recovery.invalidCode'));
  };

  return (
    <>
      <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>{t('recovery.stepCodeDesc')}</p>
      <p className="text-xs mt-1.5 mb-5 truncate" style={{ color: 'var(--text-muted)' }}>
        {t('recovery.sentTo')} <strong style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{email}</strong>
      </p>
      <form ref={formRef} onSubmit={submit} noValidate className="flex flex-col gap-4">
        <input required inputMode="numeric" autoComplete="one-time-code" maxLength={6} autoFocus
          aria-label={t('recovery.codePlaceholder')} placeholder="000000" value={code} aria-invalid={!!error || undefined}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
          className="input text-center font-mono !text-2xl tracking-[0.5em] !min-h-[56px]" />
        {error && <FormMessage>{error}</FormMessage>}
        {burned ? (
          <button type="button" onClick={onRestart} className="btn btn-primary w-full">{t('recovery.requestNewCode')}</button>
        ) : (
          <button type="submit" disabled={loading || code.length !== 6} className="btn btn-primary w-full">
            {loading && <Loader2 size={16} className="animate-spin" />}
            {t('recovery.verifyCode')}
          </button>
        )}
      </form>
      {!burned && (
        <button onClick={onRestart} className="mt-4 text-sm inline-flex items-center gap-1 hover:underline" style={{ color: 'var(--text-secondary)' }}>
          <ArrowLeft size={14} /> {t('recovery.changeEmail')}
        </button>
      )}
    </>
  );
}

function KeysStep({ recoveryToken, keys }) {
  const [emailSent, setEmailSent] = useState(false);
  const [sendingKeys, setSendingKeys] = useState(false);
  const [showPwdForm, setShowPwdForm] = useState(false);
  const { t } = useLang();
  const toast = useToast();

  const copyKey = async (key) => {
    try {
      await navigator.clipboard.writeText(key);
      toast.success(t('config.keyCopied'));
    } catch { /* clipboard no disponible */ }
  };

  const sendKeys = async () => {
    setSendingKeys(true);
    const res = await authApi.resendRecoveredKeys(recoveryToken);
    setSendingKeys(false);
    if (res.status === 200) { setEmailSent(true); toast.success(t('recovery.keysSent')); }
    else toast.error(apiErrorMessage(t, res));
  };

  return (
    <div className="flex flex-col gap-4 mt-3">
      <div className="text-center">
        <div className="mx-auto mb-3 w-fit rounded-full p-3" style={{ background: 'var(--positive-soft)', color: 'var(--positive)' }}><ShieldCheck size={24} /></div>
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{t('recovery.stepKeysDesc')}</p>
      </div>

      {keys.map((k, i) => (
        <div key={k.key} className="anim-enter" style={{ '--i': i }}>
          <p className="text-xs font-medium uppercase tracking-wide mb-1.5 flex items-center gap-1.5"
             style={{ color: 'var(--text-muted)' }}>
            <KeyRound size={12} /> {k.plan}
          </p>
          <div className="flex items-center gap-2 rounded-lg pl-3 pr-1.5 py-1.5"
            style={{ background: 'var(--surface-2)', border: '1px solid var(--border-strong)' }}>
            <code className="flex-1 font-mono text-base tracking-wide break-all"
              style={{ color: 'var(--text-primary)' }}>{k.key}</code>
            <button onClick={() => copyKey(k.key)} className="btn btn-ghost btn-sm !px-2.5" aria-label={t('recovery.copy')} title={t('recovery.copy')}>
              <Copy size={16} />
            </button>
          </div>
        </div>
      ))}

      <button onClick={sendKeys} disabled={sendingKeys || emailSent} className="btn btn-secondary w-full">
        {sendingKeys ? <Loader2 size={16} className="animate-spin" /> : <Mail size={16} />}
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

      <Link to="/login" className="btn btn-primary w-full">{t('recovery.goLogin')}</Link>
    </div>
  );
}

function PasswordForm({ recoveryToken, keys }) {
  const [selectedKey, setSelectedKey] = useState(keys[0]?.key || '');
  const [pwd, setPwd] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null); // { msg, field }
  const [formRef, shake] = useShake();
  const { applySession } = useAuth();
  const { t } = useLang();
  const navigate = useNavigate();

  const submit = async (e) => {
    e.preventDefault();
    if (loading) return;
    setError(null);
    if (pwd.length < 8) { setError({ msg: t('login.weakPassword'), field: 'pwd' }); shake(); return; }
    if (pwd !== confirm) { setError({ msg: t('recovery.passwordMismatch'), field: 'confirm' }); shake(); return; }
    setLoading(true);
    const res = await authApi.confirmRecovery(recoveryToken, selectedKey, pwd, navigator.platform);
    setLoading(false);
    if (res.ok && res.data.success) {
      applySession(res.data.token, res.data.license);
      navigate('/app/home');
      return;
    }
    shake();
    setError({ msg: res.data.error === 'weak_password' ? (res.data.message || t('login.weakPassword')) : apiErrorMessage(t, res), field: res.data.error === 'weak_password' ? 'pwd' : null });
  };

  return (
    <form ref={formRef} onSubmit={submit} noValidate className="anim-msg flex flex-col gap-3 rounded-xl p-4"
      style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
      <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{t('recovery.changePwdDesc')}</p>

      {keys.length > 1 && (
        <div className="flex flex-col gap-1.5">
          <p className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>{t('recovery.chooseKey')}</p>
          {keys.map(k => (
            <label key={k.key} className="flex items-center gap-2 rounded-lg px-3 py-2.5 cursor-pointer"
              style={{
                background: selectedKey === k.key ? 'var(--accent-soft)' : 'var(--surface-1)',
                border: `1px solid ${selectedKey === k.key ? 'var(--accent)' : 'var(--border)'}`
              }}>
              <input type="radio" name="recovery-key" checked={selectedKey === k.key}
                onChange={() => setSelectedKey(k.key)} />
              <code className="font-mono text-xs" style={{ color: 'var(--text-primary)' }}>{k.key}</code>
              <span className="text-xs ml-auto" style={{ color: 'var(--text-muted)' }}>{k.plan}</span>
            </label>
          ))}
        </div>
      )}

      <FormField id="rec-pwd" icon={Lock} type="password" autoComplete="new-password" aria-label={t('recovery.newPassword')}
        placeholder={t('recovery.newPassword')} value={pwd} onChange={(e) => setPwd(e.target.value)} invalid={error?.field === 'pwd'} />
      <FormField id="rec-confirm" icon={Lock} type="password" autoComplete="new-password" aria-label={t('recovery.confirmPassword')}
        placeholder={t('recovery.confirmPassword')} value={confirm} onChange={(e) => setConfirm(e.target.value)} invalid={error?.field === 'confirm'} />
      {error && <FormMessage>{error.msg}</FormMessage>}
      <button type="submit" disabled={loading} className="btn btn-primary w-full">
        {loading && <Loader2 size={16} className="animate-spin" />}
        {t('recovery.changePwdBtn')}
      </button>
    </form>
  );
}
