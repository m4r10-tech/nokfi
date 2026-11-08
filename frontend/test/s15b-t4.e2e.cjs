/**
 * S15b · T4 lote 10 (pagos, API y seguridad): comprobación en el navegador.
 *   9   Desarrolladores › Webhooks: elegir el modo (real/prueba) al crear y verlo en la lista;
 *       en Mini no se elige (solo prueba).
 *   A6  Emitir una factura manda Idempotency-Key; si la respuesta se pierde y se reintenta,
 *       sale la misma clave y no se crea otra factura.
 * Usa un backend local (BD temporal, sin IA ni Stripe) y el `dist` ya compilado.
 * Uso: VITE_API_URL=/api npm run build && node test/s15b-t4.e2e.cjs
 *      (puertos 4191 y 4192; DEBUG=1 enseña la consola)
 */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');

const PORT = Number(process.env.S15B_PORT || 4191), WEB = Number(process.env.S15B_WEB_PORT || 4192);
const DB = path.join(os.tmpdir(), `nokfi-s15b-t4-${Date.now()}.db`);
Object.assign(process.env, {
  NODE_ENV: 'test', PORT: String(PORT), DB_PATH: DB, BASE_URL: `http://localhost:${PORT}`, ADMIN_SECRET: 'f'.repeat(64),
  ALLOWED_ORIGINS: `http://localhost:${WEB}`, PLAN_PRICE_MINI_EUR: '5', PLAN_PRICE_PRO_EUR: '20', PLAN_PRICE_MAX_EUR: '50',
  WEBHOOKS_ALLOW_HTTP: '1', WEBHOOKS_ALLOW_PRIVATE: '1'
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
    let file = path.join(DIST, decodeURIComponent(req.url.split('?')[0]));
    if (!file.startsWith(DIST) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(DIST, 'index.html');
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  }).listen(WEB);
}

let fail = 0;
const check = (label, ok) => { if (ok) console.log('✅', label); else { fail++; console.log('❌', label); } };
const admin = 'f'.repeat(64);

async function account(email, plan) {
  const lic = await api('POST', '/api/admin/licenses', { email, plan, password: 'Lote10-S15b-2026!' }, admin);
  const token = (await api('POST', '/api/auth/login', { email, license_key: lic.data.key, password: 'Lote10-S15b-2026!' })).data.token;
  await api('PUT', '/api/profile', { companyName: 'QA SL', legalForm: 'autonomo', onboardingCompleted: true, welcomeCardDismissed: true }, token);
  return token;
}

async function main() {
  if (!fs.existsSync(path.join(DIST, 'index.html'))) throw new Error('Falta frontend/dist: ejecuta npm run build');
  require('../../backend/server');
  for (let i = 0; i < 50; i++) { try { if ((await api('GET', '/api/health')).status === 200) break; } catch { /* aún no */ } await wait(200); }
  const pro = await account('s15b-t4-pro@nokfi.local', 'pro');
  const mini = await account('s15b-t4-mini@nokfi.local', 'mini');
  await api('PUT', '/api/invoicing/settings', { legal_name: 'Taller QA SL', tax_id: 'B12345674', address: 'Calle Real 3', postal_code: '28013', city: 'Madrid' }, pro);

  const server = webServer();
  const { chromium } = require(PW);
  const browser = await chromium.launch({ executablePath: CHROME });
  const base = `http://localhost:${WEB}`;
  const page = async (token, width = 1280) => {
    const ctx = await browser.newContext({ viewport: { width, height: 900 }, locale: 'es-ES', timezoneId: 'Europe/Madrid' });
    await ctx.addInitScript((tk) => { sessionStorage.setItem('nokfi_session_token', tk); localStorage.setItem('nokfi_lang', 'es'); }, token);
    const p = await ctx.newPage();
    const errors = [];
    p.on('pageerror', e => errors.push(e.message));
    if (process.env.DEBUG) { p.on('console', m => console.log('CONSOLE', m.type(), m.text().slice(0, 200))); }
    return { p, ctx, errors };
  };
  try {
    // ── 9: modo de cada webhook (Pro) ──
    {
      const { p, ctx, errors } = await page(pro);
      const bodies = [];
      p.on('request', r => { if (r.method() === 'POST' && /\/api\/dev\/webhooks$/.test(r.url())) bodies.push(JSON.parse(r.postData() || '{}')); });
      await p.goto(`${base}/app/dev/webhooks`);
      const group = p.getByRole('radiogroup', { name: 'Modo' });
      await group.waitFor({ timeout: 10000 });
      const liveChecked = await group.getByRole('radio', { name: 'Real' }).getAttribute('aria-checked');
      check('9: en Pro el alta de webhook deja elegir el modo (Real marcado por defecto)', liveChecked === 'true');
      await group.getByRole('radio', { name: 'Prueba' }).click();
      check('9: al elegir Prueba se explica que solo recibe eventos de prueba', await p.getByText('Recibe solo los eventos de prueba').isVisible());
      await p.fill('#wh-url', 'http://127.0.0.1:9/prueba');
      await p.getByRole('button', { name: 'Crear webhook' }).click();
      await p.getByText('http://127.0.0.1:9/prueba').waitFor({ timeout: 10000 });
      await p.fill('#wh-url', 'http://127.0.0.1:9/real');
      await p.getByRole('button', { name: 'Crear webhook' }).click();
      await p.getByText('http://127.0.0.1:9/real').waitFor({ timeout: 10000 });
      const list = (await api('GET', '/api/dev/webhooks', null, pro)).data.webhooks;
      const byUrl = Object.fromEntries(list.map(w => [w.url, w]));
      check('9: el panel manda mode=test y luego mode=live (tras crear vuelve a Real)', bodies.length === 2 && bodies[0].mode === 'test' && bodies[1].mode === 'live');
      check('9: se crean con su modo (prueba y real)', byUrl['http://127.0.0.1:9/prueba']?.livemode === false && byUrl['http://127.0.0.1:9/real']?.livemode === true);
      const rowOf = (u) => p.locator('li').filter({ hasText: u });
      const testBadge = await rowOf('http://127.0.0.1:9/prueba').getByText('Prueba', { exact: true }).count();
      const liveBadge = await rowOf('http://127.0.0.1:9/real').getByText('Real', { exact: true }).count();
      check('9: la lista enseña el modo de cada webhook (Prueba / Real)', testBadge === 1 && liveBadge === 1);
      // móvil: sin scroll horizontal
      await p.setViewportSize({ width: 390, height: 844 });
      await wait(300);
      const overflow = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      check('9: a 390 px no hay scroll horizontal y no hay errores de JS', overflow <= 0 && errors.length === 0);
      await ctx.close();
    }
    // ── 9: Mini no elige (solo prueba) ──
    {
      const { p, ctx } = await page(mini);
      const bodies = [];
      p.on('request', r => { if (r.method() === 'POST' && /\/api\/dev\/webhooks$/.test(r.url())) bodies.push(JSON.parse(r.postData() || '{}')); });
      await p.goto(`${base}/app/dev/webhooks`);
      await p.locator('#wh-url').waitFor({ timeout: 10000 });
      const groups = await p.getByRole('radiogroup', { name: 'Modo' }).count();
      await p.fill('#wh-url', 'http://127.0.0.1:9/mini');
      await p.getByRole('button', { name: 'Crear webhook' }).click();
      await p.getByText('http://127.0.0.1:9/mini').waitFor({ timeout: 10000 });
      check('9: en Mini no hay selector de modo y el webhook se crea de prueba', groups === 0 && bodies[0]?.mode === 'test'
        && (await p.locator('li').filter({ hasText: 'http://127.0.0.1:9/mini' }).getByText('Prueba', { exact: true }).count()) === 1);
      await ctx.close();
    }
    // ── A6: Idempotency-Key al emitir; respuesta perdida + reintento = una sola factura ──
    {
      const { p, ctx } = await page(pro);
      const keys = [];
      let first = true;
      await p.route('**/api/invoicing/invoices', async (route) => {
        if (route.request().method() !== 'POST') return route.continue();
        keys.push(route.request().headers()['idempotency-key']);
        if (first) { first = false; await route.fetch(); return route.abort('failed'); } // el servidor la emite, la respuesta se pierde
        return route.continue();
      });
      await p.goto(`${base}/app/finanzas/facturas/nueva`);
      await p.getByRole('radio', { name: 'Sin cliente' }).click();
      await p.fill('#ie-d0', 'Reparación');
      await p.fill('#ie-p0', '10');
      const submit = p.locator('form button[type="submit"]');
      const confirm = () => p.getByRole('button', { name: /Emitir por/ }).click();
      await submit.click(); await confirm();
      await wait(1200);
      await submit.click(); await confirm();
      await p.waitForURL(/\/app\/finanzas\/facturas\?open=/, { timeout: 10000 }).catch(() => {});
      const invoices = (await api('GET', '/api/invoicing/invoices', null, pro)).data.invoices || [];
      check('A6: emitir manda Idempotency-Key y el reintento tras perder la respuesta usa la misma', keys.length === 2 && !!keys[0] && keys[0] === keys[1]);
      check('A6: el reintento no crea otra factura (una sola) y abre la emitida', invoices.length === 1 && /open=/.test(p.url()));
      await ctx.close();
    }
  } finally {
    await browser.close();
    server.close();
    try { fs.unlinkSync(DB); } catch { /* nada */ }
  }
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error('FALLO:', e.message); try { fs.unlinkSync(DB); } catch { /* nada */ } process.exit(1); });
