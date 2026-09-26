import { Link } from 'react-router-dom';
import { useLang } from '../context/LangContext';

/** «Al continuar aceptas los Términos y el Encargo…» con enlaces (activación y pago). */
export default function LegalAccept({ className = '' }) {
  const { t } = useLang();
  const links = {
    terms: <Link to="/terminos" target="_blank" className="underline">{t('legal.terms')}</Link>,
    dpa: <Link to="/encargo-tratamiento" target="_blank" className="underline">{t('legal.dpa')}</Link>,
    privacy: <Link to="/privacidad" target="_blank" className="underline">{t('legal.privacy')}</Link>
  };
  const parts = t('legal.accept').split(/(\{terms\}|\{dpa\}|\{privacy\})/);
  return (
    <p className={`text-xs leading-relaxed ${className}`} style={{ color: 'var(--text-muted)' }}>
      {parts.map((p, i) => { const k = p.match(/^\{(\w+)\}$/)?.[1]; return <span key={i}>{k ? links[k] : p}</span>; })}
    </p>
  );
}
