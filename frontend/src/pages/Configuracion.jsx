import { useState, useEffect } from 'react';
import { useOutletContext, Link } from 'react-router-dom';
import { Moon, Sun, LogOut, KeyRound, Copy, Eye, EyeOff, Loader2, CreditCard, Check, CloudOff, Code2, Trash2, Download, Lock, BellRing, LifeBuoy, ExternalLink, Mail } from 'lucide-react';
import { SECTORS, SIZES } from '../components/OnboardingModal';
import { LANGUAGES } from '../i18n/languages';
import { Modal, ErrorBox } from '../components/ui';
import { saveBlob } from '../middleware/exports/model';
import { useTheme } from '../context/ThemeContext';
import { useLang } from '../context/LangContext';
import { useAuth } from '../context/AuthContext';
import { authApi, paymentsApi, keysApi, meApi } from '../middleware/api';
import PasswordGenerator from '../components/PasswordGenerator';
import PageHeader from '../components/PageHeader';
import { useToast } from '../context/ToastContext';
import { apiErrorMessage } from '../middleware/errors';
import { localeOf } from '../utils/dates';

export default function Configuracion() {
  const { profile, updateProfile, loading, saveState } = useOutletContext();
  const { theme, setTheme } = useTheme();
  const { lang, setLang, t } = useLang();
  const { license, logout } = useAuth();

  return (
    <div className="max-w-2xl flex flex-col gap-4 md:gap-5">
      <PageHeader title={t('config.title')} />

      <Section title={t('config.appearance')}>
        <Row label={t('config.theme')}>
          <Segmented value={theme} onChange={setTheme} options={[
            { value: 'dark', label: t('config.dark'), icon: Moon },
            { value: 'light', label: t('config.light'), icon: Sun }
          ]} />
        </Row>
        <Row label={t('config.language')}>
          <select value={lang} onChange={(e) => { setLang(e.target.value); updateProfile({ lang: e.target.value }); }} className="input !w-auto !h-9 text-sm" aria-label={t('config.language')}>
            {LANGUAGES.map(l => <option key={l.code} value={l.code}>{l.name}</option>)}
          </select>
        </Row>
      </Section>

      <Section title={t('config.profile')} aside={<SaveIndicator state={saveState} />}>
        <Field id="cfg-company" label={t('config.companyName')} value={profile.companyName} placeholder={t('onboarding.companyPlaceholder')}
          autoComplete="organization" onChange={(v) => updateProfile({ companyName: v })} disabled={loading} />
        {/* §4.3: el sector es el MISMO desplegable del onboarding (antes texto libre). */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1.5 sm:gap-4">
          <label htmlFor="cfg-sector" className="text-sm shrink-0" style={{ color: 'var(--text-secondary)' }}>{t('config.sector')}</label>
          <select id="cfg-sector" value={profile.sector} onChange={(e) => updateProfile({ sector: e.target.value })} disabled={loading} className="input sm:!w-72">
            <option value="">{t('onboarding.sectorSelect')}</option>
            {SECTORS.map(s => <option key={s.value} value={s.value}>{t(`onboarding.sectors.${s.key}`)}</option>)}
          </select>
        </div>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1.5 sm:gap-4">
          <label htmlFor="cfg-size" className="text-sm shrink-0" style={{ color: 'var(--text-secondary)' }}>{t('onboarding.size')}</label>
          <select id="cfg-size" value={profile.size} onChange={(e) => updateProfile({ size: e.target.value })} disabled={loading} className="input sm:!w-72">
            <option value="">—</option>
            {SIZES.map(s => <option key={s.value} value={s.value}>{t(`onboarding.sizes.${s.key}`)}</option>)}
          </select>
        </div>
        <Row label={t('config.legalForm')}>
          <Segmented value={profile.legalForm || ''} onChange={(v) => updateProfile({ legalForm: v })} options={[
            { value: 'autonomo', label: t('config.legalAutonomo') },
            { value: 'sociedad', label: t('config.legalSociedad') }
          ]} />
        </Row>
        <Field id="cfg-taxid" label={t('config.taxId')} value={profile.taxId || ''} placeholder="12345678Z"
          onChange={(v) => updateProfile({ taxId: v.toUpperCase() })} disabled={loading} />
        <p className="text-xs -mt-1" style={{ color: 'var(--text-muted)' }}>{t('config.taxIdHint')}</p>
        <label className="flex items-start gap-2.5 text-sm cursor-pointer pt-1" style={{ color: 'var(--text-primary)' }}>
          <input type="checkbox" checked={!!profile.fiscalReminders} onChange={(e) => updateProfile({ fiscalReminders: e.target.checked })} className="w-4 h-4 mt-0.5" />
          <span><span className="font-medium inline-flex items-center gap-1.5"><BellRing size={14} /> {t('finance.calendar.remind')}</span>
            <span className="block text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{t('finance.calendar.remindHint')}</span></span>
        </label>
        <label className="flex items-start gap-2.5 text-sm cursor-pointer" style={{ color: 'var(--text-primary)' }}>
          <input type="checkbox" checked={profile.monthlySummary !== false} onChange={(e) => updateProfile({ monthlySummary: e.target.checked })} className="w-4 h-4 mt-0.5" />
          <span><span className="font-medium inline-flex items-center gap-1.5"><Mail size={14} /> {t('config.monthlySummary')}</span>
            <span className="block text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{t('config.monthlySummaryHint')}</span></span>
        </label>
      </Section>

      <SubscriptionSection />

      <ApiKeysSection />

      <RevealKeySection />

      <ChangePasswordSection />

      <MyDataSection />

      <Section title={t('config.session')}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm truncate" style={{ color: 'var(--text-primary)' }}>{license?.email}</p>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              {t('config.planLabel')}: {(license?.plan || '').toUpperCase()} · {t('config.deviceLabel')}: {license?.device_name || '—'}
            </p>
            {/* §2.2: versión visible para soporte ("¿qué versión ves?"). */}
            <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
              {t('config.version')}: <code>{__APP_VERSION__}</code> · <Link to="/app/ayuda" className="link inline-flex items-center gap-1"><LifeBuoy size={12} /> {t('nav.help')}</Link>
            </p>
          </div>
          <button onClick={logout} className="btn btn-danger btn-sm">
            <LogOut size={14} /> {t('config.logout')}
          </button>
        </div>
      </Section>
    </div>
  );
}

/** Indicador de autosave del perfil (useCompanyProfile.saveState). */
function SaveIndicator({ state }) {
  const { t } = useLang();
  if (state === 'idle') return null;
  const map = {
    saving: { icon: Loader2, spin: true, color: 'var(--text-muted)', key: 'config.saving' },
    saved: { icon: Check, color: 'var(--positive)', key: 'config.saved' },
    error: { icon: CloudOff, color: 'var(--negative)', key: 'config.saveError' }
  };
  const m = map[state];
  if (!m) return null;
  const Icon = m.icon;
  return (
    <span key={state} role="status" className="anim-fade inline-flex items-center gap-1 text-xs normal-case tracking-normal font-medium" style={{ color: m.color }}>
      <Icon size={12} className={m.spin ? 'animate-spin' : ''} /> {t(m.key)}
    </span>
  );
}

function Segmented({ value, onChange, options }) {
  return (
    <div role="radiogroup" className="inline-flex gap-1 rounded-lg p-0.5" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
      {options.map(({ value: v, label, icon: Icon }) => (
        <button key={v} role="radio" aria-checked={value === v} onClick={() => onChange(v)}
          className="inline-flex items-center gap-1.5 rounded-md px-3 h-8 text-sm font-medium"
          style={{
            ...(value === v
              ? { background: 'var(--surface-1)', color: 'var(--text-primary)', boxShadow: '0 0 0 1px var(--border-strong)' }
              : { color: 'var(--text-secondary)' }),
            transition: 'background-color var(--dur-fast) var(--ease-std), color var(--dur-fast) var(--ease-std)'
          }}>
          {Icon && <Icon size={14} />} {label}
        </button>
      ))}
    </div>
  );
}

const STATUS_KEYS = ['active', 'suspended', 'expired', 'revoked', 'past_due'];

/* ── Suscripción (Fase 3) — plan, estado, cuota IA, gestión vía Stripe Portal ── */
function SubscriptionSection() {
  const { t, lang } = useLang();
  const { license } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Volver del portal con "atrás" restaura la página desde bfcache con el
  // spinner aún activo: se resetea al re-mostrarse.
  useEffect(() => {
    const onShow = (e) => { if (e.persisted) setLoading(false); };
    window.addEventListener('pageshow', onShow);
    return () => window.removeEventListener('pageshow', onShow);
  }, []);

  if (!license) return null;

  const plan = (license.plan || 'mini').toUpperCase();
  const isActive = license.status === 'active';
  const hasSubscription = license.has_subscription;
  const cancelled = license.cancel_at_period_end;
  const renewal = license.current_period_ends_at
    ? new Date(license.current_period_ends_at).toLocaleDateString(localeOf(lang), { day: 'numeric', month: 'long', year: 'numeric' })
    : null;
  const aiQuota = license.ai_quota;
  // Trial de 14 días (plan mini): license.trial_ends_at es un ISO futuro mientras
  // dure la prueba. translate() no interpola {n}, así que lo sustituimos aquí.
  const trialEnd = license.trial_ends_at ? new Date(license.trial_ends_at) : null;
  const trialDaysLeft = trialEnd && trialEnd > new Date()
    ? Math.ceil((trialEnd - new Date()) / 86400000)
    : null;

  const openPortal = async () => {
    setError(null);
    setLoading(true);
    const res = await paymentsApi.stripePortal(lang);
    if (res.ok && res.data.url) {
      window.location.href = res.data.url; // el spinner sigue hasta que el navegador sale
      return;
    }
    setLoading(false);
    setError(apiErrorMessage(t, res, 'config.portalError'));
  };

  return (
    <Section title={t('config.subscriptionSection')}>
      <div className="flex flex-col gap-2.5">
        <Row label={t('config.subscriptionPlan')}>
          <span className="font-medium" style={{ color: 'var(--text-primary)' }}>{plan}</span>
        </Row>
        <Row label={t('config.subscriptionStatus')}>
          <span className="inline-flex items-center gap-1.5 text-sm font-medium" style={{
            color: isActive ? 'var(--positive)' : 'var(--negative)'
          }}>
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: 'currentColor' }} />
            {STATUS_KEYS.includes(license.status) ? t(`config.status_${license.status}`) : license.status}
          </span>
        </Row>
        {aiQuota != null && (
          <Row label={t('config.aiQuota')}>
            <span style={{ color: 'var(--text-primary)' }}>{aiQuota} {t('config.aiQuotaPerDay')}</span>
          </Row>
        )}
        {trialDaysLeft != null && (
          <Row label={t('config.trialRow')}>
            <span style={{ color: 'var(--text-secondary)' }}>
              {t('config.trialDaysLeft', { n: trialDaysLeft })}
            </span>
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
          <button onClick={openPortal} disabled={loading} className="btn btn-secondary mt-1 w-full sm:w-auto sm:self-start">
            {loading ? <Loader2 size={15} className="animate-spin" /> : <CreditCard size={15} />}
            {t('config.manageSubscription')}
          </button>
          {error && <ErrorMsg>{error}</ErrorMsg>}
        </>
      ) : (
        <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>{t('config.legacyNote')}</p>
      )}
    </Section>
  );
}

/* ── F4: claves de API (solo Pro y Max; el backend lo valida SIEMPRE) ── */
function ApiKeysSection() {
  const { t, lang } = useLang();
  const toast = useToast();
  const [data, setData] = useState(null);
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState(null);
  const [error, setError] = useState(null);

  const load = async () => {
    const res = await keysApi.list();
    if (res.ok) setData(res.data);
  };
  useEffect(() => { load(); }, []);

  const create = async (e) => {
    e.preventDefault();
    setCreating(true); setError(null);
    const res = await keysApi.create(name.trim());
    setCreating(false);
    if (res.ok) { setCreated(res.data.key); setName(''); load(); }
    else setError(apiErrorMessage(t, res));
  };
  const revoke = async (k) => {
    if (!window.confirm(t('config.api.confirmRevoke'))) return;
    const res = await keysApi.revoke(k.id);
    if (res.ok) { toast.success(t('config.api.revoked')); load(); } else toast.error(apiErrorMessage(t, res));
  };
  const copy = async () => { try { await navigator.clipboard.writeText(created); toast.success(t('common.copied')); } catch { /* nada */ } };

  if (!data) return null;
  const active = data.keys.filter(k => !k.revoked_at);

  return (
    <Section title={t('config.api.title')} aside={<Link to="/api-docs" className="link text-xs normal-case tracking-normal inline-flex items-center gap-1">{t('config.api.docs')} <ExternalLink size={11} /></Link>}>
      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{t('config.api.desc')}</p>
      {!data.available ? (
        <div className="rounded-xl p-3.5 flex items-start gap-3" style={{ background: 'var(--surface-2)' }}>
          <Lock size={16} className="mt-0.5 shrink-0" style={{ color: 'var(--text-muted)' }} />
          <div className="text-sm">
            <p style={{ color: 'var(--text-primary)' }}>{t('config.api.locked')}</p>
            <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>{t('config.api.lockedHint')}</p>
          </div>
        </div>
      ) : (
        <>
          {created && (
            <div className="rounded-xl p-3.5 flex flex-col gap-2 anim-fade" style={{ background: 'var(--positive-soft)' }}>
              <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{t('config.api.createdOnce')}</p>
              <div className="flex items-center gap-2 rounded-lg pl-3 pr-1.5 py-1.5" style={{ background: 'var(--surface-1)', border: '1px solid var(--border-strong)' }}>
                <code className="flex-1 text-xs break-all" style={{ color: 'var(--text-primary)' }}>{created}</code>
                <button onClick={copy} className="btn btn-ghost btn-sm !px-2.5" aria-label={t('common.copy')}><Copy size={15} /></button>
              </div>
              <button onClick={() => setCreated(null)} className="text-xs self-start hover:underline" style={{ color: 'var(--text-secondary)' }}>{t('config.api.savedIt')}</button>
            </div>
          )}
          {active.length > 0 && (
            <ul className="flex flex-col gap-1.5">
              {active.map(k => (
                <li key={k.id} className="flex items-center gap-3 rounded-lg px-3 py-2" style={{ background: 'var(--surface-2)' }}>
                  <Code2 size={15} className="shrink-0" style={{ color: 'var(--accent-text)' }} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm truncate" style={{ color: 'var(--text-primary)' }}>{k.name || t('config.api.unnamed')} <code className="text-xs" style={{ color: 'var(--text-muted)' }}>{k.prefix}…</code></p>
                    <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{k.last_used_at ? t('config.api.lastUsed').replace('{date}', new Date(k.last_used_at.replace(' ', 'T') + 'Z').toLocaleString(localeOf(lang))) : t('config.api.neverUsed')}</p>
                  </div>
                  <button onClick={() => revoke(k)} className="btn btn-ghost btn-sm !px-2" aria-label={t('config.api.revoke')} title={t('config.api.revoke')}><Trash2 size={14} /></button>
                </li>
              ))}
            </ul>
          )}
          <form onSubmit={create} className="flex flex-col sm:flex-row gap-2">
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder={t('config.api.namePlaceholder')} aria-label={t('config.api.namePlaceholder')} className="input flex-1" />
            <button type="submit" disabled={creating} className="btn btn-secondary">{creating ? <Loader2 size={15} className="animate-spin" /> : <KeyRound size={15} />} {t('config.api.create')}</button>
          </form>
          {error && <ErrorMsg>{error}</ErrorMsg>}
        </>
      )}
    </Section>
  );
}

/* ── C9: descargar y borrar mis datos (RGPD autoservicio) ── */
function MyDataSection() {
  const { t } = useLang();
  const { license, logout } = useAuth();
  const toast = useToast();
  const [exporting, setExporting] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const download = async () => {
    setExporting(true);
    const res = await meApi.export();
    setExporting(false);
    if (!res.ok) { toast.error(apiErrorMessage(t, res)); return; }
    saveBlob(new Blob([JSON.stringify(res.data, null, 2)], { type: 'application/json' }), 'nokfi-mis-datos.json');
  };

  return (
    <Section title={t('config.data.title')}>
      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{t('config.data.desc')}</p>
      <div className="flex flex-col sm:flex-row gap-2">
        <button onClick={download} disabled={exporting} className="btn btn-secondary">
          {exporting ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />} {t('config.data.download')}
        </button>
        <button onClick={() => setDeleting(true)} className="btn btn-danger"><Trash2 size={15} /> {t('config.data.delete')}</button>
      </div>
      {deleting && <DeleteAccountModal license={license} onClose={() => setDeleting(false)} onDeleted={() => { toast.info(t('config.data.deleted')); logout(); }} />}
    </Section>
  );
}

function DeleteAccountModal({ license, onClose, onDeleted }) {
  const { t } = useLang();
  const [password, setPassword] = useState('');
  const [confirmText, setConfirmText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const word = t('config.data.confirmWord');
  const subActive = license?.has_subscription && !license?.cancel_at_period_end && license?.billing_model !== 'legacy';

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true); setError(null);
    const res = await meApi.remove(password);
    setLoading(false);
    if (res.ok) onDeleted();
    else if (res.data?.error === 'invalid_credentials') setError(t('config.wrongPassword'));
    else setError(apiErrorMessage(t, res));
  };

  return (
    <Modal title={t('config.data.deleteTitle')} onClose={onClose}
      footer={<>
        <button type="button" onClick={onClose} className="btn btn-secondary">{t('common.cancel')}</button>
        <button type="submit" form="delete-account" disabled={loading || !password || confirmText.trim().toUpperCase() !== word.toUpperCase()} className="btn btn-danger">
          {loading && <Loader2 size={15} className="animate-spin" />} {t('config.data.deleteForever')}
        </button>
      </>}>
      <form id="delete-account" onSubmit={submit} className="flex flex-col gap-3">
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{t('config.data.deleteWarning')}</p>
        {subActive && <ErrorBox>{t('errors.subscription_active')}</ErrorBox>}
        <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)}
          placeholder={t('config.currentPassword')} aria-label={t('config.currentPassword')} className="input" />
        <label className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          {t('config.data.typeToConfirm').replace('{word}', word)}
          <input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} className="input mt-1.5" aria-label={t('config.data.typeToConfirm').replace('{word}', word)} />
        </label>
        {error && <ErrorBox>{error}</ErrorBox>}
      </form>
    </Modal>
  );
}

function Row({ label, children }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5 min-h-[32px]">
      <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>{label}</span>
      <div className="text-sm text-right">{children}</div>
    </div>
  );
}

function ErrorMsg({ children }) {
  return (
    <p role="alert" className="anim-msg text-sm rounded-lg px-3 py-2" style={{ background: 'var(--negative-soft)', color: 'var(--negative)' }}>{children}</p>
  );
}

/* ── Revelar la clave de licencia (A1) — requiere re-introducir la contraseña ── */
function RevealKeySection() {
  const { t } = useLang();
  const toast = useToast();
  const [revealed, setRevealed] = useState(null); // clave revelada o null
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const reveal = async (e) => {
    e.preventDefault();
    if (!password || loading) return;
    setLoading(true);
    setError(null);
    const res = await authApi.revealKey(password);
    setLoading(false);
    if (res.ok && res.data.key) {
      setRevealed(res.data.key);
    } else if (res.data.error === 'invalid_credentials') {
      setError(t('config.wrongPassword'));
    } else {
      setError(apiErrorMessage(t, res));
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(revealed);
      toast.success(t('config.keyCopied'));
    } catch { /* clipboard no disponible */ }
  };

  return (
    <Section title={t('config.licenseKeySection')}>
      {revealed ? (
        <div className="flex flex-col gap-2 anim-fade">
          <div className="flex items-center gap-2 rounded-lg pl-3 pr-1.5 py-1.5"
               style={{ background: 'var(--surface-2)', border: '1px solid var(--border-strong)' }}>
            <KeyRound size={14} className="shrink-0" style={{ color: 'var(--text-muted)' }} />
            <code className="flex-1 font-mono text-sm tracking-wide break-all" style={{ color: 'var(--text-primary)' }}>{revealed}</code>
            <button onClick={copy} aria-label={t('common.copy')} className="btn btn-ghost btn-sm !px-2.5"><Copy size={16} /></button>
          </div>
          <button onClick={() => { setRevealed(null); setPassword(''); }}
            className="text-sm self-start hover:underline" style={{ color: 'var(--text-secondary)' }}>
            {t('config.hideKey')}
          </button>
        </div>
      ) : (
        <form onSubmit={reveal} className="flex flex-col gap-2">
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            {t('config.revealKeyHint')}
          </p>
          <div className="flex flex-col sm:flex-row gap-2">
            <input type="password" autoComplete="current-password" placeholder={t('config.currentPassword')} aria-label={t('config.currentPassword')}
              value={password} aria-invalid={!!error}
              onChange={(e) => setPassword(e.target.value)} className="input flex-1" />
            <button type="submit" disabled={loading || !password} className="btn btn-primary">
              {loading ? <Loader2 size={15} className="animate-spin" /> : <Eye size={15} />}
              {t('config.showKey')}
            </button>
          </div>
          {error && <ErrorMsg>{error}</ErrorMsg>}
        </form>
      )}
    </Section>
  );
}

/* ── Cambiar contraseña (con generador) ── */
function ChangePasswordSection() {
  const { t } = useLang();
  const toast = useToast();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [invalid, setInvalid] = useState(null); // campo a marcar en rojo

  const submit = async (e) => {
    e.preventDefault();
    setError(null); setInvalid(null);
    if (!current) { setError(t('login.passwordRequired')); setInvalid('current'); return; }
    if (!next) { setError(t('login.passwordRequired')); setInvalid('next'); return; }
    if (next !== confirm) { setError(t('login.passwordMismatch')); setInvalid('confirm'); return; }
    setLoading(true);
    const res = await authApi.changePassword(current, next);
    setLoading(false);
    if (res.ok && res.data.success) {
      setCurrent(''); setNext(''); setConfirm('');
      toast.success(t('config.passwordChanged'));
    } else if (res.data.error === 'invalid_credentials') {
      setError(t('config.wrongPassword')); setInvalid('current');
    } else if (res.data.error === 'weak_password') {
      setError(res.data.message || t('login.weakPassword')); setInvalid('next');
    } else {
      setError(apiErrorMessage(t, res));
    }
  };

  return (
    <Section title={t('config.changePasswordSection')}>
      <form onSubmit={submit} className="flex flex-col gap-2.5">
        <PwdInput placeholder={t('config.currentPassword')} autoComplete="current-password" value={current} onChange={setCurrent} show={showPwd} toggle={setShowPwd} invalid={invalid === 'current'} />
        <PwdInput placeholder={t('config.newPassword')} autoComplete="new-password" value={next} onChange={setNext} show={showPwd} toggle={setShowPwd} invalid={invalid === 'next'} />
        <PwdInput placeholder={t('login.confirmPassword')} autoComplete="new-password" value={confirm} onChange={setConfirm} show={showPwd} toggle={setShowPwd} invalid={invalid === 'confirm'} />
        <PasswordGenerator onGenerate={(p) => { setNext(p); setConfirm(p); setShowPwd(true); }} label={t('login.generator')} />
        {error && <ErrorMsg>{error}</ErrorMsg>}
        <button type="submit" disabled={loading} className="btn btn-primary">
          {loading && <Loader2 size={15} className="animate-spin" />}
          {t('config.changePasswordBtn')}
        </button>
      </form>
    </Section>
  );
}

function PwdInput({ placeholder, value, onChange, show, toggle, invalid, autoComplete }) {
  const { t } = useLang();
  return (
    <div className="relative">
      <input type={show ? 'text' : 'password'} placeholder={placeholder} aria-label={placeholder} value={value}
        autoComplete={autoComplete} aria-invalid={invalid || undefined}
        onChange={(e) => onChange(e.target.value)} className="input !pr-11" />
      <button type="button" onClick={() => toggle(!show)} aria-label={t(show ? 'login.hidePassword' : 'login.showPassword')}
        className="absolute right-1 top-1/2 -translate-y-1/2 w-9 h-9 grid place-items-center rounded-md" style={{ color: 'var(--text-muted)' }}>
        {show ? <EyeOff size={16} /> : <Eye size={16} />}
      </button>
    </div>
  );
}

function Section({ title, aside, children }) {
  return (
    <section className="card p-4 sm:p-5 flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3 min-h-[20px]">
        <h2 className="text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

function Field({ id, label, value, onChange, disabled, placeholder, autoComplete }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1.5 sm:gap-4">
      <label htmlFor={id} className="text-sm shrink-0" style={{ color: 'var(--text-secondary)' }}>{label}</label>
      <input id={id} value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled}
        placeholder={placeholder} autoComplete={autoComplete}
        className="input sm:!w-72" />
    </div>
  );
}
