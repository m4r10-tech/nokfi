import { Component } from 'react';
import { AlertCircle, RotateCw } from 'lucide-react';
import { reportError } from '../middleware/errorReporter';
import { isChunkError, reloadOnceForChunkError } from '../utils/lazyWithReload';
import { useLang } from '../context/LangContext';

/**
 * C8 — Captura errores de render para que un fallo no deje la pantalla en
 * blanco: se informa (sin datos del usuario) y se ofrece recargar.
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    if (isChunkError(error) && reloadOnceForChunkError()) return;
    reportError(error, { componentStack: info?.componentStack });
  }

  render() {
    if (!this.state.error) return this.props.children;
    return <Fallback />;
  }
}

function Fallback() {
  const { t } = useLang();
  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center text-center gap-3 px-4">
      <div className="rounded-full p-3" style={{ background: 'var(--negative-soft)', color: 'var(--negative)' }}><AlertCircle size={22} /></div>
      <p className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>{t('crash.title')}</p>
      <p className="text-sm max-w-md" style={{ color: 'var(--text-secondary)' }}>{t('crash.desc')}</p>
      <button onClick={() => window.location.reload()} className="btn btn-primary mt-2"><RotateCw size={15} /> {t('crash.reload')}</button>
      <p className="text-[11px] mt-2" style={{ color: 'var(--text-muted)' }}>v{__APP_VERSION__}</p>
    </div>
  );
}
