/**
 * S15b T4 · lote 13 (frontend, rendimiento y docs): comprobación en el navegador y sin él.
 *   F1  OnboardingModal retiene el foco (Tab y Shift+Tab no salen al menú de detrás)
 *   F2  landing sin desbordes (KPI de la vista previa, cifras, FAQ) en es/en/fr/de/it/pl a 360/390/1366;
 *       FAQ, pie y selector de idioma de PublicChrome ≥ 40×40 en el móvil; las animaciones siguen
 *   F3  VERI*FACTU: números de factura pulsables (≥ 40 px en el móvil); conceptos del detalle sin scroll interno
 *   F4  plantillas n8n por idioma: `lang` del idioma, columnas/hoja/textos traducidos y código JS válido
 *   F5  calculadora de IVA: menos JS (sin el inglés ni el contenido público en inglés) y la página sigue viva
 *   F7  manifest con capturas «narrow» reales (archivo y tamaño correctos)
 *   F8  demo-account: ALLOWED_ORIGINS sigue a DEMO_WEB_PORT; landing-screens genera los WebP de la landing
 *   F10 aviso del build si falta VITE_API_URL
 * Usa la cuenta de ejemplo (backend/scripts/demo-account.js, BD temporal, sin IA ni Stripe) y el dist
 * ya compilado. Puertos 4221 (API), 4222 (web de la demo) y 4223 (dist prerenderizado).
 * Uso: VITE_API_URL=/api npm run build && node test/s15b-t4-front.e2e.cjs   (ONLY=F1,F2… para acotar; DEBUG=1)
 */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const zlib = require('zlib');

const API = Number(process.env.T4F_PORT || 4221), DEMO_WEB = Number(process.env.T4F_DEMO_WEB_PORT || 4222), WEB = Number(process.env.T4F_WEB_PORT || 4223);
process.env.DEMO_PORT = String(API);
process.env.DEMO_WEB_PORT = String(DEMO_WEB);
// VERI*FACTU en modo prueba contra un servicio que no responde: los registros quedan «en espera».
Object.assign(process.env, { VERIFACTU_ENV: 'test', VERIFACTU_LICENSES: '*', VERIFACTU_ENDPOINT: 'http://127.0.0.1:9/' });
const { prepareDemo, CHROME, wait } = require('../../backend/scripts/demo-account');
const ROOT = path.join(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const PW = '/home/mario/Escritorio/Proyectos/n8n-nodes-nokfi/node_modules/playwright-core';
const ONLY = (process.env.ONLY || '').split(',').filter(Boolean);
const want = (id) => !ONLY.length || ONLY.includes(id);
const DEBUG = !!process.env.DEBUG;

let fail = 0;
const check = (label, ok, extra) => { if (ok) console.log('✅', label); else { fail++; console.log('❌', label, extra !== undefined ? JSON.stringify(extra).slice(0, 1500) : ''); } };

function api(method, p, body, token) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req = http.request({ host: 'localhost', port: API, path: p, method, headers: {
      'Content-Type': 'application/json', ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}) } }, (res) => {
      let b = ''; res.on('data', d => { b += d; }); res.on('end', () => { try { resolve({ status: res.statusCode, data: JSON.parse(b) }); } catch { resolve({ status: res.statusCode, data: b }); } });
    });
    req.on('error', reject); if (data) req.write(data); req.end();
  });
}

/** Sirve el dist como Nginx (try_files $uri $uri/ /index.html, así salen las páginas prerenderizadas). */
function webServer() {
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.json': 'application/json', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json' };
  return http.createServer((req, res) => {
    if (req.url.startsWith('/api/')) {
      const headers = { ...req.headers }; delete headers.origin; // mismo origen detrás de Nginx
      const p = http.request({ host: 'localhost', port: API, path: req.url, method: req.method, headers }, (r) => { res.writeHead(r.statusCode, r.headers); r.pipe(res); });
      req.pipe(p);
      return;
    }
    if (req.url.startsWith('/sw.js')) { res.writeHead(404); res.end(); return; }
    let file = path.join(DIST, decodeURIComponent(req.url.split('?')[0]));
    if (file.startsWith(DIST) && fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
    if (!file.startsWith(DIST) || !fs.existsSync(file)) file = path.join(DIST, 'index.html');
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  }).listen(WEB);
}

/* Medición dentro de la página: texto que se sale de su caja y objetivos táctiles pequeños. */
function audit({ mobile, scopeSel }) {
  const desc = (el) => {
    let s = el.tagName.toLowerCase();
    const c = (typeof el.className === 'string' ? el.className : '').trim().split(/\s+/).filter(Boolean).slice(0, 3).join('.');
    if (c) s += '.' + c;
    const txt = (el.innerText || el.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ').slice(0, 40);
    return txt ? `${s} «${txt}»` : s;
  };
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return false;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none') return false;
    return !el.closest('.sr-only');
  };
  const scope = scopeSel ? document.querySelector(scopeSel) : document.body;
  const vis = scope ? [...scope.querySelectorAll('*')].filter(el => !(el instanceof SVGElement) && !['SCRIPT', 'STYLE', 'BR'].includes(el.tagName)).filter(visible) : [];
  const res = { hScroll: document.documentElement.scrollWidth - window.innerWidth, spill: [], small: [] };
  for (const el of vis) {
    if (![...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim().length > 1)) continue;
    const cs = getComputedStyle(el);
    if (cs.display === 'inline' || cs.textOverflow === 'ellipsis' || el.clientWidth === 0) continue;
    if (el.scrollWidth - el.clientWidth > 2) res.spill.push(`${desc(el)} [+${el.scrollWidth - el.clientWidth}px]`);
  }
  if (mobile) {
    for (const el of vis.filter(e => e.matches('a[href],button,select,summary,[role=tab]'))) {
      if (el.tagName === 'A' && getComputedStyle(el).display === 'inline') continue; // enlace dentro de un párrafo
      const r = el.getBoundingClientRect();
      if (r.width < 39.5 || r.height < 39.5) res.small.push(`${desc(el)} ${Math.round(r.width)}×${Math.round(r.height)}`);
    }
  }
  res.spill = [...new Set(res.spill)]; res.small = [...new Set(res.small)];
  return res;
}

const focusInDialog = () => {
  const d = document.querySelector('[role=dialog]');
  const el = document.activeElement;
  return !!d && !!el && el !== document.body && d.contains(el);
};

async function main() {
  if (!fs.existsSync(path.join(DIST, 'index.html'))) throw new Error('Falta frontend/dist: ejecuta VITE_API_URL=/api npm run build');

  /* ── F10: aviso del build sin VITE_API_URL (sin navegador) ── */
  if (want('F10')) {
    const { apiUrlWarning = () => null } = await import(path.join(ROOT, 'scripts/api-url-check.mjs')).catch(() => ({}));
    check('F10 sin VITE_API_URL → aviso que nombra la variable y el valor de producción', /VITE_API_URL/.test(apiUrlWarning({}) || '') && /VITE_API_URL=\/api/.test(apiUrlWarning({ VITE_API_URL: '  ' }) || ''));
    check('F10 con VITE_API_URL=/api → sin aviso', apiUrlWarning({ VITE_API_URL: '/api' }) === null);
    const cfg = fs.readFileSync(path.join(ROOT, 'vite.config.js'), 'utf8');
    check('F10 vite.config.js usa el plugin del aviso', /warnMissingApiUrl\(\)/.test(cfg));
    const bundle = fs.readdirSync(path.join(DIST, 'assets')).filter(f => /^index-.*\.js$/.test(f)).map(f => fs.readFileSync(path.join(DIST, 'assets', f), 'utf8')).join('');
    check('F10 el dist que se prueba está construido con VITE_API_URL=/api (sin localhost:3001)', bundle.length > 0 && !bundle.includes('localhost:3001'));
  }

  /* ── F4: plantillas n8n por idioma (sin navegador) ── */
  if (want('F4')) {
    const dir = path.join(ROOT, 'public/templates/n8n');
    const AsyncFn = Object.getPrototypeOf(async function () {}).constructor;
    const ES_LEFT = [/\barchivo:/, /\bemisor:/, /\bcuadra:/, /\bvencimiento:/, /\bretencion:/, /'sí'/, /Facturas leídas/, /Caja de la semana/, /Prioridades:/, /Revisa \$\{/, /'es-ES'/, /Resumen de facturas/, /Caja semanal/, /No se pudieron leer/, /Convierte los adjuntos/];
    for (const lang of ['es', 'en', 'fr', 'de', 'it', 'pl']) {
      const sub = lang === 'es' ? dir : path.join(dir, lang);
      for (const f of fs.readdirSync(sub).filter(x => x.endsWith('.json'))) {
        const wf = JSON.parse(fs.readFileSync(path.join(sub, f), 'utf8'));
        const bodies = wf.nodes.map(n => n.parameters?.jsonBody).filter(Boolean);
        const codes = wf.nodes.map(n => n.parameters?.jsCode).filter(Boolean);
        const sheets = wf.nodes.map(n => n.parameters?.sheetName?.value).filter(Boolean);
        check(`F4 ${lang}/${f}: lang '${lang}' en la llamada a Nokfi`, bodies.length > 0 && bodies.every(b => b.includes(`lang: '${lang}'`)), bodies);
        let compiles = true;
        for (const c of codes) { try { new AsyncFn('$input', '$json', c); } catch (e) { compiles = false; } }
        check(`F4 ${lang}/${f}: el código de los nodos sigue siendo JS válido`, compiles);
        // Los campos de la API no se traducen (inv.file_name, inv.checks…).
        check(`F4 ${lang}/${f}: lee los mismos campos de la API`, codes.every(c => !/inv\./.test(c) || /inv\.file_name|inv\.checks|x\.checks/.test(c)));
        if (lang !== 'es') {
          const txt = [...codes, ...bodies, ...sheets].join('\n');
          const left = ES_LEFT.filter(re => re.test(txt)).map(String);
          check(`F4 ${lang}/${f}: columnas, hoja y textos del código traducidos`, left.length === 0 && !sheets.some(s => ['Facturas', 'Caja'].includes(s)), left.concat(sheets));
        }
      }
    }
  }

  /* ── F7: capturas «narrow» del manifest ── */
  const mf = JSON.parse(fs.readFileSync(path.join(DIST, 'manifest.webmanifest'), 'utf8'));
  const narrow = (mf.screenshots || []).filter(s => s.form_factor === 'narrow');

  /* ── F8 (sin navegador): demo-account sigue a DEMO_WEB_PORT ── */
  if (want('F8')) check('F8 demo-account: ALLOWED_ORIGINS sigue a DEMO_WEB_PORT', process.env.ALLOWED_ORIGINS === `http://localhost:${DEMO_WEB}`, process.env.ALLOWED_ORIGINS);

  const needBrowser = ['F1', 'F2', 'F3', 'F5', 'F7', 'F8'].some(want);
  if (!needBrowser) return;

  const demo = await prepareDemo();
  const { token, webUrl } = demo;
  const server = webServer();
  const { chromium } = require(PW);
  const browser = await chromium.launch({ executablePath: CHROME });
  const base = `http://localhost:${WEB}`;
  const mk = async ({ tk = null, lang = 'es', theme = 'dark', vp = { width: 390, height: 844 }, mobile = true, reduce = 'reduce' } = {}) => {
    const ctx = await browser.newContext({ viewport: vp, locale: 'es-ES', timezoneId: 'Europe/Madrid', reducedMotion: reduce, ...(mobile ? { isMobile: true, hasTouch: true } : {}) });
    await ctx.addInitScript(([t, l, th]) => {
      try {
        if (t) sessionStorage.setItem('nokfi_session_token', t);
        localStorage.setItem('nokfi_lang', l); localStorage.setItem('nokfi_theme', th);
        localStorage.setItem('nokfi.news.2026-10-invoicing', '1');
      } catch { /* nada */ }
    }, [tk, lang, theme]);
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    // El 404 de /sw.js es del servidor de prueba (sin service worker), no de la página.
    page.on('console', m => { if (m.type() === 'error' && !/bad HTTP response code \(404\) was received when fetching the script/.test(m.text())) errors.push(m.text()); if (DEBUG && m.type() === 'error') console.log('  CONSOLE', m.text().slice(0, 200)); });
    return { ctx, page, errors };
  };
  const settle = async (page) => {
    await page.waitForFunction(() => document.querySelector('#root')?.innerText.trim().length > 20 && !document.querySelector('.animate-spin,.skeleton,[aria-busy=true]'), null, { timeout: 8000 }).catch(() => {});
    await page.addStyleTag({ content: '*,*::before,*::after{animation-duration:0s!important;animation-delay:0s!important;transition-duration:0s!important}' }).catch(() => {});
    await wait(300);
  };

  try {
    /* ── F1: OnboardingModal retiene el foco (cuenta nueva sin onboarding) ── */
    if (want('F1') || want('F8')) {
      const admin = 'f'.repeat(64);
      const lic = await api('POST', '/api/admin/licenses', { email: 'nueva@nokfi.local', plan: 'pro', password: 'Ejemplo-Nueva-2026!' }, admin);
      const login = await api('POST', '/api/auth/login', { email: 'nueva@nokfi.local', license_key: lic.data.key, password: 'Ejemplo-Nueva-2026!' });
      const tk2 = login.data.token;
      // Por la web de la propia demo (DEMO_WEB_PORT): sin tocar ALLOWED_ORIGINS, el PUT del perfil tiene que pasar el CORS.
      for (const mobile of [true, false]) { // el de escritorio, el último: «Omitir» lo cierra para siempre
        const { ctx, page } = await mk({ tk: tk2, vp: mobile ? { width: 390, height: 844 } : { width: 1280, height: 800 }, mobile });
        await page.goto(`${webUrl}/app/home`, { waitUntil: 'networkidle' });
        const dlg = page.locator('[role=dialog][aria-labelledby="onboarding-title"]');
        const shown = await dlg.waitFor({ state: 'visible', timeout: 8000 }).then(() => true).catch(() => false);
        check(`F1 ${mobile ? 'móvil' : 'escritorio'}: aparece el onboarding`, shown);
        if (!shown) { await ctx.close(); continue; }
        await wait(300);
        check(`F1 ${mobile ? 'móvil' : 'escritorio'}: el foco empieza dentro del diálogo`, await page.evaluate(focusInDialog));
        const out = [];
        for (let i = 0; i < 40; i++) { await page.keyboard.press('Tab'); if (!(await page.evaluate(focusInDialog))) out.push(`Tab ${i + 1}`); }
        for (let i = 0; i < 15; i++) { await page.keyboard.press('Shift+Tab'); if (!(await page.evaluate(focusInDialog))) out.push(`Shift+Tab ${i + 1}`); }
        check(`F1 ${mobile ? 'móvil' : 'escritorio'}: Tab ×40 y Shift+Tab ×15 no salen del onboarding`, out.length === 0, out.slice(0, 8));
        if (!mobile && want('F8')) {
          // «Omitir por ahora» guarda el perfil (PUT /api/profile): con el CORS mal, falla y el modal no se cierra.
          const resp = page.waitForResponse(r => r.url().includes('/api/profile') && r.request().method() === 'PUT', { timeout: 8000 }).catch(() => null);
          await dlg.getByRole('button').filter({ hasText: /omitir/i }).first().click();
          const r = await resp;
          check('F8 demo-account con DEMO_WEB_PORT propio: el PUT del navegador pasa el CORS', !!r && r.status() === 200, r && r.status());
        }
        await ctx.close();
      }
    }

    /* ── F2: landing sin desbordes y táctiles ≥ 40 px; animaciones intactas ── */
    if (want('F2')) {
      const CFGS = [{ n: 'm360', vp: { width: 360, height: 800 }, mobile: true }, { n: 'm390', vp: { width: 390, height: 844 }, mobile: true }, { n: 'd1366', vp: { width: 1366, height: 768 }, mobile: false }];
      for (const cfg of CFGS) {
        for (const lang of ['es', 'en', 'fr', 'de', 'it', 'pl']) {
          const { ctx, page } = await mk({ lang, vp: cfg.vp, mobile: cfg.mobile });
          await page.goto(`${base}${lang === 'en' ? '/en' : '/home'}`, { waitUntil: 'networkidle' });
          await settle(page);
          // Que las tarjetas «reveal» se vean (con movimiento reducido ya lo están) y las FAQ abiertas también cuenten.
          await page.evaluate(() => document.querySelectorAll('#faq details').forEach(d => { d.open = true; }));
          await wait(100);
          const tag = `F2 ${cfg.n} ${lang}`;
          const r = await page.evaluate(audit, { mobile: cfg.mobile });
          check(`${tag}: /home sin scroll horizontal`, r.hScroll <= 0, r.hScroll);
          check(`${tag}: /home sin texto que se salga de su caja (KPI, cifras, FAQ…)`, r.spill.length === 0, r.spill);
          if (cfg.mobile) {
            const faq = await page.evaluate(audit, { mobile: true, scopeSel: '#faq' });
            check(`${tag}: FAQ de la landing ≥ 40×40`, faq.small.length === 0, faq.small);
            const foot = await page.evaluate(audit, { mobile: true, scopeSel: 'footer' });
            check(`${tag}: pie y selector de idioma ≥ 40×40`, foot.small.length === 0, foot.small);
          } else {
            // En escritorio el pie no cambia (enlaces de una línea, 24 px de alto).
            const h = await page.$$eval('footer nav a', as => Math.max(...as.map(a => a.getBoundingClientRect().height)));
            check(`${tag}: el pie en escritorio sigue compacto`, h < 30, h);
          }
          await ctx.close();
        }
      }
      // Animaciones de la landing: siguen con movimiento normal (no se quitan).
      const { ctx, page } = await mk({ lang: 'es', vp: { width: 390, height: 844 }, reduce: 'no-preference' });
      await page.goto(`${base}/home`, { waitUntil: 'networkidle' });
      const anim = await page.evaluate(() => {
        const rv = document.querySelector('.reveal');
        const en = document.querySelector('.anim-enter');
        return { reveal: rv ? getComputedStyle(rv).transitionDuration : null, enter: en ? getComputedStyle(en).animationName : null };
      });
      check('F2 animaciones de la landing intactas (reveal con transición y entrada con animación)', !!anim.reveal && anim.reveal !== '0s' && !!anim.enter && anim.enter !== 'none', anim);
      await ctx.close();
      // Páginas SEO con el mismo pie (calculadora) en de y pl: sin desbordes en el pie.
      for (const lang of ['de', 'pl']) {
        const { ctx: c2, page: p2 } = await mk({ lang, vp: { width: 360, height: 800 } });
        await p2.goto(`${base}/calculadora-iva`, { waitUntil: 'networkidle' });
        await settle(p2);
        const foot = await p2.evaluate(audit, { mobile: true, scopeSel: 'footer' });
        check(`F2 m360 ${lang}: pie de /calculadora-iva sin desbordes y ≥ 40×40`, foot.spill.length === 0 && foot.small.length === 0, foot);
        await c2.close();
      }
    }

    /* ── F3: VERI*FACTU y detalle de factura en el móvil ── */
    if (want('F3')) {
      const st = await api('PUT', '/api/invoicing/settings', { legal_name: 'Taller García', tax_id: '12345678Z', address: 'Calle Mayor 1', postal_code: '41001', city: 'Sevilla', payment_terms_days: 30 }, token);
      const inv = await api('POST', '/api/invoicing/invoices', { customer: { name: 'Cooperativa Agrícola y Ganadera del Valle del Guadalquivir', tax_id: 'F11223344', address: 'Carretera N-IV km 512', postal_code: '41400', city: 'Écija' },
        irpf_rate: 15, lines: [{ description: 'Reparación completa del sistema hidráulico del tractor John Deere 6155R incluyendo latiguillos', quantity: 12.5, unit: 'h', unit_price: 45, vat_rate: 21, discount_pct: 5 },
          { description: 'Kit de juntas', quantity: 2, unit_price: 1234.56, vat_rate: 21 }] }, token);
      check('F3 preparación: datos de facturación y factura emitida', st.status === 200 && inv.status === 201, [st.status, inv.status, inv.data?.error]);
      for (const cfg of [{ n: 'm360', vp: { width: 360, height: 800 }, mobile: true }, { n: 'm390', vp: { width: 390, height: 844 }, mobile: true }, { n: 'd1366', vp: { width: 1366, height: 768 }, mobile: false }]) {
        for (const lang of ['es', 'de', 'pl']) {
          const { ctx, page } = await mk({ tk: token, lang, vp: cfg.vp, mobile: cfg.mobile });
          await page.goto(`${webUrl}/app/finanzas/facturas`, { waitUntil: 'networkidle' });
          await settle(page);
          const tag = `F3 ${cfg.n} ${lang}`;
          await page.locator('button:has(svg.lucide-shield-check)').first().click();
          await page.waitForSelector('[role=dialog] ul li button', { timeout: 8000 }).catch(() => {});
          await settle(page);
          const nums = await page.$$eval('[role=dialog] ul li > div > p:first-child > button', bs => bs.map(b => { const r = b.getBoundingClientRect(); return { t: b.textContent.trim(), w: Math.round(r.width), h: Math.round(r.height) }; }));
          check(`${tag}: el panel VERI*FACTU lista registros`, nums.length > 0);
          if (cfg.mobile) check(`${tag}: números de factura del panel ≥ 40 px de alto (no 20)`, nums.length > 0 && nums.every(n => n.h >= 39.5 && n.w >= 39.5), nums);
          else check(`${tag}: en escritorio el número no crece (≤ 32 px)`, nums.every(n => n.h <= 32), nums);
          // Abrir la factura desde el panel → detalle.
          await page.locator('[role=dialog] ul li > div > p:first-child > button').first().click();
          await page.waitForSelector('[role=dialog] table, [role=dialog] [data-lines=mobile]', { timeout: 8000 }).catch(() => {});
          await settle(page);
          const d = await page.evaluate(() => {
            const dlg = [...document.querySelectorAll('[role=dialog]')].pop();
            const scrollers = [...dlg.querySelectorAll('*')].filter(e => { const cs = getComputedStyle(e); return /(auto|scroll)/.test(cs.overflowX) && e.scrollWidth > e.clientWidth + 1 && e.getBoundingClientRect().width > 0; });
            const list = dlg.querySelector('[data-lines=mobile]');
            const table = dlg.querySelector('table');
            const shown = (el) => !!el && el.getBoundingClientRect().height > 0;
            return { scrollers: scrollers.map(e => e.className.slice(0, 60)), list: shown(list), items: list ? list.querySelectorAll('li').length : 0, table: shown(table), dlgScroll: dlg.scrollWidth - dlg.clientWidth };
          });
          if (cfg.mobile) check(`${tag}: conceptos del detalle en bloques, sin scroll horizontal dentro del modal`, d.list && !d.table && d.items === 2 && d.scrollers.length === 0, d);
          else check(`${tag}: en escritorio sigue la tabla de conceptos`, d.table && !d.list && d.scrollers.length === 0, d);
          await ctx.close();
        }
      }
    }

    /* ── F5: calculadora de IVA con menos JS ── */
    if (want('F5')) {
      const measure = async (url, lang) => {
        const { ctx, page, errors } = await mk({ lang, vp: { width: 390, height: 844 } });
        const js = [];
        page.on('requestfinished', (r) => {
          const u = new URL(r.url());
          if (u.port === String(WEB) && u.pathname.endsWith('.js')) {
            const f = path.join(DIST, u.pathname);
            if (fs.existsSync(f)) js.push({ p: u.pathname, gz: zlib.gzipSync(fs.readFileSync(f)).length });
          }
        });
        await page.goto(`${base}${url}`, { waitUntil: 'networkidle' });
        await wait(800);
        const info = await page.evaluate(() => ({ h1: document.querySelector('h1')?.textContent || '', lang: document.documentElement.lang, inputs: document.querySelectorAll('main input').length }));
        // ¿Responde? (hidratado): cambiar la cantidad y ver otro resultado.
        const before = await page.evaluate(() => document.querySelector('main')?.innerText || '');
        const inp = page.locator('main input[inputmode=decimal], main input[type=number], main input[type=text]').first();
        if (await inp.count()) { await inp.fill('1234'); await wait(300); }
        const after = await page.evaluate(() => document.querySelector('main')?.innerText || '');
        await ctx.close();
        return { js, kb: Math.round(js.reduce((s, x) => s + x.gz, 0) / 1024), info, live: before !== after, errors };
      };
      const es = await measure('/calculadora-iva', 'es');
      if (DEBUG) console.log(es.js);
      check('F5 /calculadora-iva (es): JS ≤ 170 KB gzip (antes ~204 KB)', es.kb <= 170, `${es.kb} KB`);
      check('F5 /calculadora-iva (es): no descarga el diccionario ni el contenido público en inglés', !es.js.some(x => /\/en-[\w-]+\.js$/.test(x.p)), es.js.map(x => x.p));
      check('F5 /calculadora-iva (es): castellano, con calculadora y viva tras hidratar, sin errores', es.info.lang === 'es' && /IVA/.test(es.info.h1) && es.info.inputs > 0 && es.live && es.errors.length === 0, { ...es.info, live: es.live, errors: es.errors });
      const en = await measure('/en/spain-vat-calculator', 'es');
      check('F5 /en/spain-vat-calculator: en inglés, viva y sin errores', en.info.lang === 'en' && /VAT/.test(en.info.h1) && en.live && en.errors.length === 0, { ...en.info, live: en.live, errors: en.errors });
      const fr = await measure('/home', 'fr');
      check('F5 /home con idioma fr: se pinta en francés y sin errores', fr.info.lang === 'fr' && fr.errors.length === 0, { ...fr.info, errors: fr.errors });
      // Cambio de idioma en la propia calculadora (es → en) sin recargar.
      const { ctx, page, errors } = await mk({ lang: 'es', vp: { width: 1366, height: 768 }, mobile: false });
      await page.goto(`${base}/calculadora-iva`, { waitUntil: 'networkidle' });
      await page.locator('header select').selectOption('en');
      const ok = await page.waitForFunction(() => location.pathname === '/en/spain-vat-calculator' && /VAT/.test(document.querySelector('h1')?.textContent || ''), null, { timeout: 8000 }).then(() => true).catch(() => false);
      check('F5 cambiar a inglés desde la calculadora carga su contenido', ok && errors.length === 0, errors);
      await ctx.close();
    }

    /* ── F7: manifest con capturas «narrow» reales ── */
    if (want('F7')) {
      const { ctx, page } = await mk();
      await page.goto(`${base}/home`, { waitUntil: 'load' });
      const dims = [];
      for (const s of narrow) {
        const d = await page.evaluate(async (src) => { const i = new Image(); i.src = src; try { await i.decode(); return `${i.naturalWidth}x${i.naturalHeight}`; } catch { return null; } }, s.src);
        dims.push({ src: s.src, sizes: s.sizes, real: d });
      }
      check('F7 manifest: 2 capturas «narrow» (móvil) que existen y miden lo que dice `sizes`', narrow.length >= 2 && dims.every(d => d.real === d.sizes) && narrow.every(s => s.label && s.type === 'image/webp'), dims);
      const [w, h] = (narrow[0]?.sizes || '0x0').split('x').map(Number);
      check('F7 manifest: proporción de móvil (alto > ancho, ≤ 2,3)', h > w && h / w <= 2.3, narrow[0]?.sizes);
      await ctx.close();
    }

    /* ── F8: landing-screens.js genera los WebP de la landing ── */
    if (want('F8')) {
      const ls = require('../../backend/scripts/landing-screens');
      const out = fs.mkdtempSync(path.join(os.tmpdir(), 'nokfi-webp-'));
      const big = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1.5 });
      const bp = await big.newPage();
      await bp.goto(`${base}/home`, { waitUntil: 'networkidle' });
      const png15 = await bp.screenshot({ type: 'png' });
      await big.close();
      const files = typeof ls.writeWebps === 'function' ? await ls.writeWebps(browser, png15, path.join(out, 'inicio-dark')) : [];
      const m = fs.readFileSync(path.join(ROOT, 'src/pages/Landing.jsx'), 'utf8').match(/SHOT_WIDTHS\s*=\s*\[([^\]]+)\]/);
      const landingSizes = m ? m[1].split(',').map(x => Number(x.trim())) : [];
      const names = files.map(f => path.basename(f.file));
      const real = [];
      const { ctx: c3, page: p3 } = await mk();
      for (const f of files) real.push(await p3.evaluate(async (b64) => { const i = new Image(); i.src = `data:image/webp;base64,${b64}`; await i.decode(); return `${i.naturalWidth}x${i.naturalHeight}`; }, fs.readFileSync(f.file).toString('base64')));
      await c3.close();
      check('F8 landing-screens.js: writeWebps genera <pantalla>-<tema>-{640,960,1280,1920}.webp (nombres de la landing)',
        JSON.stringify(names) === JSON.stringify(landingSizes.map(w => `inicio-dark-${w}.webp`)) && landingSizes.length === 4, { names, landingSizes });
      check('F8 landing-screens.js: tamaños como los de public/screens (640×400 … 1920×1200)', JSON.stringify(real) === JSON.stringify(['640x400', '960x600', '1280x800', '1920x1200']), real);
      fs.rmSync(out, { recursive: true, force: true });
    }
  } finally {
    await browser.close();
    server.close();
    demo.close();
  }
}

main().then(() => {
  console.log(fail ? `\n${fail} comprobaciones fallidas` : '\nTodo OK');
  process.exit(fail ? 1 : 0);
}).catch((e) => { console.error('FATAL', e); process.exit(1); });
