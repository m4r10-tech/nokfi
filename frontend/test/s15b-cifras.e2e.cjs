/**
 * S15b · lote 4 (cifras e impuestos): comprobación en el navegador con un
 * backend local (BD temporal, sin IA ni Stripe) y el `dist` ya compilado.
 *   F1  Impuestos 3T: 1.113 € con la línea «IVA a compensar de trimestres anteriores»
 *   F6  trimestre vencido en pasado y sin «Te faltan»
 *   F5  Cobros › Cobrada pide la fecha; Libro › Añadir a mano muestra la fecha de cobro
 *   F9  Libro en inglés con Q1…Q4
 *   F11 Inicio: «Lo más antiguo: <cliente>, <importe>…»
 * Uso: VITE_API_URL=/api npx vite build && node test/s15b-cifras.e2e.cjs
 *      (el dist tiene que llamar a /api del mismo origen; DEBUG=1 enseña la consola)
 */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');

const PORT = Number(process.env.S15B_PORT || 4135), WEB = Number(process.env.S15B_WEB_PORT || 4136);
const DB = path.join(os.tmpdir(), `nokfi-s15b-cifras-${Date.now()}.db`);
Object.assign(process.env, {
  NODE_ENV: 'test', PORT: String(PORT), DB_PATH: DB, BASE_URL: `http://localhost:${PORT}`, ADMIN_SECRET: 'e'.repeat(64),
  ALLOWED_ORIGINS: `http://localhost:${WEB}`, PLAN_PRICE_MINI_EUR: '5', PLAN_PRICE_PRO_EUR: '20', PLAN_PRICE_MAX_EUR: '50'
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

const vatE = (date, type, vat, i) => ({ type, invoice_date: date, party_name: `Proveedor ${i}`, invoice_number: `S3-${i}`, base: Math.round(vat / 0.21 * 100) / 100,
  vat_rate: 21, vat_amount: vat, irpf_amount: 0, total: Math.round((vat / 0.21 + vat) * 100) / 100, paid: true, paid_at: date });

let fail = 0;
const check = (label, ok) => { if (ok) console.log('✅', label); else { fail++; console.log('❌', label); } };

async function main() {
  if (!fs.existsSync(path.join(DIST, 'index.html'))) throw new Error('Falta frontend/dist: ejecuta npm run build');
  require('../../backend/server');
  for (let i = 0; i < 50; i++) { try { if ((await api('GET', '/api/health')).status === 200) break; } catch { /* aún no */ } await wait(200); }
  const admin = 'e'.repeat(64);
  const lic = await api('POST', '/api/admin/licenses', { email: 's15b@nokfi.local', plan: 'pro', password: 'Cifras-S15b-2026!' }, admin);
  const token = (await api('POST', '/api/auth/login', { email: 's15b@nokfi.local', license_key: lic.data.key, password: 'Cifras-S15b-2026!' })).data.token;
  await api('PUT', '/api/profile', { companyName: 'QA SL', legalForm: 'sociedad', onboardingCompleted: true, welcomeCardDismissed: true }, token);
  const y = 2026;
  const entries = [
    vatE(`${y}-02-10`, 'income', 1880, 1), vatE(`${y}-02-11`, 'expense', 924, 2), vatE(`${y}-05-10`, 'income', 2100, 3), vatE(`${y}-05-11`, 'expense', 3276, 4),
    vatE(`${y}-08-10`, 'income', 3045, 5), vatE(`${y}-08-11`, 'expense', 756, 6),
    { type: 'income', party_name: 'Cliente Beta SL', invoice_number: 'B-1', invoice_date: `${y}-10-01`, due_date: `${y}-10-05`, base: 2500, vat_rate: 21, vat_amount: 525, total: 3025 },
    { type: 'income', party_name: 'Cliente Gamma SL', invoice_number: 'G-1', invoice_date: `${y}-10-10`, due_date: `${y}-10-20`, base: 7000, vat_rate: 21, vat_amount: 1470, total: 8470 }
  ];
  const led = await api('POST', '/api/ledger', { entries }, token);
  if (led.status !== 201) throw new Error('Libro: ' + JSON.stringify(led.data));
  const server = webServer();
  const { chromium } = require(PW);
  const browser = await chromium.launch({ executablePath: CHROME });
  const page = async (lang) => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'es-ES', timezoneId: 'Europe/Madrid' });
    await ctx.addInitScript(([tk, l]) => { sessionStorage.setItem('nokfi_session_token', tk); localStorage.setItem('nokfi_lang', l); }, [token, lang]);
    const pg = await ctx.newPage();
    if (process.env.DEBUG) { pg.on('console', m => console.log('CONSOLE', m.type(), m.text().slice(0, 200))); pg.on('pageerror', e => console.log('PAGEERR', e.message)); pg.on('requestfailed', r => console.log('REQFAIL', r.url())); }
    return pg;
  };
  const base = `http://localhost:${WEB}`;
  try {
    const p = await page('es');
    // F1 + F6
    await p.goto(`${base}/app/finanzas/impuestos`);
    await p.getByRole('radio', { name: '3T' }).or(p.getByRole('button', { name: '3T', exact: true })).first().click();
    await p.getByText('IVA a compensar de trimestres anteriores').waitFor({ timeout: 10000 });
    const taxes = await p.locator('main').innerText();
    check('F1: Impuestos 3T 2026 ≈ 1.113,00 € y descuenta 1.176,00 € del 2T', taxes.includes('1.113,00') && taxes.includes('1.176,00') && !taxes.includes('2.289,00 €\n'));
    check('F6: 3T vencido en pasado («plazo ya vencido») y sin «Te faltan»', taxes.includes('Resultado del 3T 2026 (plazo ya vencido)') && !taxes.includes('Te faltan') && !taxes.includes('te tocará pagar'));

    // F11
    await p.goto(`${base}/app/home`);
    await p.getByText('Lo más antiguo:').first().waitFor({ timeout: 10000 });
    const home = await p.locator('main').innerText();
    check('F11: Inicio separa el total vencido del cliente más antiguo (Beta, 3.025,00 €)', /Lo más antiguo: Cliente Beta SL, 3\.025,00/.test(home) && home.includes('11.495,00'));

    // F5: Cobros › Cobrada pide la fecha
    await p.goto(`${base}/app/finanzas/cobros`);
    await p.getByRole('button', { name: 'Cobrada' }).first().waitFor({ timeout: 10000 });
    await p.getByRole('button', { name: 'Cobrada' }).first().click();
    const date = p.locator('#pd-date');
    await date.waitFor({ timeout: 5000 });
    check('F5: al marcar como cobrada se pide la fecha de cobro', await date.isVisible());
    const first = (await api('GET', '/api/finance/receivables', null, token)).data.pending[0];
    const paidAt = first.invoice_date.slice(0, 8) + String(Math.min(28, Number(first.invoice_date.slice(8, 10)) + 10)).padStart(2, '0');
    await date.fill(paidAt);
    await p.locator('#paid-date-form').evaluate(f => f.requestSubmit());
    await wait(1500);
    const row = (await api('GET', '/api/ledger', null, token)).data.entries.find(e => e.id === first.id);
    check('F5: se guarda la fecha elegida, no la de hoy', row?.paid === true && row?.paid_at === paidAt);

    // F5: formulario del libro
    await p.goto(`${base}/app/finanzas/libro`);
    await p.getByRole('button', { name: 'Añadir a mano' }).first().click();
    await p.locator('#entry-form').waitFor();
    check('F5: gasto nuevo (pagado) muestra «Fecha de pago»', await p.locator('#ef-paid_at').isVisible());

    // F9
    const pe = await page('en');
    await pe.goto(`${base}/app/finanzas/libro`);
    await pe.getByText('Q3', { exact: true }).first().waitFor({ timeout: 10000 });
    const ledgerEn = await pe.locator('main').innerText();
    check('F9: Libro en inglés con Q1…Q4 (sin «1T»)', ['Q1', 'Q2', 'Q3', 'Q4'].every(q => ledgerEn.includes(q)) && !/\b[1-4]T\b/.test(ledgerEn));
  } finally {
    await browser.close();
    server.close();
    try { fs.unlinkSync(DB); } catch { /* nada */ }
  }
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error('FALLO:', e.message); try { fs.unlinkSync(DB); } catch { /* nada */ } process.exit(1); });
