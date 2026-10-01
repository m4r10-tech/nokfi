/**
 * utils/devSnippets.js — sesión 9: operaciones del Playground, sus ejemplos y
 * los fragmentos listos para copiar (curl, JavaScript, Python y n8n).
 * La lista de operaciones es el espejo de OPERATIONS en backend/routes/dev.js.
 */

const EXCEL = {
  type: 'excel', lang: 'es', title: 'Ventas de septiembre',
  data: { module: 'ventas', files: [{ name: 'ventas.csv', rows: [
    { fecha: '2026-09-02', cliente: 'Clínica Sol', importe: 240 },
    { fecha: '2026-09-15', cliente: 'Bar Puerto', importe: 185.5 }
  ] }] }
};

export const OPERATIONS = [
  { id: 'tax.nif', method: 'GET', path: '/tax/nif', ai: false, example: { value: 'B12345674' } },
  { id: 'tax.vat', method: 'POST', path: '/tax/vat', ai: false, example: { amount: 1210, includes_vat: true } },
  { id: 'tax.withholding', method: 'POST', path: '/tax/withholding', ai: false, example: { base: 1000, type: 'professional' } },
  { id: 'tax.model-130', method: 'POST', path: '/tax/model-130', ai: false, example: { year: 2026, quarter: 3, income: 42000, expenses: 18500, previous_payments: 2900, withholdings: 600 } },
  { id: 'tax.quarter', method: 'GET', path: '/tax/quarter', ai: false, example: { year: 2026, quarter: 3 } },
  { id: 'tax.calendar', method: 'GET', path: '/tax/calendar', ai: false, example: { limit: 4 } },
  { id: 'invoices.extract', method: 'POST', path: '/invoices/extract', ai: true, example: { files: [{ name: 'factura-017.txt', text: 'Recambios Norte, S.L. · CIF B12345674 · Factura RN-2026-0412 · 14/09/2026 · Base 842,10 € · IVA 21 % 176,84 € · Total 1.018,94 €' }] } },
  { id: 'analyze', method: 'POST', path: '/analyze', ai: true, example: EXCEL },
  { id: 'usage', method: 'GET', path: '/usage', ai: false, example: {} },
  { id: 'invoices.issue', method: 'POST', path: '/invoices', ai: false, group: 'invoicing', testOnly: true, example: {
    customer: { name: 'Bodegas Sur SA', tax_id: 'A58818501', email: 'pagos@bodegassur.es', address: 'Ctra. Jerez 4', postal_code: '11401', city: 'Jerez' },
    irpf_rate: 15, lines: [{ description: 'Diseño de etiqueta', quantity: 1, unit_price: 800, vat_rate: 21 }]
  } },
  { id: 'invoices.list', method: 'GET', path: '/invoices', ai: false, group: 'invoicing', example: { limit: 10 } }
];

export const opById = (id) => OPERATIONS.find(o => o.id === id);

export const apiBase = () => `${typeof window !== 'undefined' ? window.location.origin : 'https://nokfi.app'}/api/v1`;

function query(input) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(input || {})) if (v !== undefined && v !== null && v !== '') p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : '';
}

const indent = (s, n) => s.split('\n').map((l, i) => (i ? ' '.repeat(n) + l : l)).join('\n');

/** Fragmentos para una operación y una entrada. keyVar: nombre de la variable con la clave. */
export function snippets(op, input, { test = false } = {}) {
  const base = apiBase();
  const url = op.method === 'GET' ? `${base}${op.path}${query(input)}` : `${base}${op.path}`;
  const body = JSON.stringify(input || {}, null, 2);
  const keyHint = test ? 'nk_test_…' : 'nk_live_…';
  const curl = op.method === 'GET'
    ? `# NOKFI_API_KEY=${keyHint}\ncurl "${url}" \\\n  -H "Authorization: Bearer $NOKFI_API_KEY"`
    : `# NOKFI_API_KEY=${keyHint}\ncurl -X POST "${url}" \\\n  -H "Authorization: Bearer $NOKFI_API_KEY" \\\n  -H "Content-Type: application/json" \\\n  -H "Idempotency-Key: $(uuidgen)" \\\n  -d '${body.replace(/'/g, "'\\''")}'`;
  const js = op.method === 'GET'
    ? `const res = await fetch('${url}', {\n  headers: { Authorization: \`Bearer \${process.env.NOKFI_API_KEY}\` }\n});\nconst data = await res.json();`
    : `const res = await fetch('${url}', {\n  method: 'POST',\n  headers: {\n    Authorization: \`Bearer \${process.env.NOKFI_API_KEY}\`,\n    'Content-Type': 'application/json',\n    'Idempotency-Key': crypto.randomUUID()\n  },\n  body: JSON.stringify(${indent(body, 2)})\n});\nconst data = await res.json();`;
  const py = op.method === 'GET'
    ? `import os, requests\n\nres = requests.get(\n    "${base}${op.path}",\n    params=${toPy(input || {}, 4)},\n    headers={"Authorization": f"Bearer {os.environ['NOKFI_API_KEY']}"},\n    timeout=120,\n)\ndata = res.json()`
    : `import os, uuid, requests\n\nres = requests.post(\n    "${url}",\n    json=${toPy(input || {}, 4)},\n    headers={\n        "Authorization": f"Bearer {os.environ['NOKFI_API_KEY']}",\n        "Idempotency-Key": str(uuid.uuid4()),\n    },\n    timeout=120,\n)\ndata = res.json()`;
  const node = {
    parameters: {
      method: op.method,
      url: op.method === 'GET' ? `${base}${op.path}` : url,
      authentication: 'genericCredentialType',
      genericAuthType: 'httpBearerAuth',
      ...(op.method === 'GET'
        ? { sendQuery: true, queryParameters: { parameters: Object.entries(input || {}).map(([name, value]) => ({ name, value: String(value) })) } }
        : { sendBody: true, specifyBody: 'json', jsonBody: body }),
      options: {}
    },
    name: `Nokfi · ${op.id}`,
    type: 'n8n-nodes-base.httpRequest',
    typeVersion: 4.2,
    position: [0, 0]
  };
  const n8n = JSON.stringify({ nodes: [node], connections: {} }, null, 2);
  return { curl, js, python: py, n8n };
}

/** JSON → literal de Python (True/False/None). */
function toPy(v, pad = 0) {
  const s = JSON.stringify(v, null, 4)
    .replace(/\btrue\b/g, 'True').replace(/\bfalse\b/g, 'False').replace(/\bnull\b/g, 'None');
  return indent(s, pad);
}
