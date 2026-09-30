import { Copy } from 'lucide-react';
import { useLang } from '../../context/LangContext';
import { useToast } from '../../context/ToastContext';

/** Bloque de código con botón de copiar (sesión 9: Playground, Webhooks). */
export default function CodeBlock({ text, maxHeight = 360, label, wrap = false }) {
  const { t } = useLang();
  const toast = useToast();
  const copy = async () => { try { await navigator.clipboard.writeText(text); toast.success(t('common.copied')); } catch { /* sin portapapeles */ } };
  return (
    <div className="relative rounded-xl overflow-hidden" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
      <button type="button" onClick={copy} className="absolute top-2 right-2 btn btn-ghost btn-sm !px-2" aria-label={label ? `${t('common.copy')}: ${label}` : t('common.copy')} title={t('common.copy')}><Copy size={14} /></button>
      <pre className={`p-3.5 pr-12 text-xs overflow-auto ${wrap ? 'whitespace-pre-wrap break-words' : ''}`} style={{ color: 'var(--text-primary)', maxHeight }}><code>{text}</code></pre>
    </div>
  );
}
