/**
 * S15b · lote 5 (IA y diagnóstico): comprobación en el navegador con un backend
 * local (BD temporal) y la IA SIMULADA (Gemini falso dentro del proceso y un
 * llama-server falso para la IA local de respaldo; ninguna llamada real).
 *   D1  sector sin stock: «No aplica» marcado al entrar por URL aunque el perfil llegue tarde
 *   D4  Reclamar: cambiar de tono cancela la generación anterior, la vieja no pisa la nueva
 *       y volver a un tono ya redactado no gasta otra generación
 *   D7  el chat convierte «/enlace: cobros» en el botón «Ir a Cobros»
 *   D8  Historial: renombrar y borrar (con modal propio, sin confirm())
 *   IA de respaldo: aviso en el chat y en el email cuando responde la IA local
 * Uso: VITE_API_URL=/api npx vite build && node test/s15b-ia.e2e.cjs
 *      (el dist tiene que llamar a /api del mismo origen; DEBUG=1 enseña la consola)
 */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');

const PORT = Number(process.env.S15B_IA_PORT || 4155), WEB = PORT + 1, LLAMA = PORT + 2;
const DB = path.join(os.tmpdir(), `nokfi-s15b-ia-${Date.now()}.db`);
Object.assign(process.env, {
  NODE_ENV: 'test', PORT: String(PORT), DB_PATH: DB, BASE_URL: `http://localhost:${PORT}`, ADMIN_SECRET: 'e'.repeat(64),
  ALLOWED_ORIGINS: `http://localhost:${WEB}`, PLAN_PRICE_MINI_EUR: '5', PLAN_PRICE_PRO_EUR: '20', PLAN_PRICE_MAX_EUR: '50',
  AI_PROVIDERS: 'gemini', CHAT_PROVIDERS: 'gemini', GEMINI_API_KEY: 'fake-key-s15b-ia', LOCAL_AI_URL: `http://127.0.0.1:${LLAMA}`,
  GROQ_API_KEY: '', CF_ACCOUNT_ID: '', CF_AI_TOKEN: '', OPENROUTER_API_KEY: ''
});
const DIST = path.join(__dirname, '../dist');
const PW = '/home/mario/Escritorio/Proyectos/n8n-nodes-nokfi/node_modules/playwright-core';
const CHROME = fs.readdirSync(path.join(os.homedir(), '.cache/ms-playwright')).filter(d => /^chromium-\d+$/.test(d)).sort()
  .map(d => path.join(os.homedir(), '.cache/ms-playwright', d, 'chrome-linux64/chrome')).find(p => fs.existsSync(p));

function api(method, p, body, token) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req = http.request({ host: 'localhost', port: PORT, path: p, method, headers: { 'Content-Type': 'application/json',
      ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) } },
    (res) => { let b = ''; res.on('data', d => { b += d; }); res.on('end', () => { try { resolve({ status: res.statusCode, data: JSON.parse(b) }); } catch { resolve({ status: res.statusCode, data: b }); } }); });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}
const wait = (ms) => new Promise(r => setTimeout(r, ms));

function webServer() {
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.json': 'application/json', '.woff2': 'font/woff2' };
  return http.createServer((req, res) => {
    if (req.url.startsWith('/api/')) {
      const p = http.request({ host: 'localhost', port: PORT, path: req.url, method: req.method, headers: req.headers }, (r) => { res.writeHead(r.statusCode, r.headers); r.pipe(res); });
      req.pipe(p);
      return;
    }
    if (req.url.startsWith('/sw.js')) { res.writeHead(404); res.end(); return; }
    let file = path.join(DIST, decodeURIComponent(req.url.split('?')[0]));
    if (!file.startsWith(DIST) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(DIST, 'index.html');
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  }).listen(WEB);
}

/* IA simulada ─ Gemini (fetch dentro del proceso): el tono amable tarda 3 s y el firme 0,3 s,
   así la respuesta vieja (amable) llegaría DESPUÉS de la nueva (firme). */
const aiCalls = [];
const realFetch = global.fetch;
global.fetch = async (url, opts) => {
  if (!String(url).includes('generativelanguage')) return realFetch(url, opts);
  const body = String(opts?.body || '');
  const tone = body.includes('amable y cercano') ? 'Amable' : body.includes('firme pero') ? 'Firme' : body.includes('aviso formal') ? 'Formal' : 'Chat';
  aiCalls.push(tone);
  await wait(tone === 'Amable' ? 3000 : 300);
  const text = tone === 'Chat' ? 'Hola.' : `ASUNTO: Asunto ${tone}\n\nCuerpo ${tone}.`;
  return { ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text }] } }] }), text: async () => '' };
};
/* IA local de respaldo falsa (API tipo OpenAI). */
function fakeLlama() {
  return http.createServer((req, res) => {
    let b = ''; req.on('data', d => { b += d; });
    req.on('end', () => {
      let content = 'ASUNTO: Asunto respaldo\n\nCuerpo respaldo.';
      try { if (JSON.parse(b).messages.some(m => /quién me debe/i.test(String(m.content)))) content = 'Transportes López te debe 2.904,00 €.\n/enlace: cobros'; } catch { /* nada */ }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ choices: [{ message: { content } }], usage: { prompt_tokens: 10, completion_tokens: 10 } }));
    });
  }).listen(LLAMA, '127.0.0.1');
}

let fail = 0;
const check = (label, ok) => { if (ok) console.log('✅', label); else { fail++; console.log('❌', label); } };

async function main() {
  if (!fs.existsSync(path.join(DIST, 'index.html'))) throw new Error('Falta frontend/dist: ejecuta npm run build');
  require('../../backend/server');
  for (let i = 0; i < 50; i++) { try { if ((await api('GET', '/api/health')).status === 200) break; } catch { /* aún no */ } await wait(200); }
  const admin = 'e'.repeat(64);
  const lic = await api('POST', '/api/admin/licenses', { email: 's15b-ia@nokfi.local', plan: 'pro', password: 'Ia-S15b-2026!x' }, admin);
  const token = (await api('POST', '/api/auth/login', { email: 's15b-ia@nokfi.local', license_key: lic.data.key, password: 'Ia-S15b-2026!x' })).data.token;
  await api('PUT', '/api/profile', { companyName: 'Taller QA', sector: 'Consultoría', onboardingCompleted: true, welcomeCardDismissed: true }, token);
  const due = new Date(Date.now() - 10 * 86400000).toISOString().slice(0, 10);
  const led = await api('POST', '/api/ledger', { entries: [{ type: 'income', party_name: 'Transportes López', invoice_number: 'TL-1', invoice_date: due, due_date: due, base: 2400, vat_rate: 21, vat_amount: 504, total: 2904 }] }, token);
  if (led.status !== 201) throw new Error('Libro: ' + JSON.stringify(led.data));
  const { createAnalysis } = require('../../backend/db/database');
  const aid = createAnalysis({ license_id: lic.data.id, kind: 'cuestionario', title: 'Diagnóstico de negocio', result_json: { summary: 'Resumen QA', key_figures: [], priorities: [], action_plan: [], strengths: [], glossary: [] } });

  const server = webServer();
  const llama = fakeLlama();
  const { chromium } = require(PW);
  const browser = await chromium.launch({ executablePath: CHROME });
  const dialogs = [];
  const page = async () => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'es-ES', timezoneId: 'Europe/Madrid' });
    await ctx.addInitScript((tk) => { sessionStorage.setItem('nokfi_session_token', tk); localStorage.setItem('nokfi_lang', 'es'); }, token);
    const pg = await ctx.newPage();
    pg.on('dialog', d => { dialogs.push(d.type()); d.dismiss().catch(() => {}); });
    if (process.env.DEBUG) { pg.on('console', m => console.log('CONSOLE', m.type(), m.text().slice(0, 200))); pg.on('pageerror', e => console.log('PAGEERR', e.message)); }
    return pg;
  };
  const base = `http://localhost:${WEB}`;
  try {
    // ── D1: perfil que llega tarde (1,5 s) al entrar directo por URL ──
    const p = await page();
    await p.route('**/api/profile', async (route) => { await wait(1500); await route.continue(); });
    await p.goto(`${base}/app/cuestionario`);
    await p.getByText(/\b\d+\/30\b/).first().waitFor({ timeout: 15000 });
    await wait(2500); // el perfil llega a los 1,5 s
    const progress = await p.locator('main').innerText();
    check('D1: entrando por URL con el perfil tarde, el progreso cuenta las 6 de stock como respondidas (6/30)', /\b6\/30\b/.test(progress));
    await p.unroute('**/api/profile');
    await p.reload();
    await p.getByText(/\b\d+\/30\b/).first().waitFor({ timeout: 15000 });
    await wait(1000);
    check('D1: al recargar también (6/30)', /\b6\/30\b/.test(await p.locator('main').innerText()));

    // ── D4: cambiar de tono durante la redacción ──
    await p.goto(`${base}/app/finanzas/cobros`);
    const redactar = () => p.getByRole('dialog').getByRole('button', { name: 'Redactar el email' }).click(); // S15b T4: solo al pedirlo
    await p.getByRole('button', { name: 'Reclamar' }).first().click();
    await redactar();
    await wait(400); // empieza «Amable» (3 s)
    await p.getByRole('dialog').getByRole('radio', { name: 'Firme', exact: true }).click();
    await redactar();
    await wait(4500); // la respuesta vieja ya habría llegado
    const subject = await p.getByRole('dialog').getByLabel('Asunto').inputValue().catch(() => '');
    check('D4: la respuesta vieja (Amable) no pisa la del tono elegido (Firme)', subject === 'Asunto Firme');
    const before = aiCalls.length;
    await p.getByRole('dialog').getByRole('radio', { name: 'Formal', exact: true }).click();
    await redactar();
    await wait(1200);
    await p.getByRole('dialog').getByRole('radio', { name: 'Firme', exact: true }).click();
    await wait(800);
    const subject2 = await p.getByRole('dialog').getByLabel('Asunto').inputValue().catch(() => '');
    check('D4: volver a un tono ya redactado lo reutiliza sin otra generación', subject2 === 'Asunto Firme' && aiCalls.length === before + 1);
    await p.keyboard.press('Escape');

    // ── IA de respaldo en el email ──
    process.env.CHAT_PROVIDERS = 'local';
    await p.getByRole('button', { name: 'Reclamar' }).first().click();
    await redactar();
    await p.getByRole('dialog').getByText('Redactado con la IA de respaldo').waitFor({ timeout: 8000 }).catch(() => {});
    check('Respaldo: el email avisa de que lo ha redactado la IA de respaldo', await p.getByRole('dialog').getByText('Redactado con la IA de respaldo').isVisible().catch(() => false));
    await p.keyboard.press('Escape');

    // ── D7 + respaldo en el chat ──
    await p.goto(`${base}/app/home`);
    await p.getByRole('button', { name: 'Abrir el asistente' }).first().click();
    const box = p.getByRole('textbox', { name: /tu pregunta/i }).last();
    await box.fill('¿Quién me debe dinero?');
    await box.press('Enter');
    const chat = p.getByRole('dialog', { name: 'Asistente Nokfi' });
    await chat.getByText('Transportes López te debe').waitFor({ timeout: 8000 }).catch(() => {});
    const chatText = await chat.innerText().catch(() => '');
    check('D7: «/enlace: cobros» sale como botón «Ir a Cobros» y no como texto', await chat.getByRole('link', { name: /Ir a Cobros/ }).isVisible().catch(() => false) && !chatText.includes('enlace:'));
    check('Respaldo: el chat avisa de que ha respondido la IA de respaldo', chatText.includes('IA de respaldo'));
    process.env.CHAT_PROVIDERS = 'gemini';

    // ── D8: renombrar y borrar ──
    await p.goto(`${base}/app/historial/${aid}`);
    await p.getByRole('button', { name: 'Renombrar' }).click();
    await p.getByLabel('Nombre del informe').fill('Diagnóstico noviembre QA');
    await p.getByRole('dialog').getByRole('button', { name: 'Guardar' }).click();
    await p.getByRole('heading', { name: 'Diagnóstico noviembre QA' }).waitFor({ timeout: 5000 }).catch(() => {});
    const got = await api('GET', `/api/analyses/${aid}`, null, token);
    check('D8: renombrar desde el detalle cambia el título (pantalla y API)', got.data.title === 'Diagnóstico noviembre QA'
      && await p.getByRole('heading', { name: 'Diagnóstico noviembre QA' }).isVisible().catch(() => false));
    await p.getByRole('button', { name: 'Borrar', exact: true }).click();
    const modal = p.getByRole('dialog', { name: '¿Borrar este informe?' });
    check('D8: borrar pide confirmación en un modal propio (no confirm())', await modal.isVisible() && dialogs.length === 0
      && (await api('GET', `/api/analyses/${aid}`, null, token)).status === 200);
    await modal.getByRole('button', { name: 'Borrar para siempre' }).click();
    await p.waitForURL(/\/app\/historial$/, { timeout: 5000 }).catch(() => {});
    check('D8: tras confirmar se borra y vuelve al historial', (await api('GET', `/api/analyses/${aid}`, null, token)).status === 404 && /\/app\/historial$/.test(p.url()));
  } finally {
    await browser.close();
    server.close();
    llama.close();
    try { fs.unlinkSync(DB); } catch { /* nada */ }
  }
}

main().then(() => { console.log(fail ? `\n❌ ${fail} fallos` : '\n✅ todo bien'); process.exit(fail ? 1 : 0); })
  .catch((e) => { console.error(e); process.exit(1); });
