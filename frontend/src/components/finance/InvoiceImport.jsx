import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, Sparkles, AlertTriangle, Info, Check, X } from 'lucide-react';
import { aiApi, ledgerApi } from '../../middleware/api';
import { apiErrorMessage } from '../../middleware/errors';
import { readPdf, imageToJpeg, extOf, IMAGE_EXT } from '../../middleware/fileReaders';
import { fileErrorMessage } from '../../middleware/fileErrors';
import { useLang } from '../../context/LangContext';
import { useToast } from '../../context/ToastContext';
import FolderSource from '../FolderSource';
import { Section, Segmented, ErrorBox, Notice, Badge } from '../ui';
import { checkOk } from './EntryForm';

/**
 * V1 — Facturas leídas por la IA → libro (sesión 4).
 *
 * Fotos (JPG/PNG/WebP) o PDF, sueltos o una carpeta entera (F3). En el
 * navegador: los PDF con texto se extraen aquí; los escaneados y las fotos
 * se reducen y se envían a la IA (Gemini lee imágenes y PDF) SOLO para
 * leerlos: el archivo no se guarda. Lo que se guarda son los DATOS que el
 * usuario revisa y confirma en la tabla.
 * Coste: 1 análisis por lectura, aunque vaya en varios lotes (job).
 */
const ACCEPT_EXT = ['.pdf', ...IMAGE_EXT];
const accept = (name) => ACCEPT_EXT.includes(extOf(name)) && !name.startsWith('.');
const MAX_INVOICES = 60;
const PER_BATCH = 5;
const BATCH_BYTES = 6 * 1024 * 1024;
const MAX_PDF_BYTES = 4 * 1024 * 1024;

export default function InvoiceImport({ profile, onSaved, onCancel }) {
  const { t, lang } = useLang();
  const toast = useToast();
  const [kind, setKind] = useState('auto');
  const [picked, setPicked] = useState(null); // { name, files }
  const [phase, setPhase] = useState('pick'); // pick | reading | review
  const [progress, setProgress] = useState(null);
  const [rows, setRows] = useState([]);
  const [errors, setErrors] = useState([]);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [dupes, setDupes] = useState(null);
  const taxId = (profile?.taxId || '').toUpperCase();

  const onPick = ({ name, files }) => {
    setError(null); setErrors([]);
    setPicked({ name, files: files.slice(0, MAX_INVOICES), skipped: Math.max(0, files.length - MAX_INVOICES) });
  };

  /** Prepara cada archivo: texto (PDF con texto) o imagen/PDF en base64. */
  const prepare = async (file) => {
    const ext = extOf(file.name);
    if (IMAGE_EXT.includes(ext)) {
      const img = await imageToJpeg(file);
      return { name: file.name, mime: img.mime, data: img.data, bytes: img.data.length };
    }
    const { text, looksScanned } = await readPdf(file, { maxPages: 6 });
    if (!looksScanned) return { name: file.name, text: text.slice(0, 12000), bytes: text.length };
    if (file.size > MAX_PDF_BYTES) throw Object.assign(new Error('big'), { code: 'ERR_FILE_TOO_BIG', fileName: file.name });
    // PDF escaneado → imagen de la 1.ª página (los modelos sin entrenamiento leen imágenes, no PDF).
    const { renderPdfFirstPage } = await import('../../middleware/pdfExtract');
    const img = await renderPdfFirstPage(file);
    return { name: file.name, mime: img.mime, data: img.data, bytes: img.data.length };
  };

  const toRow = (inv, i) => {
    const issuerIsMe = taxId && inv.issuer_nif === taxId;
    const recipientIsMe = taxId && inv.recipient_nif === taxId;
    const type = kind !== 'auto' ? kind : issuerIsMe ? 'income' : recipientIsMe ? 'expense' : 'expense';
    const party = type === 'income' ? { name: inv.recipient_name, nif: inv.recipient_nif } : { name: inv.issuer_name, nif: inv.issuer_nif };
    return {
      key: `${i}-${inv.file_name}`, include: inv.is_invoice && !!inv.invoice_date,
      type, file_name: inv.file_name, is_invoice: inv.is_invoice,
      invoice_date: inv.invoice_date, due_date: inv.due_date || '', party_name: party.name || '', party_nif: party.nif || '',
      invoice_number: inv.invoice_number, concept: inv.concept, category: inv.category,
      base: inv.base, vat_rate: inv.vat_rate, vat_amount: inv.vat_amount, irpf_rate: inv.irpf_rate, irpf_amount: inv.irpf_amount, total: inv.total,
      paid: type === 'expense'
    };
  };

  const run = async () => {
    setPhase('reading'); setError(null); setErrors([]); setRows([]);
    const prepared = [], errs = [];
    for (const [i, f] of picked.files.entries()) {
      setProgress({ label: t('finance.import.preparing'), n: i + 1, total: picked.files.length });
      try { prepared.push(await prepare(f)); }
      catch (e) { errs.push(fileErrorMessage(t, e, f.name)); }
    }
    // Lotes de ≤5 facturas y ≤6 MB.
    const batches = [];
    let cur = [], size = 0;
    for (const p of prepared) {
      if (cur.length && (cur.length >= PER_BATCH || size + p.bytes > BATCH_BYTES)) { batches.push(cur); cur = []; size = 0; }
      cur.push(p); size += p.bytes;
    }
    if (cur.length) batches.push(cur);

    const found = [];
    let job;
    for (const [i, b] of batches.entries()) {
      setProgress({ label: t('finance.import.reading'), n: i + 1, total: batches.length });
      const res = await aiApi.run('invoices', { files: b.map(({ bytes, ...x }) => x), total_batches: batches.length }, { lang, job });
      if (!res.ok) {
        setError(apiErrorMessage(t, res, 'excel.analyzeError'));
        if (!found.length) { setPhase('pick'); setProgress(null); setErrors(errs); return; }
        break;
      }
      job = res.data.job;
      found.push(...res.data.invoices);
    }
    setErrors(errs);
    setRows(found.map(toRow));
    setProgress(null);
    setPhase('review');
  };

  const update = (key, k, v) => setRows(list => list.map(r => (r.key === key ? { ...r, [k]: v } : r)));

  const save = async (force = false, skipDupes = false) => {
    setSaving(true); setError(null);
    let selected = rows.filter(r => r.include);
    if (skipDupes && dupes) selected = selected.filter((_, i) => !dupes.includes(i));
    const entries = selected.map(r => ({
      type: r.type, invoice_date: r.invoice_date, due_date: r.due_date || null, party_name: r.party_name, party_nif: r.party_nif,
      invoice_number: r.invoice_number, concept: r.concept, category: r.category,
      base: Number(r.base) || 0, vat_rate: Number(r.vat_rate) || 0, vat_amount: Number(r.vat_amount) || 0,
      irpf_rate: Number(r.irpf_rate) || 0, irpf_amount: Number(r.irpf_amount) || 0, total: Number(r.total) || 0,
      paid: r.paid, source: 'ai', file_name: r.file_name
    }));
    if (!entries.length) { setSaving(false); onCancel(); return; }
    const res = await ledgerApi.create(entries, force);
    setSaving(false);
    if (res.status === 409) { setDupes(res.data.duplicates || []); return; }
    if (!res.ok) { setError(apiErrorMessage(t, res)); return; }
    toast.success(t('finance.import.saved', { n: res.data.ids.length }));
    onSaved();
  };

  const selectedCount = rows.filter(r => r.include).length;

  return (
    <Section title={t('finance.import.title')} aside={<button onClick={onCancel} className="btn btn-ghost btn-sm !px-2" aria-label={t('common.close')}><X size={16} /></button>}>
      {phase === 'pick' && (
        <div className="flex flex-col gap-4">
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{t('finance.import.desc')}</p>
          <div>
            <p className="field-label">{t('finance.import.kind')}</p>
            <Segmented value={kind} onChange={setKind} size="sm" options={[
              { value: 'auto', label: t('finance.import.kindAuto') },
              { value: 'expense', label: t('finance.import.kindExpense') },
              { value: 'income', label: t('finance.import.kindIncome') }
            ]} />
            {kind === 'auto' && !taxId && (
              <p className="text-xs mt-1.5" style={{ color: 'var(--text-muted)' }}>
                {t('finance.import.noTaxId')} <Link to="/app/configuracion" className="link">{t('nav.settings')}</Link>
              </p>
            )}
          </div>
          <FolderSource accept={accept} inputAccept={ACCEPT_EXT.join(',')} slot="invoices" onPick={onPick} />
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{t('finance.import.formats')}</p>
          {picked && (
            <>
              <Notice icon={Info}>
                {t('finance.import.willRead', { n: picked.files.length })}
                {picked.skipped > 0 && ` ${t('finance.import.capped').replace('{max}', MAX_INVOICES)}`}
              </Notice>
              <div><button onClick={run} disabled={!picked.files.length} className="btn btn-primary"><Sparkles size={15} /> {t('finance.import.start')}</button></div>
            </>
          )}
          {error && <ErrorBox>{error}</ErrorBox>}
          {errors.slice(0, 3).map((e, i) => <ErrorBox key={i} code={e.code}>{e.message}</ErrorBox>)}
        </div>
      )}

      {phase === 'reading' && progress && (
        <div className="py-6 flex flex-col items-center gap-3 text-center" aria-live="polite">
          <Loader2 size={24} className="animate-spin" style={{ color: 'var(--accent-text)' }} />
          <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{progress.label} {progress.n}/{progress.total}</p>
          <div className="w-full max-w-sm h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--surface-2)' }}>
            <div className="h-full rounded-full" style={{ width: `${(progress.n / progress.total) * 100}%`, background: 'var(--accent)', transition: 'width 400ms var(--ease-out)' }} />
          </div>
        </div>
      )}

      {phase === 'review' && (
        <div className="flex flex-col gap-3">
          <Notice icon={AlertTriangle} tone="warning">{t('finance.import.reviewHint')}</Notice>
          {errors.slice(0, 3).map((e, i) => <ErrorBox key={i} code={e.code}>{e.message}</ErrorBox>)}
          {error && <ErrorBox>{error}</ErrorBox>}
          <div className="overflow-x-auto -mx-4 sm:mx-0">
            <table className="w-full text-sm min-w-[860px]">
              <thead>
                <tr className="text-left text-xs" style={{ color: 'var(--text-muted)' }}>
                  <th className="p-2 w-8" /><th className="p-2">{t('finance.type')}</th><th className="p-2">{t('finance.date')}</th>
                  <th className="p-2">{t('finance.party')}</th><th className="p-2">{t('finance.nif')}</th><th className="p-2">{t('finance.invoiceNumber')}</th>
                  <th className="p-2 text-right">{t('finance.base')}</th><th className="p-2 text-right">{t('finance.vat')}</th>
                  <th className="p-2 text-right">{t('finance.irpf')}</th><th className="p-2 text-right">{t('finance.total')}</th><th className="p-2" />
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => {
                  const ok = checkOk(r) && r.invoice_date;
                  const dupe = dupes?.includes(rows.filter(x => x.include).indexOf(r));
                  const cell = (k, props = {}) => (
                    <input value={r[k] ?? ''} onChange={(e) => update(r.key, k, e.target.value)} className="input !h-8 !px-2 text-xs" {...props} />
                  );
                  return (
                    <tr key={r.key} style={{ borderTop: '1px solid var(--border)', opacity: r.include ? 1 : 0.55 }}>
                      <td className="p-2"><input type="checkbox" checked={r.include} onChange={(e) => update(r.key, 'include', e.target.checked)} aria-label={r.file_name} className="w-4 h-4" /></td>
                      <td className="p-2">
                        <select value={r.type} onChange={(e) => update(r.key, 'type', e.target.value)} className="input !h-8 !px-1.5 text-xs !w-[92px]">
                          <option value="expense">{t('finance.expense')}</option><option value="income">{t('finance.income')}</option>
                        </select>
                      </td>
                      <td className="p-2 w-[130px]">{cell('invoice_date', { type: 'date' })}</td>
                      <td className="p-2 min-w-[170px]">{cell('party_name')}<p className="text-[11px] truncate max-w-[160px] mt-0.5" style={{ color: 'var(--text-muted)' }} title={r.file_name}>{r.file_name}</p></td>
                      <td className="p-2 w-[110px]">{cell('party_nif')}</td>
                      <td className="p-2 w-[100px]">{cell('invoice_number')}</td>
                      <td className="p-2 w-[90px]">{cell('base', { type: 'number', step: '0.01', className: 'input !h-8 !px-2 text-xs text-right' })}</td>
                      <td className="p-2 w-[80px]">{cell('vat_amount', { type: 'number', step: '0.01', className: 'input !h-8 !px-2 text-xs text-right' })}</td>
                      <td className="p-2 w-[80px]">{cell('irpf_amount', { type: 'number', step: '0.01', className: 'input !h-8 !px-2 text-xs text-right' })}</td>
                      <td className="p-2 w-[90px]">{cell('total', { type: 'number', step: '0.01', className: 'input !h-8 !px-2 text-xs text-right font-semibold' })}</td>
                      <td className="p-2">
                        {!r.is_invoice ? <Badge tone="muted">{t('finance.import.notInvoice')}</Badge>
                          : dupe ? <Badge tone="warning">{t('finance.import.duplicate')}</Badge>
                          : ok ? <Badge tone="positive"><Check size={11} /> OK</Badge>
                          : <Badge tone="warning"><AlertTriangle size={11} /> {t('finance.import.check')}</Badge>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {rows.length === 0 && <p className="text-sm py-4 text-center" style={{ color: 'var(--text-secondary)' }}>{t('finance.import.noneFound')}</p>}

          {dupes && dupes.length > 0 ? (
            <div className="flex flex-col gap-2">
              <Notice icon={AlertTriangle} tone="warning">{t('finance.import.dupesFound', { n: dupes.length })}</Notice>
              <div className="flex flex-col sm:flex-row gap-2">
                <button onClick={() => save(false, true)} disabled={saving} className="btn btn-primary">{t('finance.import.skipDupes')}</button>
                <button onClick={() => save(true)} disabled={saving} className="btn btn-secondary">{t('finance.import.saveAnyway')}</button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col sm:flex-row gap-2">
              <button onClick={() => save()} disabled={saving || !selectedCount} className="btn btn-primary">
                {saving && <Loader2 size={15} className="animate-spin" />} {t('finance.import.save').replace('{n}', selectedCount)}
              </button>
              <button onClick={onCancel} className="btn btn-secondary">{t('common.cancel')}</button>
            </div>
          )}
        </div>
      )}
    </Section>
  );
}
