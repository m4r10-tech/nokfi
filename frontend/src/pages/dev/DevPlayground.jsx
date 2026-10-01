import { useState, useMemo } from 'react';
import { Play, Loader2, RotateCcw } from 'lucide-react';
import { devApi } from '../../middleware/api';
import { apiErrorMessage } from '../../middleware/errors';
import { useLang } from '../../context/LangContext';
import { useAuth } from '../../context/AuthContext';
import PageHeader from '../../components/PageHeader';
import CodeBlock from '../../components/dev/CodeBlock';
import { Section, Segmented, Badge, ErrorBox, Notice, Field } from '../../components/ui';
import { OPERATIONS, opById, snippets } from '../../utils/devSnippets';

const LIVE_PLANS = ['pro', 'max'];

/**
 * Sesión 9 — Desarrolladores › Playground: se elige la operación, se edita la
 * entrada y se ejecuta con la sesión (sin pegar la clave en el navegador).
 * Debajo, el mismo ejemplo listo para curl, JavaScript, Python y n8n.
 * Modo prueba en todos los planes; modo real en Pro y Max.
 */
export default function DevPlayground() {
  const { t } = useLang();
  const { license } = useAuth();
  const liveOk = LIVE_PLANS.includes(license?.plan);
  const [opId, setOpId] = useState('tax.nif');
  const [mode, setMode] = useState('test');
  const [text, setText] = useState(() => JSON.stringify(opById('tax.nif').example, null, 2));
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [lang, setLang] = useState('curl');

  const op = opById(opId);
  const parsed = useMemo(() => { try { const v = JSON.parse(text || '{}'); return v && typeof v === 'object' && !Array.isArray(v) ? v : null; } catch { return null; } }, [text]);
  const code = useMemo(() => (parsed ? snippets(op, parsed, { test: mode === 'test' }) : null), [op, parsed, mode]);

  const pick = (id) => { setOpId(id); setText(JSON.stringify(opById(id).example, null, 2)); setResult(null); setError(null); if (opById(id).testOnly) setMode('test'); };

  const run = async (e) => {
    e.preventDefault();
    if (!parsed) return;
    setRunning(true); setError(null);
    const res = await devApi.playground({ operation: opId, mode, input: parsed });
    setRunning(false);
    if (res.ok) setResult(res.data); else { setResult(null); setError(apiErrorMessage(t, res)); }
  };

  const ok = result && result.status < 400;
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={t('dev.pgTitle')} description={t('dev.pgDesc')} />

      <Section>
        <form onSubmit={run} className="flex flex-col gap-4">
          <div className="grid sm:grid-cols-[1fr_auto] gap-3 items-end">
            <Field label={t('dev.pgOperation')} htmlFor="pg-op">
              <select id="pg-op" value={opId} onChange={(e) => pick(e.target.value)} className="input">
                <optgroup label={t('dev.pgGroupTax')}>
                  {OPERATIONS.filter(o => o.id.startsWith('tax.')).map(o => <option key={o.id} value={o.id}>{t(`dev.op_${o.id.replace(/[.-]/g, '_')}`)}</option>)}
                </optgroup>
                <optgroup label={t('dev.pgGroupAi')}>
                  {OPERATIONS.filter(o => o.ai).map(o => <option key={o.id} value={o.id}>{t(`dev.op_${o.id.replace(/[.-]/g, '_')}`)}</option>)}
                </optgroup>
                <optgroup label={t('dev.pgGroupInvoicing')}>
                  {OPERATIONS.filter(o => o.group === 'invoicing').map(o => <option key={o.id} value={o.id}>{t(`dev.op_${o.id.replace(/[.-]/g, '_')}`)}</option>)}
                </optgroup>
                <optgroup label={t('dev.pgGroupAccount')}>
                  <option value="usage">{t('dev.op_usage')}</option>
                </optgroup>
              </select>
            </Field>
            <div className="flex flex-col">
              <span className="field-label">{t('dev.modeLabel')}</span>
              <Segmented value={mode} onChange={(v) => { if (v === 'live' && (!liveOk || op.testOnly)) return; setMode(v); }} label={t('dev.modeLabel')}
                options={[{ value: 'test', label: t('dev.modeTest') }, { value: 'live', label: t('dev.modeLive') }]} />
            </div>
          </div>
          <p className="text-xs -mt-2" style={{ color: 'var(--text-muted)' }}>
            <code>{op.method} /api/v1{op.path}</code> · {op.ai ? (mode === 'live' ? t('dev.pgUsesQuota') : t('dev.pgSample')) : t('dev.pgNoQuota')}
            {!liveOk && ` · ${t('dev.pgLiveLocked')}`}
            {op.testOnly && ` · ${t('dev.pgTestOnly')}`}
          </p>

          <Field label={t('dev.pgInput')} htmlFor="pg-input" hint={parsed ? null : t('dev.pgBadJson')}>
            <textarea id="pg-input" value={text} onChange={(e) => setText(e.target.value)} spellCheck={false} rows={Math.min(14, Math.max(4, text.split('\n').length))}
              className="input font-mono text-xs !h-auto py-2" style={parsed ? undefined : { borderColor: 'var(--negative)' }} />
          </Field>
          <div className="flex flex-wrap gap-2">
            <button type="submit" disabled={running || !parsed} className="btn btn-primary">{running ? <Loader2 size={15} className="animate-spin" /> : <Play size={15} />} {t('dev.pgRun')}</button>
            <button type="button" onClick={() => pick(opId)} className="btn btn-ghost"><RotateCcw size={14} /> {t('dev.pgReset')}</button>
          </div>
          {error && <ErrorBox>{error}</ErrorBox>}
        </form>
      </Section>

      {result && (
        <Section title={t('dev.pgResponse')} aside={
          <span className="flex items-center gap-2">
            <Badge tone={ok ? 'positive' : 'negative'}>{result.status}</Badge>
            <span className="text-xs tabular" style={{ color: 'var(--text-muted)' }}>{result.ms} ms</span>
            {!result.livemode && <Badge tone="accent">{t('dev.testBadge')}</Badge>}
          </span>
        }>
          {result.uses_quota && ok && <div className="mb-3"><Notice>{t('dev.pgUsedQuota')}</Notice></div>}
          <CodeBlock text={JSON.stringify(result.body, null, 2)} maxHeight={480} label={t('dev.pgResponse')} wrap />
        </Section>
      )}

      {code && (
        <Section title={t('dev.pgCode')} aside={
          <Segmented size="sm" value={lang} onChange={setLang} label={t('dev.pgCode')}
            options={[{ value: 'curl', label: 'curl' }, { value: 'js', label: 'JavaScript' }, { value: 'python', label: 'Python' }, { value: 'n8n', label: 'n8n' }]} />
        }>
          <CodeBlock text={code[lang]} label={lang} />
          <p className="text-xs mt-2" style={{ color: 'var(--text-muted)' }}>{lang === 'n8n' ? t('dev.pgN8nHint') : t('dev.pgKeyHint')}</p>
        </Section>
      )}
    </div>
  );
}
