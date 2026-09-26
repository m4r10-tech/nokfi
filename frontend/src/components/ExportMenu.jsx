import { useState, useRef, useEffect } from 'react';
import { Download, ChevronDown, Loader2, FileText, FileSpreadsheet, FileType, Presentation, Braces, Table2 } from 'lucide-react';
import { useLang } from '../context/LangContext';
import { useToast } from '../context/ToastContext';

/**
 * F5 — botón "Exportar" con todos los formatos habituales en empresa.
 * Cada formato carga su librería solo al elegirlo (middleware/exports).
 * `formats` permite limitar la lista (p.ej. el libro de facturas: CSV/Excel/ODS).
 */
const ICONS = { pdf: FileText, docx: FileType, xlsx: FileSpreadsheet, csv: Table2, ods: FileSpreadsheet, odt: FileType, pptx: Presentation, json: Braces };
const ALL = ['pdf', 'docx', 'xlsx', 'csv', 'ods', 'odt', 'pptx', 'json'];

export default function ExportMenu({ doc, formats = ALL, onExport }) {
  const { t, lang } = useLang();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(null);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey); };
  }, [open]);

  const run = async (format) => {
    setBusy(format);
    setOpen(false);
    try {
      if (onExport) await onExport(format);
      else {
        const { exportDoc } = await import('../middleware/exports');
        await exportDoc(format, doc, { t, lang });
      }
    } catch (e) {
      console.error('[Export]', format, e);
      toast.error(t('export.error'));
    }
    setBusy(null);
  };

  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen(o => !o)} aria-haspopup="menu" aria-expanded={open} disabled={!!busy} className="btn btn-secondary btn-sm">
        {busy ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
        {t('common.export')} <ChevronDown size={14} />
      </button>
      {open && (
        <div role="menu" className="absolute left-0 top-full mt-1.5 z-40 w-72 max-w-[calc(100vw-32px)] rounded-xl p-1.5 anim-scale"
          style={{ background: 'var(--surface-1)', border: '1px solid var(--border-strong)', boxShadow: 'var(--shadow-lg)' }}>
          {formats.map(f => {
            const Icon = ICONS[f] || FileText;
            return (
              <button key={f} role="menuitem" onClick={() => run(f)}
                className="nav-item w-full text-left flex items-start gap-3 rounded-lg px-2.5 py-2">
                <Icon size={16} className="mt-0.5 shrink-0" style={{ color: 'var(--accent-text)' }} />
                <span className="min-w-0">
                  <span className="block text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{t(`export.${f}`)}</span>
                  <span className="block text-xs" style={{ color: 'var(--text-muted)' }}>{t(`export.${f}Desc`)}</span>
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
