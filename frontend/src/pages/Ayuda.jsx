import { Mail, LifeBuoy, MessageCircle, Code2, ShieldCheck, Info } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useLang } from '../context/LangContext';
import { useAuth } from '../context/AuthContext';
import { useChat } from '../context/ChatContext';
import PageHeader from '../components/PageHeader';
import { Section } from '../components/ui';

/**
 * §4.2 — Ayuda y contacto dentro de la app (sesión 4).
 * Buzones PÚBLICOS: soporte@ (cuenta, pagos, la app) e info@ (dudas
 * generales, comercial, privacidad). admin@ y nokfi@ son personales y NUNCA
 * aparecen en la web. El correo de soporte sale con el asunto y un cuerpo con
 * el email de la licencia, el plan y la versión de la app — nunca la clave.
 */
export default function Ayuda() {
  const { t } = useLang();
  const { license } = useAuth();
  const chat = useChat();
  const plan = (license?.plan || '').toUpperCase();
  const subject = `${t('help.supportSubject')} — ${plan}`;
  const body = [
    t('help.bodyIntro'), '', '', '———',
    `${t('help.bodyEmail')}: ${license?.email || ''}`,
    `${t('help.bodyPlan')}: ${plan}`,
    `${t('help.bodyVersion')}: ${__APP_VERSION__}`,
    `${t('help.bodyBrowser')}: ${navigator.userAgent.slice(0, 120)}`
  ].join('\n');
  const supportHref = `mailto:soporte@nokfi.app?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

  return (
    <div className="max-w-2xl flex flex-col gap-4">
      <PageHeader title={t('help.title')} description={t('help.subtitle')} />

      <Section title={t('help.contact')}>
        <a href={supportHref} className="card card-interactive p-4 flex items-start gap-3">
          <span className="w-10 h-10 rounded-xl grid place-items-center shrink-0" style={{ background: 'var(--accent)', color: 'var(--on-accent)' }}><LifeBuoy size={18} /></span>
          <div className="min-w-0">
            <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>soporte@nokfi.app</p>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>{t('help.supportDesc')}</p>
          </div>
        </a>
        <a href={`mailto:info@nokfi.app?subject=${encodeURIComponent('Nokfi')}`} className="card card-interactive p-4 flex items-start gap-3 mt-2">
          <span className="w-10 h-10 rounded-xl grid place-items-center shrink-0" style={{ background: 'var(--accent-soft)', color: 'var(--accent-text)' }}><Mail size={18} /></span>
          <div className="min-w-0">
            <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>info@nokfi.app</p>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>{t('help.infoDesc')}</p>
          </div>
        </a>
        <p className="text-xs mt-3 flex items-start gap-1.5" style={{ color: 'var(--text-muted)' }}><Info size={13} className="mt-0.5 shrink-0" /> {t('help.includedInfo')}</p>
      </Section>

      <Section title={t('help.more')}>
        <div className="flex flex-col -mx-2">
          {chat && (
            <button onClick={() => chat.openChat()} className="nav-item flex items-center gap-3 rounded-lg px-2 py-2.5 text-left">
              <MessageCircle size={17} style={{ color: 'var(--accent-text)' }} />
              <span className="text-sm" style={{ color: 'var(--text-primary)' }}>{t('help.askAssistant')}</span>
            </button>
          )}
          <Link to="/api-docs" className="nav-item flex items-center gap-3 rounded-lg px-2 py-2.5">
            <Code2 size={17} style={{ color: 'var(--accent-text)' }} /><span className="text-sm" style={{ color: 'var(--text-primary)' }}>{t('help.apiDocs')}</span>
          </Link>
          <Link to="/privacidad" className="nav-item flex items-center gap-3 rounded-lg px-2 py-2.5">
            <ShieldCheck size={17} style={{ color: 'var(--accent-text)' }} /><span className="text-sm" style={{ color: 'var(--text-primary)' }}>{t('landing.privacyLink')}</span>
          </Link>
        </div>
        <p className="text-xs mt-3" style={{ color: 'var(--text-muted)' }}>{t('config.version')}: <code>{__APP_VERSION__}</code></p>
      </Section>
    </div>
  );
}
