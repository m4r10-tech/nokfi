#!/usr/bin/env node
/**
 * scripts/ia-local-prueba.js — banco de pruebas de la IA local (llama-server).
 *
 * Lanza las tareas reales de Nokfi (mismos constructores de prompts que la app)
 * contra un llama-server y, si se pide, contra Groq como referencia. Mide
 * tiempos y comprueba que la salida es utilizable (JSON válido y normalizable).
 * Sirve para elegir o cambiar de modelo. No toca la cuota ni la BD (solo lee
 * el libro de la licencia indicada para el contexto financiero).
 *
 * Uso (en el VPS, desde backend/):
 *   node scripts/ia-local-prueba.js --url http://127.0.0.1:8081 --label qwen35-4b \
 *        [--license 6] [--image factura.png] [--only cuestionario,chat] [--out ~/backups/ia-prueba]
 *   node scripts/ia-local-prueba.js --ref cloudflare --label cloudflare ...   (referencia en la nube)
 *   node scripts/ia-local-prueba.js --app --url http://127.0.0.1:8081 --label app ...
 *        (--app: por el mismo camino que la app: proveedor "local", filtro de cifras e idioma)
 */

'use strict';

const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };

const P = require('../services/ai/prompts');
const { toJsonSchema, PROVIDERS } = require('../services/ai/providers');
const { parseJsonLoose } = require('../services/ai/gemini');
const { requestLong } = require('../utils/http');
const { chatSystemPrompt } = require('../services/ai/chat');
const { financeContext } = require('../services/ai/financeContext');
const { computeHealth } = require('../utils/healthScore');
const { initDB, getCompanyProfile } = require('../db/database');

const LICENSE = Number(opt('license', 6));
const URL_LOCAL = opt('url', 'http://127.0.0.1:8081');
const LABEL = opt('label', 'local');
const OUT = opt('out', path.join(process.env.HOME || '.', 'backups', 'ia-prueba'));
const ONLY = opt('only', '').split(',').filter(Boolean);
const IMAGE = opt('image', '');

initDB();
const profile = getCompanyProfile(LICENSE) || {};

/* ── Casos (datos sintéticos realistas + el libro real de la licencia) ── */
function cases() {
  const out = [];
  const answers = {};
  Object.keys(P.QUESTIONNAIRE_ITEMS).forEach((id, i) => { answers[id] = [true, false, 'partial', true, false, 'na'][i % 6]; });
  const finance = financeContext(LICENSE, { lang: 'es' }).text;
  const q = P.buildQuestionnaire({ answers, health: computeHealth(answers), finance });
  out.push({ id: 'cuestionario', lang: 'es', kind: 'report', parts: [{ text: q.text }] });

  const rows = [];
  const conceptos = ['Venta taller', 'Venta recambios', 'Alquiler local', 'Nóminas', 'Suministros', 'Seguro', 'Publicidad'];
  for (let m = 1; m <= 9; m++) {
    for (const c of conceptos) {
      const ingreso = c.startsWith('Venta');
      rows.push({ fecha: `2026-${String(m).padStart(2, '0')}-15`, concepto: c, tipo: ingreso ? 'ingreso' : 'gasto', importe: Math.round((ingreso ? 4200 + m * 130 : 600 + m * 15) * (c === 'Nóminas' ? 4 : 1)) });
    }
  }
  const files = P.sanitizeFiles([{ name: 'cuentas-2026.xlsx', rows, total_rows: rows.length }], 3, 'en');
  const ex = P.buildExcel({ module: 'total', context: 'Taller mecánico, quiero saber el margen', files });
  out.push({ id: 'excel', lang: 'en', kind: 'report', parts: [{ text: ex.text }] });

  const inv = P.buildInvoices({ files: [
    { name: 'luz-septiembre.pdf', text: 'IBERDROLA CLIENTES S.A.U. CIF A95758389\nFactura nº 21092600123 Fecha emisión 28/09/2026\nTitular: Taller García Martínez NIF 21456789K\nPeriodo 01/09/2026-30/09/2026\nImporte energía 182,40 € Potencia 41,20 € Impuesto eléctrico 11,43 € Alquiler equipos 2,10 €\nBase imponible 237,13 € IVA 21% 49,80 € TOTAL FACTURA 286,93 €\nCargo en cuenta el 10/10/2026' },
    { name: 'gestoria-oct.pdf', text: 'Asesoría Ruiz y Asociados, NIF 33445566B\nFACTURA 2026-118 · 01/10/2026\nCliente: Taller García Martínez (21456789K)\nHonorarios asesoramiento fiscal y laboral octubre ........ 150,00\nBase 150,00 IVA 21% 31,50 Retención IRPF 15% -22,50 TOTAL 159,00 €' }
  ] });
  out.push({ id: 'facturas-texto', lang: 'es', kind: 'invoices', parts: inv.parts });

  if (IMAGE && fs.existsSync(IMAGE)) {
    const data = fs.readFileSync(IMAGE).toString('base64');
    const mime = IMAGE.endsWith('.png') ? 'image/png' : 'image/jpeg';
    const img = P.buildInvoices({ files: [{ name: path.basename(IMAGE), mime, data }] });
    out.push({ id: 'factura-foto', lang: 'es', kind: 'invoices', parts: img.parts });
  }

  const financeFr = financeContext(LICENSE, { lang: 'fr' }).text;
  out.push({
    id: 'chat', lang: 'fr', kind: 'chat',
    system: chatSystemPrompt({ profile, lang: 'fr', analysisContext: '', financeText: financeFr }),
    messages: [{ role: 'user', content: 'Combien je dois mettre de côté pour la TVA ce trimestre et qui me doit de l\'argent ?' }]
  });
  out.push({
    id: 'email-reclamacion', lang: 'de', kind: 'chat',
    system: 'Escribe emails de cobro educados y firmes para pymes. Solo el cuerpo del email, sin asunto. Responde en alemán.',
    messages: [{ role: 'user', content: 'Cliente: Müller GmbH. Factura F2026-0003 de 1.210,00 € vencida el 15/09/2026 (hace 39 días). Firma: Taller García.' }]
  });
  return ONLY.length ? out.filter(c => ONLY.includes(c.id)) : out;
}

/* ── Llamadas ── */
async function callLocal(c) {
  const isJson = c.kind !== 'chat';
  const schema = c.kind === 'report' ? P.REPORT_SCHEMA : c.kind === 'invoices' ? P.INVOICE_SCHEMA : null;
  const system = c.system || P.systemPrompt({ profile, lang: c.lang });
  const content = c.messages ? null : c.parts.map(p => p.inlineData
    ? { type: 'image_url', image_url: { url: `data:${p.inlineData.mimeType};base64,${p.inlineData.data}` } }
    : { type: 'text', text: p.text });
  const body = {
    messages: [{ role: 'system', content: system }, ...(c.messages || [{ role: 'user', content }])],
    max_tokens: isJson ? 3000 : 700,
    temperature: 0.3,
    chat_template_kwargs: { enable_thinking: false },
    ...(isJson ? { response_format: { type: 'json_schema', json_schema: { name: 'out', schema: toJsonSchema(schema) } } } : {})
  };
  const t0 = Date.now();
  const res = await requestLong(`${URL_LOCAL}/v1/chat/completions`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }, 20 * 60000);
  const data = await res.json();
  const ms = Date.now() - t0;
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${JSON.stringify(data).slice(0, 300)}`);
  const text = data.choices?.[0]?.message?.content || '';
  return { text, ms, timings: data.timings, usage: data.usage, finish: data.choices?.[0]?.finish_reason };
}

// Referencia: el proveedor en la nube indicado (cloudflare o groq), con la misma capa que la app.
async function callRef(c, name) {
  const t0 = Date.now();
  if (c.kind === 'chat') {
    const url = name === 'groq' ? 'https://api.groq.com/openai/v1/chat/completions'
      : `https://api.cloudflare.com/client/v4/accounts/${process.env.CF_ACCOUNT_ID}/ai/v1/chat/completions`;
    const key = name === 'groq' ? process.env.GROQ_API_KEY : process.env.CF_AI_TOKEN;
    const model = name === 'groq' ? (process.env.GROQ_CHAT_MODEL || 'openai/gpt-oss-120b') : (process.env.CF_AI_CHAT_MODEL || '@cf/meta/llama-3.3-70b-instruct-fp8-fast');
    const res = await fetch(url, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({ model, max_tokens: 700, temperature: 0.4, messages: [{ role: 'system', content: c.system }, ...c.messages] })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return { text: data.choices?.[0]?.message?.content || '', ms: Date.now() - t0 };
  }
  const schema = c.kind === 'report' ? P.REPORT_SCHEMA : P.INVOICE_SCHEMA;
  const r = await PROVIDERS[name].generate({ system: P.systemPrompt({ profile, lang: c.lang }), parts: c.parts, schema, maxTokens: 8000 });
  return { text: r.text, ms: Date.now() - t0 };
}

// Por el camino real de la app (services/ai): proveedor local + filtro de cifras.
async function callApp(c) {
  process.env.LOCAL_AI_URL = URL_LOCAL;
  process.env.CHAT_PROVIDERS = 'local';
  const chatMod = require('../services/ai/chat');
  const t0 = Date.now();
  if (c.kind === 'chat') {
    const r = await chatMod.freeText({ system: c.system, prompt: c.messages[0].content });
    return { text: r.text, ms: Date.now() - t0 };
  }
  const schema = c.kind === 'report' ? P.REPORT_SCHEMA : P.INVOICE_SCHEMA;
  const system = P.systemPrompt({ profile, lang: c.lang });
  const r = await PROVIDERS.local.generate({ system, parts: c.parts, schema, maxTokens: 8000, lang: c.lang });
  if (c.kind !== 'report') return { text: r.text, ms: Date.now() - t0 };
  const g = P.guardFigures(P.normalizeReport(r.json), [system, ...c.parts.map(p => p.text || '')].join('\n'));
  return { text: JSON.stringify({ ...g.report, _quitados: g.removed }, null, 2), ms: Date.now() - t0 };
}

function check(c, text) {
  if (c.kind === 'chat') return { ok: text.trim().length > 20, note: `${text.trim().split(/\s+/).length} palabras` };
  // Igual que la app (parseJsonLoose); se anota si además era JSON estricto.
  const json = parseJsonLoose(text);
  if (json == null) return { ok: false, note: 'JSON inválido' };
  let strict = true;
  try { JSON.parse(text); } catch { strict = false; }
  if (c.kind === 'report') {
    const r = P.normalizeReport(json);
    return { ok: !!(r.summary && r.priorities.length), note: `${strict ? '' : '(no estricto) '}prioridades ${r.priorities.length}, plan ${r.action_plan.length}, cifras ${r.key_figures.length}` };
  }
  const inv = P.normalizeInvoices(json, (json.invoices || []).map((x, i) => ({ name: x?.file_name || `doc-${i + 1}` })));
  return { ok: inv.length > 0, note: (strict ? '' : '(no estricto) ') + inv.map(i => `${i.issuer_name || '?'} ${i.invoice_date || '?'} base ${i.base} iva ${i.vat_amount} total ${i.total}`).join(' | ') };
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true, mode: 0o700 });
  const results = [];
  for (const c of cases()) {
    process.stdout.write(`[${LABEL}] ${c.id} … `);
    try {
      const r = opt('ref') ? await callRef(c, opt('ref')) : args.includes('--app') ? await callApp(c) : await callLocal(c);
      const v = check(c, r.text);
      const tps = r.timings ? ` · lee ${r.timings.prompt_per_second?.toFixed(0)} t/s (${r.timings.prompt_n} t) · escribe ${r.timings.predicted_per_second?.toFixed(1)} t/s (${r.timings.predicted_n} t)` : '';
      console.log(`${v.ok ? 'OK' : 'MAL'} ${(r.ms / 1000).toFixed(0)} s${tps}${r.finish && r.finish !== 'stop' ? ` · fin=${r.finish}` : ''} · ${v.note}`);
      fs.writeFileSync(path.join(OUT, `${LABEL}-${c.id}.txt`), r.text, { mode: 0o600 });
      results.push({ id: c.id, ok: v.ok, s: Math.round(r.ms / 1000), note: v.note, timings: r.timings || null });
    } catch (e) {
      console.log(`ERROR ${e.message}`);
      results.push({ id: c.id, ok: false, error: e.message });
    }
  }
  fs.writeFileSync(path.join(OUT, `${LABEL}-resumen.json`), JSON.stringify(results, null, 2), { mode: 0o600 });
  process.exit(0);
})();
