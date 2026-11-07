/**
 * S15b · lote 6 (visual y móvil): comprobación en el navegador con la cuenta de
 * ejemplo («Taller García», backend local con BD temporal, sin IA ni Stripe).
 *   V1  editor de facturas (nueva, duplicar, rectificar) sin salirse de la tarjeta a 390/360/768/1366
 *   V2  cuestionario a 768: la pregunta tiene sitio (no 58 px)
 *   V3  conceptos 2.º+ con etiquetas en el móvil; pie del detalle de factura agrupado
 *   V4  sin red y con 429 en /api/auth/verify: aviso «sin conexión» con «Reintentar» (no spinner infinito)
 *   V5  sin texto que se salga en Calendario, Previsión, Inicio, Calculadoras y la barra inferior (es/en/fr/de/pl)
 *   V6  objetivos táctiles ≥ 40 px en el móvil (pestañas, botones pequeños, FAQ…)
 *   V7  manifest PWA (lang, id, icono maskable propio) y plantillas n8n traducidas
 *   V8  el botón del asistente se aparta al desplazar hacia abajo en el móvil
 * En todas las pantallas citadas: sin scroll horizontal a 390/360/768/1366.
 * Uso: VITE_API_URL=/api npx vite build && node test/s15b-visual.e2e.cjs
 *      (el dist tiene que llamar a /api del mismo origen; DEBUG=1 enseña los detalles)
 */
'use strict';

const fs = require('fs');
const path = require('path');
const http = require('http');

process.env.DEMO_PORT = process.env.DEMO_PORT || '4181';
process.env.DEMO_WEB_PORT = process.env.DEMO_WEB_PORT || '4182';
const PORT = Number(process.env.DEMO_PORT), WEB = Number(process.env.DEMO_WEB_PORT);
const { prepareDemo, CHROME, wait } = require('../../backend/scripts/demo-account');
process.env.ALLOWED_ORIGINS = `http://localhost:${WEB}`; // el proxy reenvía el Origin del navegador
const { chromium } = require('/home/mario/Escritorio/Proyectos/n8n-nodes-nokfi/node_modules/playwright-core');
const DIST = path.join(__dirname, '../dist');
const DEBUG = !!process.env.DEBUG;

function api(method, p, body, token) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req = http.request({ host: 'localhost', port: PORT, path: p, method, headers: {
      'Content-Type': 'application/json', ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}) } }, (res) => {
      let b = ''; res.on('data', d => { b += d; }); res.on('end', () => { try { resolve({ status: res.statusCode, data: JSON.parse(b) }); } catch { resolve({ status: res.statusCode, data: b }); } });
    });
    req.on('error', reject); if (data) req.write(data); req.end();
  });
}

/** Facturas con textos largos (las mismas que usó la QA del sub 6). */
async function seedInvoices(token) {
  const st = await api('PUT', '/api/invoicing/settings', { legal_name: 'Taller Mecánico García Hermanos e Hijos, Sociedad Limitada Unipersonal', tax_id: 'B12345674',
    address: 'Polígono Industrial Las Arenas, Calle de los Talleres Mecánicos 128, nave 14', postal_code: '41001', city: 'Sevilla', iban: 'ES91 2100 0418 4502 0005 1332', payment_terms_days: 30, email: 'facturacion.taller-garcia@ejemplo-largo.example' }, token);
  if (st.status !== 200) throw new Error('Datos de facturación: ' + JSON.stringify(st.data).slice(0, 200));
  const r = await api('POST', '/api/invoicing/invoices', { customer: { name: 'Cooperativa Agrícola y Ganadera del Valle del Guadalquivir, Sociedad Cooperativa Andaluza', tax_id: 'F11223344', email: 'administracion.cooperativa@valle-guadalquivir.example', address: 'Carretera Nacional IV km 512', postal_code: '41400', city: 'Écija' },
    irpf_rate: 15, lines: [{ description: 'Reparación completa del sistema hidráulico del tractor John Deere 6155R incluyendo sustitución de latiguillos', quantity: 12.5, unit: 'h', unit_price: 45, vat_rate: 21 },
      { description: 'Kit de juntas', quantity: 2, unit_price: 1234.56, vat_rate: 21 }, { description: 'Manual técnico', quantity: 1, unit_price: 15, vat_rate: 4 }] }, token);
  if (r.status !== 201) throw new Error('Factura: ' + JSON.stringify(r.data).slice(0, 200));
  return r.data.id;
}

/* Medición dentro de la página (versión reducida de la QA del sub 6). */
function audit({ mobile }) {
  const vw = window.innerWidth;
  const desc = (el) => {
    let s = el.tagName.toLowerCase();
    if (el.id) s += '#' + el.id;
    const c = (typeof el.className === 'string' ? el.className : '').trim().split(/\s+/).filter(Boolean).slice(0, 3).join('.');
    if (c) s += '.' + c;
    const txt = (el.innerText || el.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ').slice(0, 40);
    return txt ? `${s} «${txt}»` : s;
  };
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return false;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) === 0) return false;
    return !el.closest('[aria-hidden="true"],[inert],.sr-only');
  };
  const inFixed = (el) => { for (let e = el; e && e !== document.body; e = e.parentElement) { const p = getComputedStyle(e).position; if (p === 'fixed' || p === 'sticky') return e; } return null; };
  const clippedBy = (el) => { for (let e = el.parentElement; e && e !== document.body && e !== document.documentElement; e = e.parentElement) if (getComputedStyle(e).overflowX !== 'visible') return e; return null; };
  const res = { hScroll: document.documentElement.scrollWidth - vw, offenders: [], spill: [], small: [] };
  const vis = [...document.body.querySelectorAll('*')].filter(el => !(el instanceof SVGElement) && !['SCRIPT', 'STYLE', 'BR'].includes(el.tagName)).filter(visible);
  const off = new Set();
  for (const el of vis) {
    const r = el.getBoundingClientRect();
    if (!(r.right > vw + 1 || r.left < -1)) continue;
    if ((r.left >= vw || r.right <= 0) && inFixed(el)) continue;
    const clip = clippedBy(el);
    if (clip) { const cr = clip.getBoundingClientRect(); if (cr.right <= vw + 1 && cr.left >= -1) continue; }
    off.add(el);
  }
  for (const el of off) if (!off.has(el.parentElement)) res.offenders.push(desc(el));
  // Texto que no cabe en su caja (se sale o queda cortado sin «…»).
  for (const el of vis) {
    if (![...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim().length > 1)) continue;
    const cs = getComputedStyle(el);
    if (cs.display === 'inline' || cs.textOverflow === 'ellipsis' || el.clientWidth === 0) continue;
    if (el.scrollWidth - el.clientWidth > 2) res.spill.push(`${desc(el)} [+${el.scrollWidth - el.clientWidth}px]`);
  }
  // Objetivos táctiles (solo móvil): todo lo pulsable del contenido, de la barra inferior y del modal abierto.
  if (mobile) {
    const dlg = [...document.querySelectorAll('[role=dialog]')].filter(visible).pop();
    const scope = dlg || document.body;
    for (const el of vis.filter(e => scope.contains(e) && e.matches('a[href],button,input:not([type=hidden]),select,textarea,[role=button],[role=tab],[role=radio],summary'))) {
      let t = el;
      if (el.matches('input[type=checkbox],input[type=radio]')) { const l = el.closest('label'); if (l) t = l; }
      // Enlaces dentro de un párrafo: no son objetivos sueltos (WCAG 2.5.8, excepción «en línea»).
      if (el.tagName === 'A' && getComputedStyle(el).display === 'inline') continue;
      const r = t.getBoundingClientRect();
      if (r.width < 40 - 0.5 || r.height < 40 - 0.5) res.small.push(`${desc(el)} ${Math.round(r.width)}×${Math.round(r.height)}`);
    }
  }
  for (const k of ['offenders', 'spill', 'small']) res[k] = [...new Set(res[k])];
  return res;
}

const CONFIGS = [
  { name: 'm390', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 },
  { name: 'm360', viewport: { width: 360, height: 800 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 },
  { name: 't768', viewport: { width: 768, height: 1024 }, isMobile: false, hasTouch: false, deviceScaleFactor: 1 },
  { name: 'd1366', viewport: { width: 1366, height: 768 }, isMobile: false, hasTouch: false, deviceScaleFactor: 1 }
];
const LANGS = (process.env.LANGS || 'es,en,fr,de,pl').split(',');

let fail = 0;
const fails = [];
const check = (label, ok, detail) => {
  if (ok) { if (DEBUG) console.log('✅', label); return; }
  fail++; fails.push(label);
  console.log('❌', label, detail ? `\n     ${String(detail).slice(0, 1500)}` : '');
};

async function newPage(browser, cfg, token, lang, opts = {}) {
  const ctx = await browser.newContext({ viewport: cfg.viewport, isMobile: cfg.isMobile, hasTouch: cfg.hasTouch, deviceScaleFactor: cfg.deviceScaleFactor, locale: 'es-ES', timezoneId: 'Europe/Madrid', reducedMotion: opts.reducedMotion || 'reduce' });
  await ctx.addInitScript(([tk, lg]) => { try { if (tk) sessionStorage.setItem('nokfi_session_token', tk); localStorage.setItem('nokfi_lang', lg); } catch { /* nada */ } }, [token, lang]);
  const page = await ctx.newPage();
  if (DEBUG) page.on('pageerror', e => console.log('PAGEERR', e.message));
  return { ctx, page };
}

async function settle(page) {
  await page.waitForFunction(() => document.querySelector('#root')?.innerText.trim().length > 20 && !document.querySelector('.animate-spin,.skeleton,[aria-busy=true]'), null, { timeout: 6000 }).catch(() => {});
  await page.addStyleTag({ content: '*,*::before,*::after{animation-duration:0s!important;animation-delay:0s!important;transition-duration:0s!important}' }).catch(() => {});
  await wait(250);
}

async function main() {
  if (!fs.existsSync(path.join(DIST, 'index.html'))) throw new Error('Falta frontend/dist: ejecuta VITE_API_URL=/api npx vite build');
  const { token, webUrl, close } = await prepareDemo();
  const inv = await seedInvoices(token);
  const browser = await chromium.launch({ executablePath: CHROME });
  const only = process.env.ONLY || '';
  try {
    /* ── Pantallas: sin scroll horizontal, sin desbordes de texto y táctiles ≥ 40 px ── */
    const PAGES = [
      { p: '/app/finanzas/facturas/nueva', id: 'V1' },
      { p: `/app/finanzas/facturas/nueva?from=${inv}`, id: 'V1' },
      { p: `/app/finanzas/facturas/nueva?rectify=${inv}`, id: 'V1' },
      { p: '/app/cuestionario', id: 'V2' },
      { p: `/app/finanzas/facturas?open=${inv}`, id: 'V3' },
      { p: '/app/finanzas/facturas', id: 'V6' },
      { p: '/app/finanzas/calendario', id: 'V5' },
      { p: '/app/finanzas/prevision', id: 'V5' },
      { p: '/app/home', id: 'V5' },
      { p: '/app/calculadoras', id: 'V5' },
      { p: '/app/dev', id: 'V5' },
      { p: '/app/ayuda', id: 'V6' }
    ].filter(x => !only || only.split(',').includes(x.id));
    for (const cfg of CONFIGS.filter(c => !process.env.CFGS || process.env.CFGS.split(',').includes(c.name))) {
      for (const lang of LANGS) {
        const { ctx, page } = await newPage(browser, cfg, token, lang);
        for (const { p, id } of PAGES) {
          await page.goto(`${webUrl}${p}`, { waitUntil: 'load' });
          await settle(page);
          const r = await page.evaluate(audit, { mobile: cfg.isMobile });
          const tag = `${id} ${cfg.name} ${lang} ${p}`;
          check(`${tag}: sin scroll horizontal ni elementos fuera`, r.hScroll <= 0 && !r.offenders.length, `hScroll=${r.hScroll} ${r.offenders.join(' | ')}`);
          check(`${tag}: ningún texto se sale de su caja`, !r.spill.length, r.spill.join(' | '));
          if (cfg.isMobile) check(`${tag}: objetivos táctiles ≥ 40 px`, !r.small.length, r.small.slice(0, 30).join(' | '));
          if (p.includes('/nueva')) {
            const w = await page.locator('#ie-d0').evaluate(el => el.getBoundingClientRect().width).catch(() => 0);
            check(`${tag}: la descripción del concepto tiene sitio (${Math.round(w)} px)`, w >= 150);
          }
          if (p === '/app/cuestionario') {
            const w = await page.locator('ol.card li p[id^="q-"]').first().evaluate(el => el.getBoundingClientRect().width).catch(() => 0);
            check(`${tag}: la pregunta tiene sitio (${Math.round(w)} px)`, w >= 200);
          }
          if (p === '/app/dev' && cfg.isMobile) {
            const cut = await page.$$eval('.bottom-nav-item > span', els => els.filter(e => e.scrollWidth > e.clientWidth + 1).map(e => e.textContent));
            check(`${tag}: etiquetas de la barra inferior enteras`, !cut.length, cut.join(', '));
          }
          if (p.includes('?open=') && cfg.isMobile) {
            const h = await page.locator('[role=dialog] button[aria-haspopup=menu]').evaluate(b => { const f = b.closest('.grid')?.parentElement; return f ? f.getBoundingClientRect().height : 999; }).catch(() => 999);
            check(`${tag}: pie del detalle de factura agrupado (${Math.round(h)} px, antes ~260)`, h <= 190);
          }
          if (p === '/app/finanzas/facturas/nueva' && cfg.isMobile) {
            await page.locator('button:has(svg.lucide-plus)').last().click();
            await wait(200);
            const labels = await page.$$eval('label[for="ie-q1"],label[for="ie-p1"],label[for="ie-ds1"],label[for="ie-v1"]', ls => ls.map(l => (l.getBoundingClientRect().height > 0 ? l.textContent.trim() : '')));
            check(`${tag}: el 2.º concepto tiene sus etiquetas a la vista (${labels.join(' / ')})`, labels.length === 4 && labels.every(Boolean));
          }
        }
        await ctx.close();
      }
    }

    if (!only || only.split(',').includes('V1')) {
      // En escritorio ancho (fila de tabla), las etiquetas del 2.º concepto se ocultan: una cabecera basta.
      const { ctx, page } = await newPage(browser, CONFIGS[3], token, 'es');
      await page.goto(`${webUrl}/app/finanzas/facturas/nueva?from=${inv}`, { waitUntil: 'load' });
      await settle(page);
      const shown = await page.$$eval('label[for="ie-q1"]', ls => ls.map(l => l.getBoundingClientRect().height));
      check('V1 d1366: fila de tabla con una sola cabecera de etiquetas', shown.length === 1 && shown[0] === 0);
      await ctx.close();
    }

    /* ── V4: sin red y con 429 en verify → aviso con «Reintentar», no un spinner sin fin ── */
    if (!only || only.split(',').includes('V4')) {
      for (const [label, handler] of [
        ['sin red', (route) => route.abort('internetdisconnected')],
        ['429 en /api/auth/verify', (route) => route.fulfill({ status: 429, contentType: 'application/json', body: '{"error":"rate_limited"}' })]
      ]) {
        const { ctx, page } = await newPage(browser, CONFIGS[0], token, 'es');
        await page.route('**/api/auth/verify', handler);
        await page.goto(`${webUrl}/app/home`, { waitUntil: 'load' });
        const alert = page.locator('[role=alert]:has(button)');
        const shown = await alert.waitFor({ state: 'visible', timeout: 8000 }).then(() => true).catch(() => false);
        check(`V4 ${label}: aviso con «Reintentar» en vez del spinner`, shown && !(await page.locator('.animate-spin').count()));
        await page.unroute('**/api/auth/verify');
        if (shown) await alert.locator('button').click();
        const back = await page.waitForFunction(() => /\/app\/home/.test(location.pathname) && !document.querySelector('[role=alert] button') && document.querySelector('.app-main')?.innerText.length > 50, null, { timeout: 8000 }).then(() => true).catch(() => false);
        check(`V4 ${label}: «Reintentar» vuelve a entrar cuando hay respuesta`, back);
        await ctx.close();
      }
    }

    /* ── V8: el botón del asistente se aparta al bajar y vuelve al subir (móvil) ── */
    if (!only || only.split(',').includes('V8')) {
      const { ctx, page } = await newPage(browser, CONFIGS[0], token, 'es');
      await page.goto(`${webUrl}/app/home`, { waitUntil: 'load' });
      await settle(page);
      const state = () => page.locator('.chat-launcher').evaluate(b => { const r = b.getBoundingClientRect(); const cs = getComputedStyle(b); return { hidden: r.top >= window.innerHeight - 10 || Number(cs.opacity) === 0, pe: cs.pointerEvents }; });
      const canScroll = await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight > 300);
      check('V8 preparación: la página se puede desplazar', canScroll);
      check('V8 visible al entrar', !(await state()).hidden);
      await page.mouse.wheel(0, 250); await wait(400);
      const down = await state();
      check('V8 se aparta al desplazar hacia abajo (no tapa importes)', down.hidden && down.pe === 'none');
      await page.mouse.wheel(0, -150); await wait(400);
      check('V8 vuelve al subir', !(await state()).hidden);
      await ctx.close();
    }

    /* ── V7: manifest PWA y plantillas n8n traducidas ── */
    if (!only || only.split(',').includes('V7')) {
      const mf = JSON.parse(fs.readFileSync(path.join(DIST, 'manifest.webmanifest'), 'utf8'));
      check('V7 manifest: lang es (nombre y descripción en castellano)', mf.lang === 'es' && /Análisis/.test(mf.name));
      check('V7 manifest: id fijo (= start_url)', mf.id === '/app/home' && mf.start_url === '/app/home');
      const mask = mf.icons.filter(i => i.purpose === 'maskable');
      const plain = new Set(mf.icons.filter(i => i.purpose !== 'maskable').map(i => i.src));
      check('V7 manifest: icono maskable propio, distinto del normal', mask.length > 0 && mask.every(i => !plain.has(i.src) && fs.existsSync(path.join(DIST, i.src))));
      check('V7 manifest: capturas reales que existen', Array.isArray(mf.screenshots) && mf.screenshots.length > 0 && mf.screenshots.every(s => fs.existsSync(path.join(DIST, s.src))));
      const ES = new Set();
      const tplDir = path.join(DIST, 'templates/n8n');
      const files = fs.readdirSync(tplDir).filter(f => f.endsWith('.json'));
      for (const f of files) for (const n of JSON.parse(fs.readFileSync(path.join(tplDir, f), 'utf8')).nodes) ES.add(n.name);
      for (const lang of ['en', 'fr', 'de', 'it', 'pl']) {
        for (const f of files) {
          const p = path.join(tplDir, lang, f);
          const wf = fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : null;
          const names = wf ? wf.nodes.map(n => n.name) : [];
          const linked = wf && Object.entries(wf.connections).every(([from, c]) => names.includes(from) && c.main.flat().every(x => names.includes(x.node)));
          check(`V7 plantilla n8n ${lang}/${f}: nodos traducidos y conexiones coherentes`, !!wf && linked && !names.some(n => ES.has(n)), names.join(' | '));
        }
        const { ctx, page } = await newPage(browser, CONFIGS[3], token, lang);
        await page.goto(`${webUrl}/app/dev/plantillas`, { waitUntil: 'load' });
        await page.waitForSelector('ol[aria-label] li', { timeout: 6000 }).catch(() => {});
        const steps = await page.$$eval('ol[aria-label] li span', s => s.map(x => x.textContent.trim()));
        const esLeft = steps.filter(s => ES.has(s));
        check(`V7 /app/dev/plantillas en ${lang}: pasos sin nombres en castellano`, steps.length > 0 && !esLeft.length, esLeft.join(', '));
        await ctx.close();
      }
    }
  } finally {
    await browser.close();
    close();
  }
  console.log(fail ? `\n❌ ${fail} comprobaciones fallan` : '\n✅ todo bien');
  process.exit(fail ? 1 : 0);
}

main().catch(e => { console.error('FATAL', e); process.exit(1); });
