import { Link } from 'react-router-dom';
import { Copy, KeyRound, Workflow, FileJson, Lock, Receipt, Bot, Calculator, Webhook, FlaskConical } from 'lucide-react';
import { useLang } from '../context/LangContext';
import { useToast } from '../context/ToastContext';
import { useSeo } from '../seo/useSeo';
import { PublicHeader, PublicFooter } from '../components/PublicChrome';
import { N8N_TEMPLATES } from './dev/templates';

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

const CURL_INVOICES = `curl -X POST https://nokfi.app/api/v1/invoices/extract \\
  -H "Authorization: Bearer nk_live_TU_CLAVE" \\
  -H "Content-Type: application/json" \\
  -d "{\\"files\\": [{\\"name\\": \\"factura.pdf\\", \\"mime\\": \\"application/pdf\\",
        \\"data\\": \\"$(base64 -w0 factura.pdf)\\"}]}"`;

const INVOICE_RESPONSE = `{
  "invoices": [{
    "file_name": "factura.pdf",
    "issuer_name": "Talleres Ruiz SL", "issuer_nif": "B12345674",
    "invoice_number": "F-2026-017", "invoice_date": "2026-09-14",
    "base": 1000, "vat_rate": 21, "vat_amount": 210, "irpf_amount": 0, "total": 1210,
    "checks": { "totals_ok": true, "nif_valid": true, "recipient_nif_valid": null,
                "date_valid": true, "vat_rate_valid": true },
    "warnings": []
  }],
  "errors": []
}`;

// Sesión 7 — servidor MCP: mismas herramientas y misma clave que la API.
const MCP_SNIPPETS = [
  ['Claude Code', `claude mcp add --transport http nokfi https://nokfi.app/api/mcp \\
  --header "Authorization: Bearer nk_live_TU_CLAVE"`],
  ['Claude Desktop', `{
  "mcpServers": {
    "nokfi": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "https://nokfi.app/api/mcp",
               "--header", "Authorization: Bearer nk_live_TU_CLAVE"]
    }
  }
}`],
  ['Cursor · VS Code', `{
  "mcpServers": {
    "nokfi": {
      "url": "https://nokfi.app/api/mcp",
      "headers": { "Authorization": "Bearer nk_live_TU_CLAVE" }
    }
  }
}`],
  ['n8n (AI Agent → MCP Client Tool)', `Endpoint: https://nokfi.app/api/mcp
Server Transport: HTTP Streamable
Authentication: Bearer Auth → nk_live_TU_CLAVE`]
];

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
        "jsonBody": "={{ { type: 'excel', lang: 'es', data: { module: 'ventas', files: [{ name: 'ventas', rows: $input.all().map(i => i.json).slice(0, 5000), total_rows: $input.all().length }] } } }}"
      } },
    { "name": "Enviar resumen", "type": "n8n-nodes-base.emailSend",
      "parameters": { "subject": "Informe Nokfi", "text": "={{ $json.report.summary }}" } }
  ]
}`;

// Sesión 9 — Bloque 2.
const CURL_TAX = `curl "https://nokfi.app/api/v1/tax/nif?value=B12345674" \\
  -H "Authorization: Bearer nk_live_TU_CLAVE"

curl -X POST https://nokfi.app/api/v1/tax/withholding \\
  -H "Authorization: Bearer nk_live_TU_CLAVE" \\
  -H "Content-Type: application/json" \\
  -d '{ "base": 1000, "type": "professional" }'
# → { "withholding_rate": 15, "withholding_amount": 150, "vat_amount": 210, "total_invoice": 1060, … }`;

const CURL_ASYNC = `curl -X POST "https://nokfi.app/api/v1/invoices/extract?async=true" \\
  -H "Authorization: Bearer nk_live_TU_CLAVE" \\
  -H "Idempotency-Key: factura-2026-017" \\
  -H "Content-Type: application/json" \\
  -d '{ "files": [{ "name": "f.pdf", "mime": "application/pdf", "data": "JVBERi0x…" }] }'
# → 202 { "id": "job_3f9c…", "status": "queued", … }

curl https://nokfi.app/api/v1/jobs/job_3f9c… -H "Authorization: Bearer nk_live_TU_CLAVE"
# → { "status": "succeeded", "result": { "invoices": [ … ] } }`;

const CURL_ISSUE = `curl -X POST https://nokfi.app/api/v1/invoices \\
  -H "Authorization: Bearer nk_live_TU_CLAVE" \\
  -H "Idempotency-Key: pedido-1001" \\
  -H "Content-Type: application/json" \\
  -d '{ "customer": { "name": "Bodegas Sur SA", "tax_id": "A58818501",
        "address": "Ctra. Jerez 4", "postal_code": "11401", "city": "Jerez" },
        "irpf_rate": 15,
        "lines": [{ "description": "Diseño de etiqueta", "quantity": 1, "unit_price": 800, "vat_rate": 21 }] }'
# → 201 { "id": 42, "number": "F2026-0001", "kind": "F1", "base": 800, "vat_amount": 168,
#         "irpf_amount": 120, "total": 848, "livemode": true, … }

curl https://nokfi.app/api/v1/invoices/42/pdf -H "Authorization: Bearer nk_live_TU_CLAVE" -o F2026-0001.pdf`;

const EVENT = `POST https://tu-servidor/webhook
Nokfi-Signature: t=1790000000,v1=5f2b…   (HMAC-SHA256 de "t.cuerpo" con tu whsec_…)
Nokfi-Event: job.completed
Nokfi-Event-Id: evt_91c0…

{ "id": "evt_91c0…", "type": "job.completed", "created_at": "2026-10-01T09:12:03Z",
  "livemode": true, "data": { "job_id": "job_3f9c…", "kind": "invoices.extract",
  "status": "succeeded", "result": { "invoices": [ … ] } } }`;

const ENDPOINTS = [
  ['GET', '/api/v1/usage', 'usage'],
  ['POST', '/api/v1/invoices/extract', 'invoices'],
  ['POST', '/api/v1/analyze', 'analyze'],
  ['GET', '/api/v1/analyses', 'list'],
  ['GET', '/api/v1/analyses/{id}', 'get'],
  ['GET', '/api/v1/jobs/{id}', 'job'],
  ['POST', '/api/v1/invoices', 'issue'],
  ['GET', '/api/v1/invoices/{id}', 'invoice_get'],
  ['POST', '/api/v1/invoices/{id}/rectify', 'rectify'],
  ['POST', '/api/v1/invoices/{id}/cancel', 'cancel'],
  ['POST', '/api/v1/invoices/{id}/status', 'status'],
  ['GET', '/api/v1/invoices/{id}/pdf · /xml', 'files'],
  ['GET · POST', '/api/v1/customers', 'customers'],
  ['GET · POST', '/api/v1/webhooks', 'webhooks'],
  ['GET', '/api/v1/tax/nif', 'tax_nif'],
  ['POST', '/api/v1/tax/vat', 'tax_vat'],
  ['POST', '/api/v1/tax/withholding', 'tax_withholding'],
  ['POST', '/api/v1/tax/model-130', 'tax_130'],
  ['GET', '/api/v1/tax/quarter', 'tax_quarter'],
  ['GET', '/api/v1/tax/calendar', 'tax_calendar'],
  ['GET', '/api/v1/openapi.json', 'openapi']
];

export default function ApiDocs() {
  const { t } = useLang();
  const toast = useToast();
  useSeo({ title: t('apiDocs.metaTitle'), description: t('apiDocs.metaDesc') });
  const copy = async (text) => { try { await navigator.clipboard.writeText(text); toast.success(t('common.copied')); } catch { /* nada */ } };

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--bg-base)' }}>
      <PublicHeader />
      <main className="flex-1 w-full max-w-3xl mx-auto px-4 py-10 md:py-14 flex flex-col gap-8">
        <header>
          <p className="text-sm font-medium mb-2" style={{ color: 'var(--accent-text)' }}>API v1</p>
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
                <code className="text-xs font-semibold rounded px-1.5 py-0.5 self-start" style={{ background: m.includes('POST') ? 'var(--accent-soft)' : 'var(--surface-2)', color: m.includes('POST') ? 'var(--accent-text)' : 'var(--text-secondary)' }}>{m}</code>
                <code className="text-sm" style={{ color: 'var(--text-primary)' }}>{path}</code>
                <span className="text-sm sm:ml-auto" style={{ color: 'var(--text-secondary)' }}>{t(`apiDocs.ep_${k}`)}</span>
              </li>
            ))}
          </ul>
          <p className="text-sm">{t('apiDocs.types')}</p>
        </Block>

        <Block icon={Receipt} title={t('apiDocs.invoicesTitle')}>
          <p>{t('apiDocs.invoicesText')}</p>
          <Code text={CURL_INVOICES} onCopy={copy} />
          <p>{t('apiDocs.invoicesChecks')}</p>
          <Code text={INVOICE_RESPONSE} onCopy={copy} />
        </Block>

        <Block icon={Receipt} title={t('apiDocs.issueTitle')}>
          <p>{t('apiDocs.issueText')}</p>
          <Code text={CURL_ISSUE} onCopy={copy} />
          <p>{t('apiDocs.issueRules')}</p>
        </Block>

        <Block icon={Calculator} title={t('apiDocs.taxTitle')}>
          <p>{t('apiDocs.taxText')}</p>
          <Code text={CURL_TAX} onCopy={copy} />
        </Block>

        <Block icon={Webhook} title={t('apiDocs.asyncTitle')}>
          <p>{t('apiDocs.asyncText')}</p>
          <Code text={CURL_ASYNC} onCopy={copy} />
          <p>{t('apiDocs.idemText')}</p>
          <p>{t('apiDocs.webhooksText')} {t('apiDocs.webhooksInvoices')}</p>
          <Code text={EVENT} onCopy={copy} />
        </Block>

        <Block icon={FlaskConical} title={t('apiDocs.testTitle')}>
          <p>{t('apiDocs.testText')}</p>
        </Block>

        <Block icon={Bot} title={t('apiDocs.mcpTitle')}>
          <p>{t('apiDocs.mcpText')}</p>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{t('apiDocs.mcpTools')}</p>
          {MCP_SNIPPETS.map(([label, code]) => (
            <div key={label} className="flex flex-col gap-1.5">
              <p className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>{label}</p>
              <Code text={code} onCopy={copy} />
            </div>
          ))}
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
          <p className="text-sm font-medium mt-2" style={{ color: 'var(--text-primary)' }}>{t('dev.templatesTitle')}</p>
          <ul className="flex flex-col gap-1.5">
            {N8N_TEMPLATES.map(tpl => (
              <li key={tpl.id}><a href={tpl.file} download className="link">{t(`dev.tpl_${tpl.id}_title`)}</a> <span className="text-xs" style={{ color: 'var(--text-muted)' }}>· JSON</span></li>
            ))}
          </ul>
        </Block>

        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          {t('apiDocs.spec')} <a href="/api/v1/openapi.json" className="link">/api/v1/openapi.json</a> · <Link to="/app/dev/claves" className="link">{t('apiDocs.createKey')}</Link>
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
