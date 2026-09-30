import { Loader2 } from 'lucide-react';
import { useLang } from '../../context/LangContext';
import { Modal } from '../ui';

/**
 * Confirmación dentro de la app (sesión 9): sustituye a window.confirm, que
 * bloquea la pestaña y no sigue el diseño de Nokfi.
 */
export default function ConfirmModal({ title, text, cta, danger = false, busy = false, onConfirm, onClose }) {
  const { t } = useLang();
  return (
    <Modal title={title} onClose={onClose} footer={<>
      <button type="button" onClick={onClose} className="btn btn-ghost">{t('common.cancel')}</button>
      <button type="button" onClick={onConfirm} disabled={busy} className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`} autoFocus>
        {busy && <Loader2 size={15} className="animate-spin" />} {cta}
      </button>
    </>}>
      <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{text}</p>
    </Modal>
  );
}
