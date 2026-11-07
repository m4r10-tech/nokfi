/**
 * S15b · lote 7 (accesibilidad y rendimiento): comprobación en el navegador.
 *   A1  los modales (Modal, hoja «Más», asistente en móvil) retienen el foco y lo devuelven al cerrar
 *   A2/A3 axe sin fallos serious/critical en las pantallas de la QA, en tema claro y oscuro
 *   A4  la landing solo descarga la captura que se ve (WebP), no las 8
 *   A5  «Saltar al contenido», <main> en /login, <nav> con nombre, región viva de toasts, «Cerrar» con contexto
 *   A6  la cabecera pública no cambia su contenido al hidratar en tema claro
 * Usa la cuenta de ejemplo de backend/scripts/demo-account.js (BD temporal, sin IA ni Stripe) y el
 * `dist` ya compilado. axe-core no es dependencia del proyecto: se instala aparte, fuera del repo.
 * Uso: npm i --prefix /tmp/a11y-tools axe-core@4.10.2
 *      VITE_API_URL=/api npm run build && AXE_PATH=/tmp/a11y-tools/node_modules/axe-core/axe.min.js node test/s15b-a11y.e2e.cjs
 *      (ONLY=axe|kbd|landing|misc para una parte; DEBUG=1 enseña cada pantalla)
 */
'use strict';

const fs = require('fs');
const path = require('path');
const http = require('http');

const API_PORT = Number(process.env.S15B_PORT || 4171), WEB = Number(process.env.S15B_WEB_PORT || 4173);
process.env.DEMO_PORT = String(API_PORT);
process.env.DEMO_WEB_PORT = String(Number(process.env.S15B_DEMO_WEB_PORT || 4172));
const { prepareDemo, CHROME, wait } = require('../../backend/scripts/demo-account');
process.env.ALLOWED_ORIGINS = `http://localhost:${WEB}`; // demo-account fija 4106

const ROOT = path.join(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const PW = '/home/mario/Escritorio/Proyectos/n8n-nodes-nokfi/node_modules/playwright-core';
const AXE = process.env.AXE_PATH || '/tmp/claude-1000/a11y-tools/node_modules/axe-core/axe.min.js';
const ONLY = process.env.ONLY || '';
const DEBUG = !!process.env.DEBUG;

/** Sirve el dist como Nginx (try_files $uri $uri/ /index.html) con /api al backend de ejemplo. */
function webServer() {
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.json': 'application/json', '.woff2': 'font/woff2' };
  return http.createServer((req, res) => {
    if (req.url.startsWith('/api/')) {
      const p = http.request({ host: 'localhost', port: API_PORT, path: req.url, method: req.method, headers: req.headers }, (r) => { res.writeHead(r.statusCode, r.headers); r.pipe(res); });
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

let fail = 0;
const check = (label, ok, extra) => { if (ok) console.log('✅', label); else { fail++; console.log('❌', label, extra !== undefined ? JSON.stringify(extra) : ''); } };

const PUBLIC = ['/home', '/pricing', '/login', '/recuperar', '/calculadora-iva', '/terminos', '/en/'];
const APP = ['/app/home', '/app/cuestionario', '/app/excel', '/app/finanzas/libro', '/app/finanzas/facturas', '/app/finanzas/impuestos',
  '/app/finanzas/cobros', '/app/finanzas/fugas', '/app/finanzas/prevision', '/app/finanzas/calendario', '/app/finanzas/sector',
  '/app/historial', '/app/historial/:aid', '/app/calculadoras', '/app/configuracion', '/app/ayuda', '/app/dev', '/app/dev/webhooks'];
// Reglas «moderate» que también arregla el lote (landmarks de las páginas públicas y del acceso).
const LANDMARK_RULES = ['landmark-one-main', 'region', 'landmark-unique'];

async function runAxe(page) {
  await page.addScriptTag({ path: AXE });
  return page.evaluate(async () => {
    const r = await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'] }, resultTypes: ['violations'] });
    return r.violations.map(v => ({ id: v.id, impact: v.impact, n: v.nodes.length, target: v.nodes.slice(0, 2).map(x => `${x.target.join(' ')} ${(x.any[0]?.message || '').slice(0, 90)}`) }));
  });
}

/** ¿El foco está dentro del diálogo de arriba del todo? */
const focusInTopDialog = () => {
  const dlgs = [...document.querySelectorAll('[role=dialog]')];
  const top = dlgs[dlgs.length - 1];
  const el = document.activeElement;
  return !!top && !!el && el !== document.body && top.contains(el);
};
const focusDesc = () => {
  const el = document.activeElement;
  if (!el || el === document.body) return 'BODY';
  return `${el.tagName.toLowerCase()}«${(el.getAttribute('aria-label') || el.textContent || el.id || '').trim().slice(0, 30)}»`;
};

async function tabsStayInDialog(page, n, shift) {
  const out = [];
  for (let i = 0; i < n; i++) {
    await page.keyboard.press(shift ? 'Shift+Tab' : 'Tab');
    if (!(await page.evaluate(focusInTopDialog))) out.push(`${i + 1}:${await page.evaluate(focusDesc)}`);
  }
  return out;
}

async function main() {
  if (!fs.existsSync(path.join(DIST, 'index.html'))) throw new Error('Falta frontend/dist: ejecuta VITE_API_URL=/api npm run build');
  if (!fs.existsSync(AXE)) throw new Error(`No encuentro axe-core en ${AXE} (npm i --prefix /tmp/a11y-tools axe-core@4.10.2 y AXE_PATH=…)`);
  const demo = await prepareDemo();
  const { token, aid } = demo;
  const server = webServer();
  const { chromium } = require(PW);
  const browser = await chromium.launch({ executablePath: CHROME });
  const base = `http://localhost:${WEB}`;
  const mk = async ({ auth = true, theme = 'dark', mobile = false, reduce = true, keepNews = false } = {}) => {
    const ctx = await browser.newContext({ viewport: mobile ? { width: 390, height: 844 } : { width: 1280, height: 800 }, locale: 'es-ES', timezoneId: 'Europe/Madrid',
      reducedMotion: reduce ? 'reduce' : 'no-preference', ...(mobile ? { isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : {}) });
    await ctx.addInitScript(([tk, a, th, news]) => {
      try {
        if (a) sessionStorage.setItem('nokfi_session_token', tk);
        localStorage.setItem('nokfi_lang', 'es'); localStorage.setItem('nokfi_theme', th);
        if (!news) localStorage.setItem('nokfi.news.2026-10-invoicing', '1');
      } catch { /* nada */ }
    }, [token, auth, theme, keepNews]);
    const page = await ctx.newPage();
    if (DEBUG) { page.on('console', m => { if (m.type() === 'error') console.log('  CONSOLE', m.text().slice(0, 160)); }); page.on('pageerror', e => console.log('  PAGEERR', e.message)); }
    return [ctx, page];
  };
  const go = async (page, url) => { await page.goto(base + url, { waitUntil: 'networkidle' }); await wait(700); };

  try {
    // ── A2/A3/A5: axe en claro y oscuro ──────────────────────────────────────
    if (!ONLY || ONLY === 'axe') {
      for (const theme of ['dark', 'light']) {
        const bad = [];
        const landmarks = [];
        let pages = 0;
        for (const route of [...PUBLIC, ...APP]) {
          const isPublic = !route.startsWith('/app');
          const [ctx, page] = await mk({ auth: !isPublic, theme });
          await go(page, route.replace(':aid', aid));
          const v = await runAxe(page);
          pages++;
          const serious = v.filter(x => x.impact === 'serious' || x.impact === 'critical');
          if (serious.length) bad.push({ route, v: serious });
          if (isPublic) { const lm = v.filter(x => LANDMARK_RULES.includes(x.id)); if (lm.length) landmarks.push({ route, v: lm }); }
          if (DEBUG) console.log('  ', theme, route, v.map(x => `${x.id}(${x.impact})×${x.n}`).join(' ') || 'OK');
          // Estados con capa encima: modal de apunte y asistente.
          if (route === '/app/finanzas/libro' || route === '/app/home') {
            if (route === '/app/finanzas/libro') await page.getByRole('button', { name: 'Añadir a mano' }).first().click();
            else await page.locator('.chat-launcher').click();
            await wait(600);
            const v2 = (await runAxe(page)).filter(x => x.impact === 'serious' || x.impact === 'critical');
            pages++;
            if (v2.length) bad.push({ route: `${route} (${route.includes('libro') ? 'modal' : 'asistente'})`, v: v2 });
          }
          await ctx.close();
        }
        for (const b of bad) console.log('   ', theme, b.route, JSON.stringify(b.v));
        check(`A2/A3: axe sin fallos serious/critical en ${pages} pantallas (tema ${theme === 'dark' ? 'oscuro' : 'claro'})`, bad.length === 0, bad.map(b => `${b.route}: ${b.v.map(x => `${x.id}×${x.n}`).join(',')}`));
        for (const l of landmarks) console.log('   ', theme, l.route, JSON.stringify(l.v));
        check(`A5: landmarks de las páginas públicas y del acceso (main, region, nav con nombre) en ${theme === 'dark' ? 'oscuro' : 'claro'}`, landmarks.length === 0, landmarks.map(l => `${l.route}: ${l.v.map(x => x.id).join(',')}`));
      }
    }

    // ── A1: foco retenido y devuelto ─────────────────────────────────────────
    if (!ONLY || ONLY === 'kbd') {
      {
        const [ctx, page] = await mk();
        await go(page, '/app/finanzas/libro');
        const opener = page.getByRole('button', { name: 'Añadir a mano' }).first();
        await opener.focus();
        await page.keyboard.press('Enter');
        await page.locator('[role=dialog]').waitFor();
        await wait(400);
        const outFwd = await tabsStayInDialog(page, 40, false);
        check('A1: Modal — 40 × Tab no sacan el foco del modal', outFwd.length === 0, outFwd.slice(0, 5));
        const outBack = await tabsStayInDialog(page, 15, true);
        check('A1: Modal — 15 × Shift+Tab no sacan el foco del modal', outBack.length === 0, outBack.slice(0, 5));
        await page.keyboard.press('Escape');
        await wait(300);
        const back = await page.evaluate(() => document.activeElement?.textContent?.trim());
        check('A1: Modal — Escape cierra y devuelve el foco a «Añadir a mano»', (await page.locator('[role=dialog]').count()) === 0 && /Añadir a mano/.test(back || ''), back);
        // Cerrar con el botón «Cerrar» (teclado) también devuelve el foco.
        await opener.focus();
        await page.keyboard.press('Enter');
        await page.locator('[role=dialog]').waitFor();
        await page.locator('[role=dialog] button[aria-label="Cerrar"]').first().focus();
        await page.keyboard.press('Enter');
        await wait(300);
        const back2 = await page.evaluate(() => document.activeElement?.textContent?.trim());
        check('A1: Modal — «Cerrar» devuelve el foco a «Añadir a mano»', /Añadir a mano/.test(back2 || ''), back2);
        // A3: foco visible en los campos de fecha (segmentos del input date).
        await opener.focus();
        await page.keyboard.press('Enter');
        await page.locator('#ef-invoice_date').waitFor();
        await page.locator('#ef-invoice_date').focus();
        await page.keyboard.press('Tab'); await page.keyboard.press('Shift+Tab');
        const ring = await page.evaluate(() => { const el = document.activeElement; const cs = getComputedStyle(el); return { id: el.id, outline: cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) >= 2 }; });
        check('A3: el campo de fecha enfocado con teclado tiene anillo de foco (outline ≥ 2px)', ring.id === 'ef-invoice_date' && ring.outline, ring);
        await ctx.close();
      }
      {
        // Móvil: hoja «Más» y asistente.
        const [ctx, page] = await mk({ mobile: true });
        await go(page, '/app/home');
        const more = page.locator('.bottom-nav button[aria-haspopup="dialog"]');
        await more.focus();
        await page.keyboard.press('Enter');
        await page.locator('[role=dialog]').waitFor();
        await wait(400);
        const out1 = [...await tabsStayInDialog(page, 25, false), ...await tabsStayInDialog(page, 10, true)];
        check('A1: hoja «Más» — Tab y Shift+Tab no salen de la hoja', out1.length === 0, out1.slice(0, 5));
        await page.keyboard.press('Escape');
        await wait(300);
        const backMore = await page.evaluate(() => document.activeElement?.getAttribute('aria-haspopup'));
        check('A1: hoja «Más» — Escape devuelve el foco al botón «Más»', backMore === 'dialog', await page.evaluate(focusDesc));

        await page.locator('.chat-launcher').focus();
        await page.keyboard.press('Enter');
        await page.locator('[role=dialog]').waitFor();
        await wait(400);
        const modal = await page.locator('[role=dialog]').getAttribute('aria-modal');
        const out2 = [...await tabsStayInDialog(page, 20, false), ...await tabsStayInDialog(page, 10, true)];
        check('A1: asistente en móvil — aria-modal y el foco no sale del panel', modal === 'true' && out2.length === 0, { modal, out: out2.slice(0, 5) });
        await page.keyboard.press('Escape');
        await wait(300);
        const backChat = await page.evaluate(() => document.activeElement?.classList.contains('chat-launcher'));
        check('A1: asistente en móvil — Escape devuelve el foco al botón del asistente', backChat, await page.evaluate(focusDesc));
        await ctx.close();
      }
      {
        // Escritorio: el asistente es un panel (no modal), pero Escape devuelve el foco.
        const [ctx, page] = await mk();
        await go(page, '/app/home');
        await page.locator('.chat-launcher').focus();
        await page.keyboard.press('Enter');
        await page.locator('[role=dialog]').waitFor();
        await page.keyboard.press('Escape');
        await wait(300);
        check('A1: asistente en escritorio — Escape devuelve el foco al botón del asistente', await page.evaluate(() => document.activeElement?.classList.contains('chat-launcher')), await page.evaluate(focusDesc));
        await ctx.close();
      }
    }

    // ── A4: la landing solo pide la captura que se ve ────────────────────────
    if (!ONLY || ONLY === 'landing') {
      for (const theme of ['dark', 'light']) {
        const [ctx, page] = await mk({ auth: false, theme, reduce: false });
        const shots = [];
        page.on('request', r => { if (r.url().includes('/screens/')) shots.push(r.url().split('/screens/')[1]); });
        await go(page, '/home');
        const atLoad = [...shots];
        check(`A4: al cargar /home (${theme}) se pide como mucho 1 captura, WebP y del tema activo`,
          atLoad.length <= 1 && atLoad.every(s => s.endsWith('.webp') && s.includes(`-${theme}`)), atLoad);
        await page.locator('#por-dentro').scrollIntoViewIfNeeded();
        await wait(1500);
        const visible = await page.evaluate(() => [...document.querySelectorAll('#por-dentro img')].filter(i => i.complete && i.naturalWidth > 0 && getComputedStyle(i.closest('[aria-hidden]') || i).opacity !== '0').map(i => i.currentSrc.split('/screens/')[1]));
        check(`A4: en la sección de capturas (${theme}) se ve la captura activa en WebP`, visible.length === 1 && visible[0].includes(`inicio-${theme}`) && visible[0].endsWith('.webp'), visible);
        check(`A4: tras llegar a la sección (${theme}) se han pedido como mucho 2 capturas (la activa y la siguiente)`, shots.length <= 2 && shots.every(s => s.includes(`-${theme}`)), shots);
        await page.getByRole('tab').nth(2).click();
        await wait(1200);
        const shown = await page.evaluate(() => { const i = document.querySelector('#por-dentro [aria-hidden="false"] img'); return i ? { src: i.currentSrc.split('/screens/')[1], ok: i.complete && i.naturalWidth > 0 } : null; });
        check(`A4: al elegir otra pestaña (${theme}) se carga su captura`, !!shown && shown.ok && shown.src.startsWith('cobros-'), shown);
        // Las animaciones siguen ahí (sin movimiento reducido): las capturas se funden con transición.
        const anim = await page.evaluate(() => { const d = document.querySelector('#por-dentro [aria-hidden="false"]'); return d ? getComputedStyle(d).transitionProperty : ''; });
        check(`A4: las capturas siguen con su transición de fundido (${theme})`, /opacity/.test(anim), anim);
        await ctx.close();
      }
    }

    // ── A5/A6: saltar al contenido, toasts, «Cerrar» con contexto, cabecera ──
    if (!ONLY || ONLY === 'misc') {
      {
        const [ctx, page] = await mk({ keepNews: true });
        await go(page, '/app/home');
        await page.keyboard.press('Tab');
        const skip = await page.evaluate(() => ({ cls: document.activeElement?.className, text: document.activeElement?.textContent?.trim() }));
        check('A5: en la app, el primer Tab cae en «Saltar al contenido»', /skip-link/.test(skip.cls || '') && skip.text === 'Saltar al contenido', skip);
        await page.keyboard.press('Enter');
        await wait(200);
        check('A5: en la app, «Saltar al contenido» lleva el foco a <main>', await page.evaluate(() => document.activeElement?.tagName === 'MAIN'), await page.evaluate(focusDesc));
        const toaster = await page.evaluate(() => { const el = document.querySelector('.toaster'); window.__toaster = el; return el ? { live: el.getAttribute('aria-live'), empty: el.children.length === 0 } : null; });
        check('A5: la región viva de los toasts existe vacía desde el principio (aria-live="polite")', !!toaster && toaster.live === 'polite' && toaster.empty, toaster);
        await ctx.setOffline(true);
        await page.evaluate(() => window.dispatchEvent(new Event('offline')));
        await wait(500);
        const toastIn = await page.evaluate(() => { const el = document.querySelector('.toaster'); return { same: el === window.__toaster, text: el?.textContent?.trim().slice(0, 60) }; });
        check('A5: el aviso aparece dentro de esa misma región viva', toastIn.same && !!toastIn.text, toastIn);
        await ctx.setOffline(false);
        const close = await page.evaluate(() => [...document.querySelectorAll('main button[aria-label]')].map(b => b.getAttribute('aria-label')).filter(l => /^Cerrar/.test(l)));
        check('A5: el «Cerrar» del aviso de Inicio dice qué cierra', close.length > 0 && close.every(l => l !== 'Cerrar'), close);
        await ctx.close();
      }
      {
        const [ctx, page] = await mk({ auth: false });
        await go(page, '/home');
        const target = await page.evaluate(() => { const a = document.querySelector('a.skip-link'); return !!a && !!document.getElementById(a.getAttribute('href').slice(1)); });
        check('A5: en la landing, el destino de «Saltar al contenido» existe (auditoría skip-link de Lighthouse)', target);
        await page.keyboard.press('Tab');
        const skip = await page.evaluate(() => document.activeElement?.textContent?.trim());
        await page.keyboard.press('Enter');
        await wait(200);
        check('A5: en la landing, el primer Tab es «Saltar al contenido» y lleva a <main>', skip === 'Saltar al contenido' && await page.evaluate(() => document.activeElement?.tagName === 'MAIN'), skip);
        const navs = await page.evaluate(() => [...document.querySelectorAll('nav')].map(n => n.getAttribute('aria-label')));
        check('A5: todos los <nav> públicos tienen nombre y es distinto', navs.every(Boolean) && new Set(navs).size === navs.length, navs);
        await go(page, '/login');
        check('A5: /login tiene <main>', (await page.locator('main').count()) === 1);
        await ctx.close();
      }
      {
        // A6: en tema claro, el HTML prerenderizado (oscuro) y el hidratado tienen la misma cabecera:
        // sin cambiar iconos al montar (el tema se aplica solo con CSS).
        const [ctx, page] = await mk({ auth: false, theme: 'light' });
        await ctx.addInitScript(() => {
          const mo = new MutationObserver((recs) => {
            for (const r of recs) if (r.removedNodes.length && r.target.nodeType === 1 && r.target.closest('#root header')) window.__hdrMut = (window.__hdrMut || 0) + r.removedNodes.length;
          });
          mo.observe(document, { childList: true, subtree: true });
        });
        await go(page, '/home');
        const muts = await page.evaluate(() => window.__hdrMut || 0);
        const icon = await page.evaluate(() => { const b = document.querySelector('#root header button[aria-label]'); const vis = [...b.querySelectorAll('svg')].filter(s => getComputedStyle(s).display !== 'none'); return { label: b.getAttribute('aria-label'), visible: vis.length }; });
        check('A6: la cabecera pública no se repinta al hidratar en tema claro (sin nodos cambiados)', muts === 0, muts);
        check('A6: en claro el botón de tema enseña un solo icono y el texto correcto', icon.visible === 1 && icon.label === 'Modo oscuro', icon);
        await ctx.close();
      }
    }
  } finally {
    await browser.close();
    server.close();
    demo.close();
  }
  console.log(fail ? `\n${fail} comprobaciones fallidas` : '\nTodo OK');
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error('FALLO:', e.stack || e.message); process.exit(1); });
