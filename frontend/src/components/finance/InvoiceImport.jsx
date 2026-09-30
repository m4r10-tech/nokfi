import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, ScanLine, AlertTriangle, Info, Check, X, FileText, FileCode2, Eye, EyeOff } from 'lucide-react';
import { aiApi, ledgerApi } from '../../middleware/api';
import { apiErrorMessage } from '../../middleware/errors';
import { readPdf, imageToJpeg, extOf, IMAGE_EXT } from '../../middleware/fileReaders';
import { fileErrorMessage } from '../../middleware/fileErrors';
import { useLang } from '../../context/LangContext';
import { useToast } from '../../context/ToastContext';
import FolderSource from '../FolderSource';
import { Section, Segmented, ErrorBox, Notice, Badge } from '../ui';
import { CATEGORIES } from './EntryForm';
import { nameCase } from '../../utils/names';
import { invoiceDoubts } from '../../utils/invoiceDoubts';

/**
 * V1 — Facturas leídas por la IA → libro (sesión 4).
 *
 * Fotos (JPG/PNG/WebP) o PDF, sueltos o una carpeta entera (F3). En el
 * navegador: los PDF con texto se extraen aquí; los escaneados y las fotos
 * se reducen y se envían a la IA (Gemini lee imágenes y PDF) SOLO para
 * leerlos: el archivo no se guarda. Lo que se guarda son los DATOS que el
 * usuario revisa y confirma, factura a factura, junto a la vista previa
 * del documento (sesión 10). Solo se marcan los campos dudosos.
 * Coste: 1 análisis por lectura, aunque vaya en varios lotes (job).
 */
// XML: facturas electrónicas estructuradas (Facturae/UBL/CII) → sin IA.
const XML_EXT = ['.xml', '.xsig'];
const ACCEPT_EXT = ['.pdf', ...IMAGE_EXT, ...XML_EXT];
const accept = (name) => ACCEPT_EXT.includes(extOf(name)) && !name.startsWith('.');
const MAX_INVOICES = 60;
const PER_BATCH = 5;
const BATCH_BYTES = 6 * 1024 * 1024;
const MAX_PDF_BYTES = 4 * 1024 * 1024;
// Importes con dos decimales en la revisión ("96,60", no "96,6").
const money2 = (v) => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? '' : Number(v).toFixed(2));

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

  // Archivo de cada factura, para la vista previa (se pinta en el navegador).
  const files = useMemo(() => new Map((picked?.files || []).map(f => [f.name, f])), [picked]);

  const onPick = ({ name, files }) => {
    setError(null); setErrors([]);
    setPicked({ name, files: files.slice(0, MAX_INVOICES), skipped: Math.max(0, files.length - MAX_INVOICES) });
  };

  /**
   * Prepara cada archivo. Primero intenta leerlo SIN IA (factura electrónica
   * XML o PDF con XML embebido Factur-X/ZUGFeRD): { local: [facturas] }.
   * Si no, texto (PDF con texto) o imagen (foto o PDF escaneado) para la IA.
   */
  const prepare = async (file) => {
    const ext = extOf(file.name);
    if (XML_EXT.includes(ext)) {
      const { parseEInvoiceXml } = await import('../../middleware/einvoice');
      const local = parseEInvoiceXml(await file.text(), file.name);
      if (!local?.length) throw Object.assign(new Error('xml'), { code: 'ERR_FILE_TYPE', fileName: file.name });
      return { local };
    }
    if (ext === '.pdf') {
      try {
        const { parseEmbeddedPdfInvoice } = await import('../../middleware/einvoice');
        const local = await parseEmbeddedPdfInvoice(file);
        if (local?.length) return { local };
      } catch { /* PDF normal: sigue por texto/imagen */ }
    }
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
      type, file_name: inv.file_name, is_invoice: inv.is_invoice, source_format: inv.source_format || null,
      invoice_date: inv.invoice_date, due_date: inv.due_date || '', party_name: nameCase(party.name || ''), party_nif: party.nif || '',
      invoice_number: inv.invoice_number, concept: inv.concept, category: inv.category,
      base: money2(inv.base), vat_rate: inv.vat_rate, vat_amount: money2(inv.vat_amount), irpf_rate: inv.irpf_rate, irpf_amount: money2(inv.irpf_amount), total: money2(inv.total),
      paid: type === 'expense'
    };
  };

  const run = async () => {
    setPhase('reading'); setError(null); setErrors([]); setRows([]);
    const prepared = [], errs = [], found = [];
    for (const [i, f] of picked.files.entries()) {
      setProgress({ label: t('finance.import.preparing'), n: i + 1, total: picked.files.length });
      try {
        const p = await prepare(f);
        if (p.local) found.push(...p.local); else prepared.push(p);
      } catch (e) { errs.push(fileErrorMessage(t, e, f.name)); }
    }
    // Lotes de ≤5 facturas y ≤6 MB.
    const batches = [];
    let cur = [], size = 0;
    for (const p of prepared) {
      if (cur.length && (cur.length >= PER_BATCH || size + p.bytes > BATCH_BYTES)) { batches.push(cur); cur = []; size = 0; }
      cur.push(p); size += p.bytes;
    }
    if (cur.length) batches.push(cur);

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
          <p className="text-xs -mt-2" style={{ color: 'var(--text-muted)' }}>{t('finance.import.xmlFree')}</p>
          {picked && (
            <>
              <Notice icon={Info}>
                {(() => {
                  // Las facturas electrónicas XML se leen sin IA: no gastan cuota.
                  const xml = picked.files.filter(f => XML_EXT.some(e => f.name.toLowerCase().endsWith(e))).length;
                  if (xml === picked.files.length) return t('finance.import.willReadFree', { n: xml });
                  return `${t('finance.import.willRead', { n: picked.files.length })}${xml ? ` ${t('finance.import.xmlInBatch', { n: xml })}` : ''}`;
                })()}
                {picked.skipped > 0 && ` ${t('finance.import.capped').replace('{max}', MAX_INVOICES)}`}
                <span className="block mt-1 break-all" style={{ color: 'var(--text-primary)' }}>
                  {picked.name && <strong className="font-medium">{picked.name}/ </strong>}
                  {picked.files.slice(0, 3).map(f => f.name).join(' · ')}
                  {picked.files.length > 3 && ` ${t('finance.import.andMore', { n: picked.files.length - 3 })}`}
                </span>
              </Notice>
              <div><button onClick={run} disabled={!picked.files.length} className="btn btn-primary"><ScanLine size={15} /> {t('finance.import.start')}</button></div>
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
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{t('finance.import.reviewHint')}</p>
          {errors.slice(0, 3).map((e, i) => <ErrorBox key={i} code={e.code}>{e.message}</ErrorBox>)}
          {error && <ErrorBox>{error}</ErrorBox>}
          {(() => {
            const included = rows.filter(x => x.include);
            return rows.map(r => (
              <InvoiceCard key={r.key} r={r} update={update}
                file={files.get(r.file_name) || files.get(String(r.file_name).replace(/ \(\d+\)$/, ''))}
                dupe={!!dupes?.includes(included.indexOf(r))} />
            ));
          })()}
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

/**
 * Vista previa como imagen data: (la CSP no admite blob: en img ni frames):
 * foto reducida o 1.ª página del PDF. Se genera al acercarse la tarjeta a la
 * pantalla, para no pintar 60 PDF de golpe.
 */
function useDocPreview(file, active) {
  const ref = useRef(null);
  const [state, setState] = useState({ src: null, failed: false });
  useEffect(() => {
    if (!file || !active || !ref.current || state.src) return;
    let cancelled = false;
    const load = async () => {
      try {
        const img = IMAGE_EXT.includes(extOf(file.name))
          ? await imageToJpeg(file, { maxDim: 1400 })
          : await (await import('../../middleware/pdfExtract')).renderPdfFirstPage(file, { maxDim: 1400 });
        if (!cancelled) setState({ src: `data:${img.mime};base64,${img.data}`, failed: false });
      } catch { if (!cancelled) setState({ src: null, failed: true }); }
    };
    const io = new IntersectionObserver((entries) => {
      if (entries.some(e => e.isIntersecting)) { io.disconnect(); load(); }
    }, { rootMargin: '400px' });
    io.observe(ref.current);
    return () => { cancelled = true; io.disconnect(); };
  }, [file, active]); // eslint-disable-line react-hooks/exhaustive-deps
  return [ref, state];
}

/** Una factura leída: documento a la izquierda, campos a la derecha. */
function InvoiceCard({ r, update, file, dupe }) {
  const { t } = useLang();
  const [showDoc, setShowDoc] = useState(false);
  const [previewRef, preview] = useDocPreview(r.source_format ? null : file, r.include);
  const doubts = r.is_invoice ? invoiceDoubts(r) : {};
  const nDoubts = Object.keys(doubts).length;
  const set = (k) => (e) => update(r.key, k, e.target.value);
  const doubt = (k) => doubts[k] && (
    <p className="text-xs mt-1 flex items-start gap-1" style={{ color: 'var(--warning)' }}>
      <AlertTriangle size={12} className="mt-0.5 shrink-0" /> {t(`finance.import.doubts.${doubts[k]}`)}
    </p>
  );
  const box = (k) => ({ borderColor: doubts[k] ? 'var(--warning)' : undefined });
  const field = (k, label, props = {}, className = '') => (
    <div className={className}>
      <label htmlFor={`${r.key}-${k}`} className="field-label">{label}</label>
      <input id={`${r.key}-${k}`} value={r[k] ?? ''} onChange={set(k)} className="input" style={box(k)} {...props} />
      {doubt(k)}
    </div>
  );
  const money = (k, label, strong) => (
    <div>
      <label htmlFor={`${r.key}-${k}`} className="field-label">{label}</label>
      <div className="relative">
        <input id={`${r.key}-${k}`} type="number" step="0.01" inputMode="decimal" value={r[k] ?? ''} onChange={set(k)}
          className={`input text-right tabular-nums !pr-7 ${strong ? 'font-semibold' : ''}`} style={box(k)} />
        <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-sm pointer-events-none" style={{ color: 'var(--text-muted)' }}>€</span>
      </div>
      {doubt(k)}
    </div>
  );

  const status = r.source_format ? <Badge tone="accent"><Check size={11} /> {r.source_format}</Badge>
    : !r.is_invoice ? <Badge tone="muted">{t('finance.import.notInvoice')}</Badge>
    : dupe ? <Badge tone="warning">{t('finance.import.duplicate')}</Badge>
    : nDoubts ? <Badge tone="warning"><AlertTriangle size={11} /> {t('finance.import.toCheck', { n: nDoubts })}</Badge>
    : <Badge tone="positive"><Check size={11} /> {t('finance.import.allGood')}</Badge>;

  const doc = preview.src ? (
    <img src={preview.src} alt={r.file_name} className="w-full max-h-[640px] object-contain object-top rounded-lg" style={{ border: '1px solid var(--border)', background: '#fff' }} />
  ) : (
    <div className="h-full min-h-[160px] rounded-lg flex flex-col items-center justify-center gap-2 p-4 text-center text-xs" style={{ background: 'var(--surface-2)', color: 'var(--text-muted)' }}>
      {r.source_format ? <><FileCode2 size={20} /> {t('finance.import.xmlNoPreview')}</>
        : preview.failed || !file ? <><FileText size={20} /> {t('finance.import.noPreview')}</>
        : <Loader2 size={20} className="animate-spin" />}
    </div>
  );

  return (
    <article className="rounded-xl" style={{ border: '1px solid var(--border)', opacity: r.include ? 1 : 0.6 }}>
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-3.5 py-2.5" style={{ borderBottom: '1px solid var(--border)' }}>
        <label className="flex items-center gap-2 text-sm font-medium min-w-0 basis-full sm:basis-0 sm:flex-1 cursor-pointer" style={{ color: 'var(--text-primary)' }}>
          <input type="checkbox" checked={r.include} onChange={(e) => update(r.key, 'include', e.target.checked)} className="w-4 h-4 shrink-0" />
          <FileText size={15} className="shrink-0" style={{ color: 'var(--text-muted)' }} />
          <span className="truncate" title={r.file_name}>{r.file_name}</span>
        </label>
        {status}
        <button type="button" onClick={() => setShowDoc(v => !v)} className="btn btn-ghost btn-sm lg:hidden ml-auto">
          {showDoc ? <EyeOff size={14} /> : <Eye size={14} />} {t(showDoc ? 'finance.import.hideDoc' : 'finance.import.showDoc')}
        </button>
      </header>
      {r.include && (
        <div className="grid lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] gap-4 p-3.5">
          <div ref={previewRef} className={showDoc ? '' : 'hidden lg:block'}>{doc}</div>
          <div className="grid grid-cols-2 gap-x-3 gap-y-3 content-start">
            <div className="col-span-2">
              <Segmented value={r.type} onChange={(v) => update(r.key, 'type', v)} size="sm" options={[
                { value: 'expense', label: t('finance.expense') }, { value: 'income', label: t('finance.income') }
              ]} />
            </div>
            {field('party_name', r.type === 'income' ? t('finance.client') : t('finance.supplier'), {}, 'col-span-2')}
            {field('party_nif', t('finance.nif'), { autoCapitalize: 'characters' })}
            {field('invoice_number', t('finance.invoiceNumber'))}
            {field('invoice_date', t('finance.date'), { type: 'date' })}
            {field('due_date', t('finance.dueDate'), { type: 'date' })}
            {field('concept', t('finance.concept'), {}, 'col-span-2')}
            <div className="col-span-2 sm:col-span-1">
              <label htmlFor={`${r.key}-category`} className="field-label">{t('finance.category')}</label>
              <select id={`${r.key}-category`} value={r.category || ''} onChange={set('category')} className="input">
                <option value="">—</option>
                {CATEGORIES.map(([v, k]) => <option key={v} value={v}>{t(`finance.categories.${k}`)}</option>)}
              </select>
            </div>
            <label className="col-span-2 sm:col-span-1 flex items-center gap-2 text-sm sm:mt-6" style={{ color: 'var(--text-secondary)' }}>
              <input type="checkbox" checked={!!r.paid} onChange={(e) => update(r.key, 'paid', e.target.checked)} className="w-4 h-4" />
              {r.type === 'income' ? t('finance.collected') : t('finance.paid')}
            </label>
            {money('base', t('finance.base'))}
            {money('vat_amount', `${t('finance.vat')}${r.vat_rate !== '' && r.vat_rate != null ? ` (${r.vat_rate} %)` : ''}`)}
            {money('irpf_amount', t('finance.irpf'))}
            {money('total', t('finance.total'), true)}
          </div>
        </div>
      )}
    </article>
  );
}
