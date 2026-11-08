/**
 * S15b · T4 · lote 12 (IA y diagnóstico): comprobación en el navegador con un backend
 * local (BD temporal) y la IA SIMULADA (Gemini falso dentro del proceso; ninguna llamada real).
 *   4   abrir Reclamar no gasta IA: se redacta solo al pulsar «Redactar el email», con el tono elegido
 *   5   el primer aviso sale con el tono amable aunque la factura lleve 40 días vencida;
 *       tras un recordatorio automático, el tono por defecto es el firme
 *   D4  cambiar de tono o cerrar mientras se redacta cancela la generación EN EL SERVIDOR
 *       (también la ya aplazada, con DELETE /api/pending/:id)
 *   3   el progreso del cuestionario explica que los «No aplica» del sector ya cuentan (6/30)
 *   8   el historial enseña con «€» la cifra clave de análisis antiguos («2.301,58», «9043.96»)
 *   9   «Comparar con IA» (Excel › Caja) y «Analizar carpeta» (uno y varios lotes) de punta a punta
 * Uso: VITE_API_URL=/api npm run build && node test/s15b-t4-ia.e2e.cjs
 *      (puertos 4211-4213; DEBUG=1 enseña la consola)
 */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');

const PORT = Number(process.env.S15B_T4_IA_PORT || 4211), WEB = PORT + 1;
const DB = path.join(os.tmpdir(), `nokfi-s15b-t4-ia-${Date.now()}.db`);
Object.assign(process.env, {
  NODE_ENV: 'test', PORT: String(PORT), DB_PATH: DB, BASE_URL: `http://localhost:${PORT}`, ADMIN_SECRET: 'f'.repeat(64),
  ALLOWED_ORIGINS: `http://localhost:${WEB}`, PLAN_PRICE_MINI_EUR: '5', PLAN_PRICE_PRO_EUR: '20', PLAN_PRICE_MAX_EUR: '50',
  AI_PROVIDERS: 'gemini', CHAT_PROVIDERS: 'gemini', GEMINI_API_KEY: 'fake-key-s15b-t4-ia', LOCAL_AI_URL: '',
  GROQ_API_KEY: '', CF_ACCOUNT_ID: '', CF_AI_TOKEN: '', OPENROUTER_API_KEY: '',
  DEFER_AFTER_MS: '1000' // lo que tarde más de 1 s se aplaza (202 { pending }), como la IA local
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
      // Como Nginx: si el navegador corta, se corta también la conexión con el backend.
      p.on('error', () => { if (!res.headersSent) res.writeHead(502); res.end(); });
      res.on('close', () => { if (!res.writableFinished) p.destroy(); });
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

/* IA simulada ─ Gemini (fetch dentro del proceso). Cada tono tarda `delay[tono]` y respeta la
   señal de cancelación del servidor (cuenta las cancelaciones en `aborted`). */
const aiCalls = [];
const aborted = [];
const delay = { Amable: 300, Firme: 300, Formal: 300, Chat: 100 };
const realFetch = global.fetch;
global.fetch = (url, opts) => {
  if (!String(url).includes('generativelanguage')) return realFetch(url, opts);
  const body = String(opts?.body || '');
  // Análisis (9): comparación, carpeta (un lote o notas por lote + informe).
  const task = body.includes('TAREA: compara dos periodos') ? 'compare' : body.includes('estás leyendo un LOTE') ? 'folder_map'
    : body.includes('TAREA: responde a la petición del usuario sobre los documentos de su carpeta') ? 'folder' : null;
  const tone = task || (body.includes('amable y cercano') ? 'Amable' : body.includes('firme pero') ? 'Firme' : body.includes('aviso formal') ? 'Formal' : 'Chat');
  aiCalls.push({ tone, first: body.includes('Es el primer aviso'), body });
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => {
      const report = (title) => JSON.stringify({ summary: `Resumen ${title}`, key_figures: [{ label: 'Entradas', value: '2.100,00 €' }],
        priorities: [{ title: `Prioridad ${title}`, detail: 'Detalle', severity: 'medium' }], action_plan: [{ title: `Paso ${title}`, due_in_days: 3, timeframe: '3 días' }], strengths: [], glossary: [] });
      const text = task === 'folder_map' ? 'Notas del lote: facturas de luz y agua.' : task ? report(task)
        : tone === 'Chat' ? 'Hola.' : `ASUNTO: Asunto ${tone}\n\nCuerpo ${tone}.`;
      resolve({ ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text }] } }] }), text: async () => '' });
    }, delay[tone] ?? 200);
    opts?.signal?.addEventListener('abort', () => { clearTimeout(t); aborted.push(tone); reject(new Error('aborted')); }, { once: true });
  });
};

let fail = 0;
const check = (label, ok) => { if (ok) console.log('✅', label); else { fail++; console.log('❌', label); } };

async function main() {
  if (!fs.existsSync(path.join(DIST, 'index.html'))) throw new Error('Falta frontend/dist: ejecuta npm run build');
  require('../../backend/server');
  for (let i = 0; i < 50; i++) { try { if ((await api('GET', '/api/health')).status === 200) break; } catch { /* aún no */ } await wait(200); }
  const admin = 'f'.repeat(64);
  const lic = await api('POST', '/api/admin/licenses', { email: 's15b-t4-ia@nokfi.local', plan: 'pro', password: 'Ia-T4-2026!x' }, admin);
  const token = (await api('POST', '/api/auth/login', { email: 's15b-t4-ia@nokfi.local', license_key: lic.data.key, password: 'Ia-T4-2026!x' })).data.token;
  await api('PUT', '/api/profile', { companyName: 'Taller QA', sector: 'Consultoría', onboardingCompleted: true, welcomeCardDismissed: true }, token);
  const due = new Date(Date.now() - 40 * 86400000).toISOString().slice(0, 10);
  const led = await api('POST', '/api/ledger', { entries: [{ type: 'income', party_name: 'Transportes López', invoice_number: 'TL-1', invoice_date: due, due_date: due, base: 2400, vat_rate: 21, vat_amount: 504, total: 2904 }] }, token);
  if (led.status !== 201) throw new Error('Libro: ' + JSON.stringify(led.data));
  const entryId = led.data.ids[0];

  const server = webServer();
  const { chromium } = require(PW);
  const browser = await chromium.launch({ executablePath: CHROME });
  const page = async (lang = 'es') => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'es-ES', timezoneId: 'Europe/Madrid' });
    await ctx.addInitScript(([tk, lg]) => { sessionStorage.setItem('nokfi_session_token', tk); localStorage.setItem('nokfi_lang', lg); }, [token, lang]);
    const pg = await ctx.newPage();
    if (process.env.DEBUG) { pg.on('console', m => console.log('CONSOLE', m.type(), m.text().slice(0, 200))); pg.on('pageerror', e => console.log('PAGEERR', e.message)); }
    return pg;
  };
  const base = `http://localhost:${WEB}`;
  try {
    const p = await page();
    const deletes = [];
    p.on('request', r => { if (r.method() === 'DELETE' && r.url().includes('/api/pending/')) deletes.push(r.url()); });
    await p.goto(`${base}/app/finanzas/cobros`);
    await p.getByRole('button', { name: 'Reclamar' }).first().click();
    const dlg = p.getByRole('dialog');
    const btn = dlg.getByRole('button', { name: 'Redactar el email' });
    await btn.waitFor({ timeout: 8000 }).catch(() => {});
    await wait(1200);
    // ── 4: abrir no gasta IA ──
    check('4: abrir Reclamar no lanza ninguna generación y enseña el botón «Redactar el email»', aiCalls.length === 0 && await btn.isVisible().catch(() => false));
    // ── 5: primer aviso amable aunque lleve 40 días vencida ──
    check('5: primer aviso de una factura con 40 días de retraso → tono «Amable» por defecto',
      await dlg.getByRole('radio', { name: 'Amable', exact: true }).isChecked().catch(() => false));
    await btn.click();
    await dlg.getByLabel('Asunto').waitFor({ timeout: 8000 }).catch(() => {});
    check('4/5: al pulsar se redacta UNA vez con el tono elegido y la IA sabe que es el primer aviso',
      await dlg.getByLabel('Asunto').inputValue().catch(() => '') === 'Asunto Amable' && aiCalls.length === 1 && aiCalls[0].first);

    // ── D4: cambiar de tono con la generación ya aplazada (202) → DELETE /api/pending/:id ──
    delay.Firme = 4000;
    await dlg.getByRole('radio', { name: 'Firme', exact: true }).click();
    check('4: cambiar a un tono sin borrador no redacta solo (vuelve el botón)', aiCalls.length === 1 && await btn.isVisible().catch(() => false));
    await btn.click();
    await wait(1800); // > DEFER_AFTER_MS: ya es una respuesta aplazada
    await dlg.getByRole('radio', { name: 'Formal', exact: true }).click();
    await wait(800);
    check('D4: cambiar de tono con la redacción aplazada la cancela en el servidor (DELETE /api/pending/:id y la IA se corta)',
      deletes.length === 1 && aborted.includes('Firme'));
    // ── D4: cerrar mientras redacta (petición aún abierta) → se corta la conexión y se cancela ──
    delay.Formal = 3000;
    await btn.click();
    await wait(400);
    await p.keyboard.press('Escape');
    await wait(800);
    check('D4: cerrar Reclamar mientras redacta cancela la generación en el servidor', aborted.includes('Formal'));

    // ── 5: tras un recordatorio automático, el tono por defecto es el firme ──
    require('../../backend/db/database').getDB()
      .prepare('INSERT INTO reminders_sent (license_id, deadline_key, lead_days) VALUES (?, ?, 1)').run(lic.data.id, `collect-${entryId}`);
    await p.reload();
    await p.getByRole('button', { name: 'Reclamar' }).first().click();
    await btn.waitFor({ timeout: 8000 }).catch(() => {});
    check('5: con un recordatorio automático ya enviado, el tono por defecto es «Firme»',
      await dlg.getByRole('radio', { name: 'Firme', exact: true }).isChecked().catch(() => false));
    await p.keyboard.press('Escape');

    // ── 3: el progreso del cuestionario explica que los «No aplica» del sector ya cuentan ──
    await p.goto(`${base}/app/cuestionario`);
    await p.getByText(/\b\d+\/30\b/).first().waitFor({ timeout: 15000 });
    await wait(800);
    const main = p.locator('main');
    const mainText = await main.innerText();
    check('3: empieza en 6/30 y dice que incluye 6 preguntas de «Pedidos y stock» marcadas como «No aplica» por el sector',
      /\b6\/30\b/.test(mainText) && mainText.includes('El contador ya incluye 6 preguntas de «Pedidos y stock» marcadas como «No aplica» por tu sector'));
    const pl = await page('pl');
    await pl.goto(`${base}/app/cuestionario`);
    await pl.getByText(/\b\d+\/30\b/).first().waitFor({ timeout: 15000 });
    await wait(800);
    check('3: en polaco, con la forma plural de 5 o más («6 pytań … oznaczonych»)', (await pl.locator('main').innerText()).includes('Licznik obejmuje już 6 pytań'));
    await pl.context().close();

    // ── 8: análisis antiguo con la cifra clave sin «€» en el historial ──
    const { createAnalysis } = require('../../backend/db/database');
    createAnalysis({ license_id: lic.data.id, kind: 'excel', title: 'Caja antigua', result_json: { summary: 's', key_figures: [{ label: 'Saldo inicial', value: '2.301,58' }], priorities: [], action_plan: [] } });
    createAnalysis({ license_id: lic.data.id, kind: 'excel', title: 'Caja más antigua', result_json: { summary: 's', key_figures: [{ label: 'Saldo final', value: '9043.96' }], priorities: [], action_plan: [] } });
    await p.goto(`${base}/app/historial`);
    await p.getByText('Caja antigua').first().waitFor({ timeout: 10000 }).catch(() => {});
    const hist = (await main.innerText()).replace(/[\u00a0\u202f]/g, ' ');
    check('8: el historial muestra las cifras de análisis antiguos con el mismo formato («2.301,58 €», «9.043,96 €»)',
      hist.includes('Saldo inicial: 2.301,58 €') && hist.includes('Saldo final: 9.043,96 €'));

    // ── 9: comparación de periodos (Excel › Caja) con la IA simulada ──
    const csv = (rows) => ({ name: 'x.csv', mimeType: 'text/csv', buffer: Buffer.from(rows) });
    await p.goto(`${base}/app/excel/excel-caja`);
    await p.getByRole('radio', { name: 'Modo comparación' }).click();
    const inputs = p.locator('input[type=file]');
    await inputs.nth(0).setInputFiles({ ...csv('Fecha,Concepto,Entradas,Salidas\n2026-08-01,Cobro A,1200,0\n2026-08-05,Luz,0,150\n'), name: 'caja-agosto.csv' });
    await inputs.nth(1).setInputFiles({ ...csv('Fecha,Concepto,Entradas,Salidas\n2026-09-01,Cobro B,900,0\n2026-09-05,Luz,0,180\n'), name: 'caja-septiembre.csv' });
    await wait(800);
    const before9 = aiCalls.length;
    await p.getByRole('button', { name: 'Comparar con IA' }).click();
    await p.getByText('Resumen compare').waitFor({ timeout: 15000 }).catch(() => {});
    const cmpCall = aiCalls.slice(before9).find(c => c.tone === 'compare');
    const list9 = await api('GET', '/api/analyses', null, token);
    const cmp = (list9.data.analyses || []).find(a => /vs/.test(a.title));
    check('9: «Comparar con IA» manda los dos periodos (con sus archivos) y enseña el informe',
      !!cmpCall && cmpCall.body.includes('caja-agosto.csv') && cmpCall.body.includes('caja-septiembre.csv')
        && await p.getByText('Resumen compare').isVisible().catch(() => false));
    check('9: la comparación queda en el historial con los dos periodos en el título y gasta 1 crédito',
      !!cmp && cmp.title.includes('Periodo A vs Periodo B') && Array.isArray(cmp.summary?.periods) && cmp.summary.periods.length === 2
        && aiCalls.slice(before9).length === 1);

    // ── 9: analizar una carpeta (un lote y varios lotes con notas) ──
    const txt = (name, n) => ({ name, mimeType: 'text/plain', buffer: Buffer.from(`Factura ${name}: importe 100 €. `.repeat(n)) });
    const runFolder = async (files, question) => {
      await p.goto(`${base}/app/excel/carpeta`);
      await p.locator('input[type=file]').nth(1).setInputFiles(files);
      await p.locator('main textarea').first().fill(question);
      await wait(600);
      const n0 = aiCalls.length;
      await p.getByRole('button', { name: 'Analizar carpeta' }).click();
      await p.getByText('Resumen folder').waitFor({ timeout: 20000 }).catch(() => {});
      return { calls: aiCalls.slice(n0).map(c => c.tone), shown: await p.getByText('Resumen folder').isVisible().catch(() => false) };
    };
    const credits0 = (await api('GET', '/api/dashboard', null, token)).data.ai_used_today;
    const one = await runFolder([txt('luz.txt', 3), txt('agua.txt', 3)], '¿Cuánto gasto en suministros?');
    check('9: carpeta pequeña → una sola llamada «folder» y el informe sale', one.calls.join() === 'folder' && one.shown);
    // 4 archivos de ~12.000 caracteres → 2 lotes (35.000 por lote) → 2 notas + informe final.
    const big = await runFolder(['a', 'b', 'c', 'd'].map(n => txt(`${n}.txt`, 400)), 'Resume los gastos');
    const credits1 = (await api('GET', '/api/dashboard', null, token)).data.ai_used_today;
    check('9: carpeta grande → notas por lote y un informe final, y todo junto gasta 1 crédito por carpeta',
      big.calls.join() === 'folder_map,folder_map,folder' && big.shown && credits1 - credits0 === 2);
  } finally {
    await browser.close();
    server.close();
    try { fs.unlinkSync(DB); } catch { /* nada */ }
  }
}

main().then(() => { console.log(fail ? `\n❌ ${fail} fallos` : '\n✅ todo bien'); process.exit(fail ? 1 : 0); })
  .catch((e) => { console.error(e); process.exit(1); });
