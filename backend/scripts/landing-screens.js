/**
 * scripts/landing-screens.js — sesión 10: capturas REALES de la app para la
 * landing, con una cuenta de EJEMPLO (datos ficticios del "Taller García").
 *
 * Todo en local y en una BD temporal: no toca producción ni la BD de trabajo.
 *   1. Arranca el backend (NODE_ENV=test, BD en /tmp) y crea una licencia Pro.
 *   2. Rellena perfil, libro (jul–sep), apartado para Hacienda y un
 *      diagnóstico de ejemplo (el informe es de muestra: la IA no se llama).
 *   3. Sirve frontend/dist con un proxy de /api y hace las capturas con
 *      playwright-core (Chromium en ~/.cache/ms-playwright) en oscuro y claro.
 *
 * Uso (desde backend/, con el frontend compilado):
 *   PLAYWRIGHT_CORE=/ruta/node_modules/playwright-core node scripts/landing-screens.js
 * Salida: frontend/public/screens/<pantalla>-<tema>.jpg
 */

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');

const PORT = 4105, WEB = 4106;
const DB = path.join(os.tmpdir(), `nokfi-screens-${Date.now()}.db`);
Object.assign(process.env, {
  NODE_ENV: 'test', PORT: String(PORT), DB_PATH: DB, BASE_URL: `http://localhost:${PORT}`,
  ADMIN_SECRET: 'f'.repeat(64), ALLOWED_ORIGINS: `http://localhost:4106`, PLAN_PRICE_MINI_EUR: '5', PLAN_PRICE_PRO_EUR: '20', PLAN_PRICE_MAX_EUR: '50'
});

const DIST = path.join(__dirname, '../../frontend/dist');
const OUT = path.join(__dirname, '../../frontend/public/screens');
const { chromium } = require(process.env.PLAYWRIGHT_CORE || 'playwright-core');
const CHROME = fs.readdirSync(path.join(os.homedir(), '.cache/ms-playwright'))
  .filter(d => /^chromium-\d+$/.test(d)).sort().map(d => path.join(os.homedir(), '.cache/ms-playwright', d, 'chrome-linux64/chrome'))
  .find(p => fs.existsSync(p));

function api(method, p, body, token) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req = http.request({ host: 'localhost', port: PORT, path: p, method, headers: {
      'Content-Type': 'application/json', ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    } }, (res) => { let b = ''; res.on('data', d => { b += d; }); res.on('end', () => { try { resolve({ status: res.statusCode, data: JSON.parse(b) }); } catch { resolve({ status: res.statusCode, data: b }); } }); });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

const wait = (ms) => new Promise(r => setTimeout(r, ms));
async function waitForServer() {
  for (let i = 0; i < 50; i++) {
    try { const r = await api('GET', '/api/health'); if (r.status === 200) return; } catch { /* aún no */ }
    await wait(200);
  }
  throw new Error('El backend no arrancó');
}

/* ── Datos de ejemplo (ficticios) ── */
const iso = (d) => d.toISOString().slice(0, 10);
const day = (offset) => { const d = new Date(); d.setDate(d.getDate() + offset); return iso(d); };
const inc = (date, due, name, nif, num, concept, base, paid, email) => ({
  type: 'income', invoice_date: date, due_date: due, party_name: name, party_nif: nif, party_email: email || '', invoice_number: num,
  concept, category: 'Ventas', base, vat_rate: 21, vat_amount: +(base * 0.21).toFixed(2), irpf_rate: 0, irpf_amount: 0,
  total: +(base * 1.21).toFixed(2), paid,
  // Cobrada unos días después del vencimiento (días medios de cobro realistas).
  ...(paid ? { paid_at: iso(new Date(Math.min(Date.now(), new Date(`${due}T12:00:00`).getTime() + 6 * 86400000))) } : {})
});
const exp = (date, name, nif, num, concept, category, base, vat = 21) => ({
  type: 'expense', invoice_date: date, due_date: null, party_name: name, party_nif: nif, invoice_number: num, concept, category,
  base, vat_rate: vat, vat_amount: +(base * vat / 100).toFixed(2), irpf_rate: 0, irpf_amount: 0, total: +(base * (1 + vat / 100)).toFixed(2), paid: true
});

function ledger() {
  const y = new Date().getFullYear();
  const m = (mm, dd) => `${y}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
  return [
    inc(m(7, 3), m(8, 2), 'Transportes López', 'B12345674', 'F-2026-041', 'Revisión y frenos flota', 2150, true),
    inc(m(7, 18), m(8, 17), 'Autoescuela Norte', 'B87654321', 'F-2026-045', 'Mantenimiento 4 vehículos', 1380, true),
    inc(m(7, 28), m(8, 27), 'Particulares julio', '', 'F-2026-049', 'Reparaciones de mostrador', 3960, true),
    inc(m(8, 6), m(9, 5), 'Transportes López', 'B12345674', 'F-2026-052', 'Embrague furgoneta', 1890, false, 'admin@transporteslopez.example'),
    inc(m(8, 21), m(9, 20), 'Cooperativa del Valle', 'F11223344', 'F-2026-058', 'ITV y reparación tractor', 2640, true),
    inc(m(8, 29), m(9, 28), 'Particulares agosto', '', 'F-2026-061', 'Reparaciones de mostrador', 3120, true),
    inc(m(9, 4), day(9), 'Autoescuela Norte', 'B87654321', 'F-2026-064', 'Neumáticos y alineado', 1240, false, 'gestion@autoescuelanorte.example'),
    inc(m(9, 12), day(-3), 'Grúas Ramírez', 'B55443322', 'F-2026-067', 'Motor de arranque', 960, false, 'gruas@ramirez.example'),
    inc(m(9, 26), m(9, 30), 'Particulares septiembre', '', 'F-2026-071', 'Reparaciones de mostrador', 4280, true),
    exp(m(7, 1), 'Inmobiliaria Sur', 'B99887766', 'A-07', 'Alquiler nave julio', 'Alquiler', 950),
    exp(m(8, 1), 'Inmobiliaria Sur', 'B99887766', 'A-08', 'Alquiler nave agosto', 'Alquiler', 950),
    exp(m(9, 1), 'Inmobiliaria Sur', 'B99887766', 'A-09', 'Alquiler nave septiembre', 'Alquiler', 950),
    exp(m(7, 9), 'Neumáticos del Sur, S.L.', 'B87654329', 'NS-3310', 'Neumáticos y recambios', 'Proveedores', 1100),
    exp(m(8, 8), 'Neumáticos del Sur, S.L.', 'B87654329', 'NS-3402', 'Neumáticos y recambios', 'Proveedores', 1290),
    exp(m(9, 10), 'Neumáticos del Sur, S.L.', 'B87654329', 'NS-3497', 'Neumáticos y recambios', 'Proveedores', 860),
    exp(m(7, 15), 'Eléctrica Peninsular', 'A12121212', 'L-7', 'Luz nave', 'Suministros', 210),
    exp(m(8, 15), 'Eléctrica Peninsular', 'A12121212', 'L-8', 'Luz nave', 'Suministros', 236),
    exp(m(9, 15), 'Eléctrica Peninsular', 'A12121212', 'L-9', 'Luz nave', 'Suministros', 224),
    exp(m(7, 20), 'Seguros Atlántico', 'A34343434', 'S-26', 'Seguro del taller (trimestre)', 'Seguros', 385, 0),
    exp(m(7, 5), 'Software Taller', 'B45454545', 'ST-7', 'Programa de citas', 'Tecnología', 39),
    exp(m(8, 5), 'Software Taller', 'B45454545', 'ST-8', 'Programa de citas', 'Tecnología', 39),
    exp(m(9, 5), 'Software Taller', 'B45454545', 'ST-9', 'Programa de citas', 'Tecnología', 39)
  ];
}

/** Informe de ejemplo con las cifras que Nokfi calcula para esta cuenta (GET /api/dashboard). */
function sampleReport(d) {
  const eur = (n) => new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', useGrouping: 'always', maximumFractionDigits: 0 }).format(n);
  const due = new Date(`${d.taxes.due_date}T00:00:00`).toLocaleDateString('es-ES', { day: 'numeric', month: 'long' });
  const top = d.receivables.top_overdue;
  const q = `${d.taxes.quarter}T`;
  return {
    summary: `Lo más urgente: los impuestos del ${q} (unos ${eur(d.taxes.total_estimated)}) se pagan hasta el ${due} y te faltan ${eur(d.taxes.missing)} por apartar. Además, ${top.party_name} te debe ${eur(top.total)} desde hace ${top.days_overdue} días.`,
    key_figures: [
      { label: 'Vencido por cobrar', value: eur(d.receivables.overdue_total), note: `${top.party_name}, ${top.days_overdue} días` },
      { label: `Impuestos del ${q}`, value: eur(d.taxes.total_estimated), note: `303 + 130, hasta el ${due}` },
      { label: 'Caja a 90 días', value: eur(d.forecast.at90) }
    ],
    strengths: ['Tienes apuntados los gastos fijos del taller.', 'Guardas en digital los tickets y facturas de gastos.'],
    priorities: [
      { title: `Aparta lo que falta para el ${due}`, detail: `Te faltan ${eur(d.taxes.missing)} de los ${eur(d.taxes.total_estimated)} del 303 y el 130.`, severity: 'high', link: '/app/finanzas/impuestos' },
      { title: `Reclama a ${top.party_name}`, detail: `${eur(top.total)} vencidos desde hace ${top.days_overdue} días.`, severity: 'medium', link: '/app/finanzas/cobros' },
      { title: 'Revisa el precio de los recambios', detail: 'Neumáticos del Sur es tu mayor gasto después del alquiler.', severity: 'low', link: '/app/finanzas/fugas' }
    ],
    action_plan: [
      { title: `Enviar recordatorio a ${top.party_name}`, detail: 'Tono amable: es el primer aviso.', timeframe: 'Hoy', due_in_days: 0, link: '/app/finanzas/cobros' },
      { title: `Apartar ${eur(d.taxes.missing)} para Hacienda`, detail: `Antes del ${due}.`, timeframe: 'Esta semana', due_in_days: 5, link: '/app/finanzas/impuestos' },
      { title: 'Pedir presupuesto a otro proveedor de neumáticos', detail: 'Compara con lo que pagas ahora.', timeframe: 'Este mes', due_in_days: 20, link: '/app/finanzas/fugas' }
    ],
    glossary: [{ term: 'Modelo 303', definition: 'Declaración trimestral del IVA.' }, { term: 'Modelo 130', definition: 'Pago a cuenta del IRPF de los autónomos.' }]
  };
}

/* ── Servidor del frontend con proxy de /api ── */
function webServer() {
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.json': 'application/json', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json' };
  return http.createServer((req, res) => {
    if (req.url.startsWith('/api/')) {
      const p = http.request({ host: 'localhost', port: PORT, path: req.url, method: req.method, headers: req.headers }, (r) => { res.writeHead(r.statusCode, r.headers); r.pipe(res); });
      req.pipe(p);
      return;
    }
    if (req.url.startsWith('/sw.js')) { res.writeHead(404); res.end(); return; } // sin service worker
    let file = path.join(DIST, decodeURIComponent(req.url.split('?')[0]));
    if (!file.startsWith(DIST) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(DIST, 'index.html');
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  }).listen(WEB);
}

async function main() {
  if (!CHROME) throw new Error('No encuentro Chromium en ~/.cache/ms-playwright');
  require('../server');
  await waitForServer();
  const admin = 'f'.repeat(64);
  const lic = await api('POST', '/api/admin/licenses', { email: 'ejemplo@nokfi.local', plan: 'pro', password: 'Ejemplo-Captura-2026!' }, admin);
  const login = await api('POST', '/api/auth/login', { email: 'ejemplo@nokfi.local', license_key: lic.data.key, password: 'Ejemplo-Captura-2026!' });
  const token = login.data.token;
  if (!token) throw new Error('Login fallido: ' + JSON.stringify(login.data));

  await api('PUT', '/api/profile', {
    companyName: 'Taller García', sector: 'Taller mecánico', size: '2-5', legalForm: 'autonomo', taxId: '12345678Z',
    onboardingCompleted: true, welcomeCardDismissed: true, fiscalReminders: true, cashBalance: 6200, mainExpenses: ['Alquiler', 'Proveedores', 'Suministros']
  }, token);
  const led = await api('POST', '/api/ledger', { entries: ledger(), force: true }, token);
  if (led.status !== 200 && led.status !== 201) throw new Error('Libro: ' + JSON.stringify(led.data));
  const q = Math.floor(new Date().getMonth() / 3) + 1;
  await api('PUT', '/api/finance/reserve', { year: new Date().getFullYear(), quarter: q, amount: 4000 }, token);
  const dash = (await api('GET', '/api/dashboard', null, token)).data;

  const { createAnalysis } = require('../db/database');
  const { createActionsForAnalysis } = require('../db/actions');
  const { computeHealth } = require('../utils/healthScore');
  const answers = Object.fromEntries(Object.keys(require('../utils/healthScore').WEIGHTS).map((id, i) => [id, i % 3 === 0 ? false : i % 5 === 0 ? 'partial' : true]));
  const health = computeHealth(answers);
  const licId = lic.data.id;
  const report = sampleReport(dash);
  const aid = createAnalysis({ license_id: licId, kind: 'cuestionario', title: 'Diagnóstico de negocio', result_json: report, meta: { answers, health, task: 'cuestionario', source: 'web' }, prompt_chars: 1 });
  createActionsForAnalysis(licId, aid, report.action_plan);
  createAnalysis({ license_id: licId, kind: 'excel', title: 'Caja', prompt_chars: 1,
    result_json: { summary: 'Caja del trimestre.', key_figures: [{ label: 'Saldo final', value: '6.200 €' }] },
    meta: { module: 'caja', files: ['caja-taller-3T.csv'], period: { from: `${new Date().getFullYear()}-07`, to: `${new Date().getFullYear()}-09` }, source: 'web' } });

  // Hechos hace unos días (las capturas fijan el reloj a media mañana de hoy).
  require('../db/database').getDB().prepare("UPDATE analyses SET created_at = datetime('now', '-3 days') WHERE license_id = ?").run(licId);
  require('../db/database').getDB().prepare("UPDATE analyses SET created_at = datetime('now', '-2 days') WHERE id = ?").run(aid);

  const server = webServer();
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ executablePath: CHROME });
  const shots = [
    ['inicio', '/app/home'],
    ['impuestos', '/app/finanzas/impuestos'],
    ['cobros', '/app/finanzas/cobros'],
    ['informe', `/app/historial/${aid}`]
  ];
  for (const theme of ['dark', 'light']) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1.5, locale: 'es-ES', timezoneId: 'Europe/Madrid' });
    await ctx.addInitScript(([tk, th]) => {
      sessionStorage.setItem('nokfi_session_token', tk);
      localStorage.setItem('nokfi_theme', th);
      localStorage.setItem('nokfi_lang', 'es');
    }, [token, theme]);
    // Media mañana de hoy, para que el saludo sea "Buenos días".
    const d = new Date(); d.setHours(10, 30, 0, 0);
    await ctx.clock.setFixedTime(d);
    const page = await ctx.newPage();
    for (const [name, url] of shots) {
      await page.goto(`http://localhost:${WEB}${url}`, { waitUntil: 'networkidle' });
      await page.addStyleTag({ content: '*,*::before,*::after{animation-duration:0s!important;transition-duration:0s!important}' });
      await wait(1200);
      await page.screenshot({ path: path.join(OUT, `${name}-${theme}.jpg`), type: 'jpeg', quality: 82 });
      console.log('✓', name, theme);
    }
    await ctx.close();
  }
  await browser.close();
  server.close();
  try { fs.unlinkSync(DB); } catch { /* nada */ }
  process.exit(0);
}

main().catch((e) => { console.error(e); try { fs.unlinkSync(DB); } catch { /* nada */ } process.exit(1); });
