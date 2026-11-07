/**
 * S15b · lote 3 (seguridad de la app): comprobación en el navegador.
 *   A7  htmlToParagraphs (exportar informes) no carga imágenes ni ejecuta onerror
 *   A8  dos envíos seguidos del formulario de enlaces de gestoría crean UN enlace
 * Usa un backend local (BD temporal, sin IA ni Stripe) y el `dist` ya compilado.
 * Uso: VITE_API_URL=/api npx vite build && node test/s15b-seguridad.e2e.cjs
 *      (el dist tiene que llamar a /api del mismo origen; DEBUG=1 enseña la consola)
 */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');

const PORT = Number(process.env.S15B_PORT || 4145), WEB = Number(process.env.S15B_WEB_PORT || 4146);
const DB = path.join(os.tmpdir(), `nokfi-s15b-seguridad-${Date.now()}.db`);
Object.assign(process.env, {
  NODE_ENV: 'test', PORT: String(PORT), DB_PATH: DB, BASE_URL: `http://localhost:${PORT}`, ADMIN_SECRET: 'e'.repeat(64),
  ALLOWED_ORIGINS: `http://localhost:${WEB}`, PLAN_PRICE_MINI_EUR: '5', PLAN_PRICE_PRO_EUR: '20', PLAN_PRICE_MAX_EUR: '50'
});
const ROOT = path.join(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
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
    if (req.url.startsWith('/__a7')) { res.writeHead(200, { 'Content-Type': 'text/html' }); res.end('<!doctype html><title>a7</title>'); return; }
    let file = path.join(DIST, decodeURIComponent(req.url.split('?')[0]));
    if (!file.startsWith(DIST) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(DIST, 'index.html');
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  }).listen(WEB);
}

let fail = 0;
const check = (label, ok) => { if (ok) console.log('✅', label); else { fail++; console.log('❌', label); } };

async function main() {
  if (!fs.existsSync(path.join(DIST, 'index.html'))) throw new Error('Falta frontend/dist: ejecuta npm run build');
  // htmlToParagraphs empaquetado para el navegador (A7).
  const { build } = require('esbuild');
  const bundle = await build({
    stdin: { contents: "export { htmlToParagraphs } from './src/middleware/exports/model.js';", resolveDir: ROOT, loader: 'js' },
    bundle: true, format: 'iife', globalName: 'A7', platform: 'browser', write: false, logLevel: 'error',
    external: ['docx', 'pptxgenjs', 'jszip', 'xlsx', 'jspdf', 'jspdf-autotable']
  });

  require('../../backend/server');
  for (let i = 0; i < 50; i++) { try { if ((await api('GET', '/api/health')).status === 200) break; } catch { /* aún no */ } await wait(200); }
  const admin = 'e'.repeat(64);
  const lic = await api('POST', '/api/admin/licenses', { email: 's15b-seg@nokfi.local', plan: 'pro', password: 'Seguridad-S15b-2026!' }, admin);
  const token = (await api('POST', '/api/auth/login', { email: 's15b-seg@nokfi.local', license_key: lic.data.key, password: 'Seguridad-S15b-2026!' })).data.token;
  await api('PUT', '/api/profile', { companyName: 'QA SL', legalForm: 'autonomo', onboardingCompleted: true, welcomeCardDismissed: true }, token);

  const server = webServer();
  const { chromium } = require(PW);
  const browser = await chromium.launch({ executablePath: CHROME });
  const base = `http://localhost:${WEB}`;
  try {
    // A7: en una página sin CSP, el HTML con <img onerror> no debe ejecutarse ni pedir la imagen.
    const ctx7 = await browser.newContext();
    const p7 = await ctx7.newPage();
    const imgRequests = [];
    p7.on('request', r => { if (r.url().includes('a7-probe')) imgRequests.push(r.url()); });
    await p7.goto(`${base}/__a7`);
    await p7.addScriptTag({ content: bundle.outputFiles[0].text });
    const paras = await p7.evaluate(() => window.A7.htmlToParagraphs('<p>Uno</p><p>Dos<img src="/a7-probe.png" onerror="window.__a7hit=1"></p>'));
    await wait(500);
    const hit = await p7.evaluate(() => window.__a7hit === 1);
    check('A7: htmlToParagraphs saca el texto («Uno», «Dos»)', JSON.stringify(paras) === JSON.stringify(['Uno', 'Dos']));
    check('A7: no ejecuta onerror ni pide la imagen', !hit && imgRequests.length === 0);
    await ctx7.close();

    // A8: dos envíos seguidos del formulario → un solo enlace.
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'es-ES', timezoneId: 'Europe/Madrid' });
    await ctx.addInitScript((tk) => { sessionStorage.setItem('nokfi_session_token', tk); localStorage.setItem('nokfi_lang', 'es'); }, token);
    const p = await ctx.newPage();
    if (process.env.DEBUG) { p.on('console', m => console.log('CONSOLE', m.type(), m.text().slice(0, 200))); p.on('pageerror', e => console.log('PAGEERR', e.message)); }
    let posts = 0;
    p.on('request', r => { if (r.method() === 'POST' && /\/api\/share$/.test(r.url())) posts++; });
    await p.goto(`${base}/app/configuracion?s=compartir`);
    const input = p.getByPlaceholder(/.+/).and(p.locator('input[maxlength="60"]'));
    await input.waitFor({ timeout: 10000 });
    await input.fill('Gestoría doble');
    await input.evaluate((el) => { const f = el.form; f.requestSubmit(); f.requestSubmit(); });
    await wait(1500);
    const links = (await api('GET', '/api/share', null, token)).data.links || [];
    check('A8: dos envíos seguidos → una sola petición y un solo enlace', posts === 1 && links.length === 1);
  } finally {
    await browser.close();
    server.close();
    try { fs.unlinkSync(DB); } catch { /* nada */ }
  }
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error('FALLO:', e.message); try { fs.unlinkSync(DB); } catch { /* nada */ } process.exit(1); });
