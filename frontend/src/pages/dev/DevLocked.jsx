import { Link } from 'react-router-dom';
import { Lock, ArrowRight } from 'lucide-react';
import { useLang } from '../../context/LangContext';

/** Bloqueo por plan (Mini): se ve todo, pero las claves live piden Pro o Max. */
export default function DevLocked() {
  const { t } = useLang();
  return (
    <section className="card p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center gap-3" style={{ borderColor: 'var(--border-strong)' }}>
      <Lock size={18} className="shrink-0" style={{ color: 'var(--text-muted)' }} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{t('dev.lockedTitle')}</p>
        <p className="text-sm mt-0.5" style={{ color: 'var(--text-secondary)' }}>{t('dev.lockedDesc')}</p>
      </div>
      <Link to="/app/configuracion" className="btn btn-primary btn-sm shrink-0">{t('dev.upgrade')} <ArrowRight size={14} /></Link>
    </section>
  );
}
