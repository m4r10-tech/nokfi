import { Link } from 'react-router-dom';
import { Copy, KeyRound, Workflow, FileJson, Lock } from 'lucide-react';
import { useLang } from '../context/LangContext';
import { useToast } from '../context/ToastContext';
import { usePageMeta } from '../hooks/usePageMeta';
import { PublicHeader, PublicFooter } from '../components/PublicChrome';

/**
 * F4 — Documentación pública de la API v1 (sesión 4): autenticación,
 * endpoints, ejemplo con curl y ejemplo de flujo n8n. La especificación
 * completa está en /api/v1/openapi.json.
 */
const CURL = `curl -X POST https://nokfi.app/api/v1/analyze \\
  -H "Authorization: Bearer nk_live_TU_CLAVE" \\
  -H "Content-Type: application/json" \\
  -d '{
    "type": "excel",
    "lang": "es",
    "title": "Ventas de septiembre",
    "data": {
      "module": "ventas",
      "files": [{ "name": "ventas.csv", "rows": [
        { "producto": "Camiseta", "unidades": 12, "importe": 240 },
        { "producto": "Gorra", "unidades": 3, "importe": 45 }
      ]}]
    }
  }'`;

const N8N = `{
  "nodes": [
    { "name": "Cada lunes", "type": "n8n-nodes-base.scheduleTrigger",
      "parameters": { "rule": { "interval": [{ "field": "weeks", "triggerAtDay": [1], "triggerAtHour": 8 }] } } },
    { "name": "Leer hoja de ventas", "type": "n8n-nodes-base.googleSheets",
      "parameters": { "operation": "read" } },
    { "name": "Analizar con Nokfi", "type": "n8n-nodes-base.httpRequest",
      "parameters": {
        "method": "POST", "url": "https://nokfi.app/api/v1/analyze",
        "authentication": "genericCredentialType", "genericAuthType": "httpBearerAuth",
        "sendBody": true, "specifyBody": "json",
        "jsonBody": "={{ { type: 'excel', lang: 'es', data: { module: 'ventas', files: [{ name: 'ventas', rows: $input.all().map(i => i.json).slice(0, 80) }] } } }}"
      } },
    { "name": "Enviar resumen", "type": "n8n-nodes-base.emailSend",
      "parameters": { "subject": "Informe Nokfi", "text": "={{ $json.report.summary }}" } }
  ]
}`;

const ENDPOINTS = [
  ['GET', '/api/v1/usage', 'usage'],
  ['POST', '/api/v1/analyze', 'analyze'],
  ['GET', '/api/v1/analyses', 'list'],
  ['GET', '/api/v1/analyses/{id}', 'get'],
  ['GET', '/api/v1/openapi.json', 'openapi']
];

export default function ApiDocs() {
  const { t } = useLang();
  const toast = useToast();
  usePageMeta(t('apiDocs.metaTitle'), t('apiDocs.metaDesc'));
  const copy = async (text) => { try { await navigator.clipboard.writeText(text); toast.success(t('common.copied')); } catch { /* nada */ } };

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--bg-base)' }}>
      <PublicHeader />
      <main className="flex-1 w-full max-w-3xl mx-auto px-4 py-10 md:py-14 flex flex-col gap-8">
        <header>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] mb-2" style={{ color: 'var(--accent-text)' }}>API v1</p>
          <h1 className="text-3xl font-semibold tracking-tight" style={{ color: 'var(--text-primary)' }}>{t('apiDocs.title')}</h1>
          <p className="mt-3 text-base" style={{ color: 'var(--text-secondary)' }}>{t('apiDocs.intro')}</p>
          <p className="mt-3 text-sm inline-flex items-center gap-2 rounded-full px-3 py-1" style={{ background: 'var(--surface-1)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
            <Lock size={13} /> {t('apiDocs.plans')}
          </p>
        </header>

        <Block icon={KeyRound} title={t('apiDocs.authTitle')}>
          <p>{t('apiDocs.authText')}</p>
          <Code text="Authorization: Bearer nk_live_…" onCopy={copy} />
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{t('apiDocs.limits')}</p>
        </Block>

        <Block icon={FileJson} title={t('apiDocs.endpoints')}>
          <ul className="flex flex-col gap-2">
            {ENDPOINTS.map(([m, path, k]) => (
              <li key={path} className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3">
                <code className="text-xs font-semibold rounded px-1.5 py-0.5 self-start" style={{ background: m === 'POST' ? 'var(--accent-soft)' : 'var(--surface-2)', color: m === 'POST' ? 'var(--accent-text)' : 'var(--text-secondary)' }}>{m}</code>
                <code className="text-sm" style={{ color: 'var(--text-primary)' }}>{path}</code>
                <span className="text-sm sm:ml-auto" style={{ color: 'var(--text-secondary)' }}>{t(`apiDocs.ep_${k}`)}</span>
              </li>
            ))}
          </ul>
          <p className="text-sm">{t('apiDocs.types')}</p>
        </Block>

        <Block title={t('apiDocs.example')}>
          <Code text={CURL} onCopy={copy} />
          <p className="text-sm">{t('apiDocs.response')}</p>
        </Block>

        <Block icon={Workflow} title={t('apiDocs.n8nTitle')}>
          <ol className="list-decimal pl-5 flex flex-col gap-1.5 text-sm">
            {(Array.isArray(t('apiDocs.n8nSteps')) ? t('apiDocs.n8nSteps') : []).map((s, i) => <li key={i}>{s}</li>)}
          </ol>
          <Code text={N8N} onCopy={copy} />
        </Block>

        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          {t('apiDocs.spec')} <a href="/api/v1/openapi.json" className="link">/api/v1/openapi.json</a> · <Link to="/app/configuracion" className="link">{t('apiDocs.createKey')}</Link>
        </p>
      </main>
      <PublicFooter />
    </div>
  );
}

function Block({ icon: Icon, title, children }) {
  return (
    <section className="flex flex-col gap-3 text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
      <h2 className="text-lg font-semibold flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>{Icon && <Icon size={18} style={{ color: 'var(--accent-text)' }} />}{title}</h2>
      {children}
    </section>
  );
}

function Code({ text, onCopy }) {
  return (
    <div className="relative rounded-xl overflow-hidden" style={{ background: 'var(--surface-1)', border: '1px solid var(--border)' }}>
      <button onClick={() => onCopy(text)} className="absolute top-2 right-2 btn btn-ghost btn-sm !px-2" aria-label="Copy"><Copy size={14} /></button>
      <pre className="p-4 pr-12 text-xs overflow-x-auto" style={{ color: 'var(--text-primary)' }}><code>{text}</code></pre>
    </div>
  );
}
