import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Loader2, CheckCircle2 } from 'lucide-react';
import { authApi } from '../middleware/api';
import { getDeviceFingerprint } from '../middleware/fingerprint';
import { useAuth } from '../context/AuthContext';
import { useLang } from '../context/LangContext';
import Logo from '../components/Logo';

export default function ResetDevice() {
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
    const { status, data } = await authApi.requestDeviceReset(email, licenseKey);
    setLoading(false);

    if (status === 429) { setErrorMsg(data.message); return; }
    setSent(true); // respuesta siempre genérica por diseño anti-enumeración
  };

  return (
    <Shell>
      <h1 className="text-xl font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>{t('resetDevice.title')}</h1>

      {sent ? (
        <div className="flex flex-col items-center gap-3 py-6 text-center">
          <CheckCircle2 size={40} style={{ color: 'var(--positive)' }} />
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{t('resetDevice.sent')}</p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col gap-3 mt-4">
          <input required type="email" placeholder={t('resetDevice.email')} value={email}
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
            {t('resetDevice.submit')}
          </button>
        </form>
      )}
    </Shell>
  );
}

function ConfirmStep({ token }) {
  const [status, setStatus] = useState('confirming'); // confirming | success | error
  const [errorMsg, setErrorMsg] = useState(null);
  const { applySession } = useAuth();
  const { t } = useLang();
  const navigate = useNavigate();

  useEffect(() => {
    (async () => {
      const fingerprint = await getDeviceFingerprint();
      const { ok, data } = await authApi.confirmDeviceReset(token, fingerprint, navigator.platform);
      if (ok && data.success) {
        applySession(data.token, data.license);
        setStatus('success');
        setTimeout(() => navigate('/app/home'), 1500);
      } else {
        setStatus('error');
        setErrorMsg(data.message || t('resetDevice.invalidToken'));
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  return (
    <Shell>
      <h1 className="text-xl font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>{t('resetDevice.confirmTitle')}</h1>
      <div className="flex flex-col items-center gap-3 py-6 text-center">
        {status === 'confirming' && (
          <>
            <Loader2 size={32} className="animate-spin" style={{ color: 'var(--accent)' }} />
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{t('resetDevice.confirming')}</p>
          </>
        )}
        {status === 'success' && (
          <>
            <CheckCircle2 size={40} style={{ color: 'var(--positive)' }} />
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{t('resetDevice.success')}</p>
          </>
        )}
        {status === 'error' && (
          <p className="text-sm rounded-lg px-3 py-2" style={{ background: 'var(--negative-soft)', color: 'var(--negative)' }}>{errorMsg}</p>
        )}
      </div>
    </Shell>
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
