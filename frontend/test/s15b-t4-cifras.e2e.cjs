/**
 * S15b · T4 · lote 11 (cifras, libro y facturas): comprobación en el navegador
 * con un backend local (BD temporal, sin IA ni Stripe) y el `dist` ya compilado.
 *   Libro: periodo vacío ≠ libro vacío; no exporta un periodo vacío sin avisar;
 *          totales y Excel siguen el filtro (fecha como fecha en el .xlsx);
 *          signo menos (−) coherente; IRPF 1 %/2 % y sociedad sin retención en ingresos
 *   Leer facturas: un PDF Factur-X cuenta como gratis en el aviso; al guardar
 *          facturas de otro trimestre dice en cuál quedan
 *   Facturas: pista de retención de sociedad · Impuestos: explicación del 5 % del 130
 * Uso: VITE_API_URL=/api npx vite build && node test/s15b-t4-cifras.e2e.cjs
 *      (puertos 4201/4202 o S15B_PORT/S15B_WEB_PORT; DEBUG=1 enseña la consola)
 */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');

const PORT = Number(process.env.S15B_PORT || 4201), WEB = Number(process.env.S15B_WEB_PORT || 4202);
const DB = path.join(os.tmpdir(), `nokfi-s15b-t4-cifras-${Date.now()}.db`);
const DL = fs.mkdtempSync(path.join(os.tmpdir(), 'nokfi-s15b-t4-dl-'));
Object.assign(process.env, {
  NODE_ENV: 'test', PORT: String(PORT), DB_PATH: DB, BASE_URL: `http://localhost:${PORT}`, ADMIN_SECRET: 'e'.repeat(64),
  ALLOWED_ORIGINS: `http://localhost:${WEB}`, PLAN_PRICE_MINI_EUR: '5', PLAN_PRICE_PRO_EUR: '20', PLAN_PRICE_MAX_EUR: '50'
});
delete process.env.RESEND_API_KEY;
const DIST = path.join(__dirname, '../dist');
const FIX = path.join(__dirname, 'fixtures/einvoice');
const PW = '/home/mario/Escritorio/Proyectos/n8n-nodes-nokfi/node_modules/playwright-core';
const CHROME = fs.readdirSync(path.join(os.homedir(), '.cache/ms-playwright')).filter(d => /^chromium-\d+$/.test(d)).sort()
  .map(d => path.join(os.homedir(), '.cache/ms-playwright', d, 'chrome-linux64/chrome')).find(p => fs.existsSync(p));

async function api(method, p, body, token) {
  const res = await fetch(`http://localhost:${PORT}${p}`, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  try { return { status: res.status, data: JSON.parse(text) }; } catch { return { status: res.status, data: text }; }
}
const wait = (ms) => new Promise(r => setTimeout(r, ms));

function webServer() {
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.json': 'application/json', '.woff2': 'font/woff2' };
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

async function account(email, legalForm) {
  const admin = 'e'.repeat(64);
  const lic = await api('POST', '/api/admin/licenses', { email, plan: 'pro', password: 'Cifras-T4-2026!' }, admin);
  const token = (await api('POST', '/api/auth/login', { email, license_key: lic.data.key, password: 'Cifras-T4-2026!' })).data.token;
  await api('PUT', '/api/profile', { companyName: 'QA T4 SL', legalForm, onboardingCompleted: true, welcomeCardDismissed: true }, token);
  return token;
}

async function main() {
  if (!fs.existsSync(path.join(DIST, 'index.html'))) throw new Error('Falta frontend/dist: ejecuta VITE_API_URL=/api npx vite build');
  require('../../backend/server');
  for (let i = 0; i < 50; i++) { try { if ((await api('GET', '/api/health')).status === 200) break; } catch { /* aún no */ } await wait(200); }

  const token = await account('t4-libro@nokfi.local', 'sociedad');
  const e = (date, type, base, i, extra = {}) => ({ type, invoice_date: date, party_name: `${type === 'income' ? 'Cliente' : 'Proveedor'} ${i}`, invoice_number: `T4-${i}`,
    base, vat_rate: 21, vat_amount: Math.round(base * 21) / 100, total: Math.round(base * 121) / 100, paid: true, paid_at: date, ...extra });
  const led = await api('POST', '/api/ledger', { entries: [
    e('2026-02-10', 'income', 1000, 1), e('2026-02-11', 'expense', 300, 2), e('2026-05-10', 'expense', 200, 3),
    e('2026-08-10', 'expense', -100, 4) // abono de un proveedor: IVA en negativo
  ] }, token);
  if (led.status !== 201) throw new Error('Libro: ' + JSON.stringify(led.data));

  // Factur-X de verdad: lo emite otra cuenta (PDF con el XML dentro).
  const issuer = await account('t4-emisor@nokfi.local', 'autonomo');
  await api('PUT', '/api/invoicing/settings', { legal_name: 'Emisor T4 SL', tax_id: 'B12345674', address: 'Calle Mayor 12', postal_code: '28013', city: 'Madrid' }, issuer);
  const inv = await api('POST', '/api/invoicing/invoices', { customer: { name: 'QA T4 SL', tax_id: '12345678Z', address: 'Av. Sol 5', postal_code: '41001', city: 'Sevilla' },
    lines: [{ description: 'Servicio', quantity: 1, unit_price: 100, vat_rate: 21 }] }, issuer);
  if (inv.status !== 201) throw new Error('Factura: ' + JSON.stringify(inv.data));
  const fx = await fetch(`http://localhost:${PORT}/api/invoicing/invoices/${inv.data.id}/xml?format=facturx`, { headers: { Authorization: `Bearer ${issuer}` } });
  const fxPath = path.join(DL, 'facturx.pdf');
  fs.writeFileSync(fxPath, Buffer.from(await fx.arrayBuffer()));

  const server = webServer();
  const { chromium } = require(PW);
  const browser = await chromium.launch({ executablePath: CHROME, timeout: 600000 });
  const page = async (tk, lang = 'es') => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'es-ES', timezoneId: 'Europe/Madrid', acceptDownloads: true });
    await ctx.addInitScript(([t, l]) => { sessionStorage.setItem('nokfi_session_token', t); localStorage.setItem('nokfi_lang', l); }, [tk, lang]);
    const pg = await ctx.newPage();
    if (process.env.DEBUG) { pg.on('console', m => console.log('CONSOLE', m.type(), m.text().slice(0, 200))); pg.on('pageerror', er => console.log('PAGEERR', er.message)); }
    return pg;
  };
  const base = `http://localhost:${WEB}`;
  try {
    const p = await page(token);
    await p.goto(`${base}/app/finanzas/libro`);
    const year = p.locator('select[aria-label="Año"]');
    await year.waitFor({ timeout: 10000 });

    // Periodo vacío (2025) ≠ libro vacío
    await year.selectOption('2025');
    await p.getByText('No hay apuntes en este periodo').waitFor({ timeout: 10000 });
    const empty = await p.locator('main').innerText();
    check('Libro: un periodo sin apuntes dice «No hay apuntes en este periodo», no «Tu libro está vacío»', !empty.includes('Tu libro está vacío'));
    let downloaded = false;
    p.once('download', () => { downloaded = true; });
    await p.getByRole('button', { name: 'Excel' }).first().click();
    await p.getByText('no hay nada que exportar').first().waitFor({ timeout: 5000 });
    await wait(500);
    check('Libro: exportar un periodo vacío avisa y no descarga nada', !downloaded);

    // Año 2026 completo, filtro «Gastos»: totales y Excel solo de lo filtrado
    await year.selectOption('2026');
    await p.getByRole('radio', { name: 'Año', exact: true }).click();
    await p.getByText('Proveedor 4').waitFor({ timeout: 10000 });
    const all = await p.locator('main').innerText();
    check('Libro: signo menos tipográfico en el IVA del abono (IVA −21,00 €) y ningún «-21,00»', all.includes('−21,00') && !all.includes('-21,00'));
    await p.getByRole('radio', { name: 'Gastos', exact: true }).click();
    await p.getByText('Los totales y la exportación incluyen solo lo filtrado').waitFor({ timeout: 5000 });
    const filtered = await p.locator('main').innerText();
    check('Libro: con el filtro «Gastos» los totales son solo de los gastos (ingresos 0,00 €; gastos 400,00 €) y se dice «3 de 4»',
      filtered.includes('400,00') && filtered.includes('3 de 4') && !filtered.includes('1.000,00'));
    const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 15000 }), p.getByRole('button', { name: 'Excel' }).first().click()]);
    const xlsxPath = path.join(DL, 'libro.xlsx');
    await dl.saveAs(xlsxPath);
    const XLSX = require(path.join(__dirname, '../node_modules/xlsx'));
    const wb = XLSX.read(fs.readFileSync(xlsxPath), { cellDates: true, cellNF: true });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1 });
    check('Excel del libro: solo los 3 gastos filtrados, con la fecha como fecha y los importes con formato 0,00',
      rows.length === 4 && ws.A2?.t === 'd' && /d.*m.*y/i.test(ws.A2.z || '') && /0\.00/.test(ws.H2?.z || '') && typeof ws.H2?.v === 'number');

    // Apunte a mano: sociedad sin retención en ingresos; gastos con 1 % y 2 %
    await p.getByRole('button', { name: 'Añadir a mano' }).first().click();
    await p.locator('#entry-form').waitFor();
    const opts = await p.locator('#ef-irpf_rate option').allInnerTexts();
    check('Apunte a mano (gasto): IRPF con 1 % y 2 % como la factura', ['0 %', '1 %', '2 %', '7 %', '15 %', '19 %'].every(o => opts.includes(o)));
    await p.locator('#entry-form').getByRole('radio', { name: 'Ingreso', exact: true }).click();
    await p.getByText('Las sociedades normalmente facturan sin retención de IRPF').waitFor({ timeout: 5000 });
    check('Apunte a mano (ingreso de una sociedad): sin campo de retención', await p.locator('#ef-irpf_rate').count() === 0);
    await p.keyboard.press('Escape');
    await wait(300);

    // Leer facturas: Factur-X gratis en el aviso; guardar de otro trimestre → dice dónde quedan
    await p.getByRole('radio', { name: 'Todos', exact: true }).click();
    await p.getByRole('radio', { name: '4T', exact: true }).click();
    await p.getByRole('button', { name: 'Leer facturas' }).first().click();
    const input = p.locator('input[type=file]:not([webkitdirectory])').first();
    await input.setInputFiles([fxPath, path.join(FIX, 'ubl.xml')]);
    await p.getByText('Se van a leer 2 facturas electrónicas').waitFor({ timeout: 15000 });
    const notice = await p.locator('main').innerText();
    check('Leer facturas: un PDF Factur-X + un XML → «2 facturas electrónicas… sin gastar créditos» (no «Gastará 1 crédito»)',
      notice.includes('sin gastar créditos') && !notice.includes('Gastará 1 crédito'));
    await p.getByRole('button', { name: 'Leer facturas' }).last().click();
    await p.getByRole('button', { name: /Guardar/ }).first().waitFor({ timeout: 15000 });
    await p.getByRole('button', { name: /Guardar/ }).first().click();
    await p.getByText(/es de otro periodo y ha quedado en 3T 2026/).waitFor({ timeout: 10000 });
    check('Leer facturas: al guardar una de septiembre estando en el 4T, dice que ha quedado en el 3T 2026', true);

    // Facturas: pista de retención para una sociedad
    await p.goto(`${base}/app/finanzas/facturas/nueva`);
    await p.locator('#ie-irpf').waitFor({ timeout: 10000 });
    const editor = await p.locator('main').innerText();
    check('Nueva factura (sociedad): pista «Las sociedades normalmente facturan sin retención (0 %)», no la de profesionales',
      editor.includes('Las sociedades normalmente facturan sin retención (0 %)') && !editor.includes('Profesionales: 15 %'));

    // Impuestos (autónomo): el 130 explica lo del 5 %
    const pa = await page(issuer);
    await api('POST', '/api/ledger', { entries: [e('2026-10-02', 'income', 500, 9)] }, issuer);
    await pa.goto(`${base}/app/finanzas/impuestos`);
    await pa.getByText('Pago fraccionado IRPF (modelo 130)').waitFor({ timeout: 10000 });
    const taxes = await pa.locator('main').innerText();
    check('Impuestos: el 130 explica que no resta el 5 % de gastos de difícil justificación', taxes.includes('5 % de gastos de difícil justificación'));

    // Onboarding: el aviso de recordatorios no habla del 130
    const t2 = await api('POST', '/api/admin/licenses', { email: 't4-onb@nokfi.local', plan: 'pro', password: 'Cifras-T4-2026!' }, 'e'.repeat(64));
    const tk2 = (await api('POST', '/api/auth/login', { email: 't4-onb@nokfi.local', license_key: t2.data.key, password: 'Cifras-T4-2026!' })).data.token;
    const po = await page(tk2);
    await po.goto(`${base}/app/home`);
    await po.getByText('Avisarme antes de cada plazo fiscal').waitFor({ timeout: 10000 });
    const onb = await po.locator('body').innerText();
    check('Onboarding: «Te escribimos… antes de cada declaración que te toque» sin «el 130»', onb.includes('cada declaración que te toque') && !/el 130/.test(onb));
  } finally {
    await browser.close();
    server.close();
    try { fs.unlinkSync(DB); } catch { /* nada */ }
    fs.rmSync(DL, { recursive: true, force: true });
  }
  process.exit(fail ? 1 : 0);
}

main().catch((er) => { console.error('FALLO:', er.message); try { fs.unlinkSync(DB); } catch { /* nada */ } process.exit(1); });
