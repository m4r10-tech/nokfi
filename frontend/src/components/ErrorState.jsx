import { WifiOff, AlertCircle, RotateCw } from 'lucide-react';
import { useLang } from '../context/LangContext';

/**
 * ErrorState (Tanda E) — bloque de error reconocible con reintento, para
 * cargas que fallan (lista del historial, dashboard…). Si el fallo es de
 * conectividad (`offline`), muestra el icono de red y el copy de "servidor
 * no disponible"; si no, el mensaje recibido.
 */
export default function ErrorState({ offline = false, message, onRetry, compact = false }) {
  const { t } = useLang();
  const Icon = offline ? WifiOff : AlertCircle;
  return (
    <div role="alert" className={`card anim-fade flex flex-col items-center text-center gap-2 ${compact ? 'p-5' : 'p-10'}`}>
      <div className="rounded-full p-2.5 mb-1" style={{ background: 'var(--negative-soft)', color: 'var(--negative)' }}>
        <Icon size={20} />
      </div>
      <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
        {offline ? t('errors.offlineTitle') : t('errors.genericTitle')}
      </p>
      <p className="text-sm max-w-sm" style={{ color: 'var(--text-secondary)' }}>
        {offline ? t('errors.offlineDesc') : message}
      </p>
      {onRetry && (
        <button onClick={onRetry} className="btn btn-secondary btn-sm mt-2">
          <RotateCw size={14} /> {t('common.retry')}
        </button>
      )}
    </div>
  );
}
