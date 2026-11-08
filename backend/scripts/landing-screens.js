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
 * Uso (desde backend/, con el frontend compilado con VITE_API_URL=/api):
 *   PLAYWRIGHT_CORE=/ruta/node_modules/playwright-core node scripts/landing-screens.js
 * Salida: frontend/public/screens/
 *   <pantalla>-<tema>.jpg                    1920×1200 (respaldo del <picture> de la landing)
 *   <pantalla>-<tema>-{640,960,1280,1920}.webp  los que pide la landing (S15b T4: antes a mano)
 *   <pantalla>-dark-narrow.webp              780×1688, móvil, capturas «narrow» del manifest PWA (S15b T4)
 * Redes (sesión 13): SHOTS_OUT=<carpeta> (móvil) y SHOTS_DATE=2026-09-29 (3T con datos).
 * SHOTS_ONLY=narrow: solo las capturas del manifest (no toca las de la landing).
 */

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const { prepareDemo, CHROME, wait, DB } = require('./demo-account');

// SHOTS_OUT=<carpeta>: revisión en móvil (390×844, más pantallas) sin tocar las capturas de la landing.
const MOBILE_OUT = process.env.SHOTS_OUT || null;
const ONLY_NARROW = process.env.SHOTS_ONLY === 'narrow';
const OUT = MOBILE_OUT || path.join(__dirname, '../../frontend/public/screens');
// Mismos anchos y calidad que usa la landing (Landing.jsx, <picture> con srcset).
const WEBP_WIDTHS = [640, 960, 1280, 1920];
const WEBP_QUALITY = 0.78;
// Capturas «narrow» del manifest (vite.config.js → screenshots): móvil 390×844 a 2×.
const NARROW = [['inicio', '/app/home'], ['cobros', '/app/finanzas/cobros']];

/**
 * S15b T4: codifica una captura (PNG/JPG) a WebP con el propio Chromium (canvas → WebP),
 * sin depender de ImageMagick. `widths`: anchos de salida (null = el ancho original).
 * Devuelve [{ width, height, buf }].
 */
async function encodeWebps(browser, srcBuffer, widths, quality = WEBP_QUALITY) {
  const page = await browser.newPage();
  try {
    const mime = srcBuffer[0] === 0x89 ? 'image/png' : 'image/jpeg';
    const outs = await page.evaluate(async ({ src, ws, q }) => {
      const img = new Image();
      img.src = src;
      await img.decode();
      return ws.map((want) => {
        const w = want || img.naturalWidth;
        const h = Math.round(img.naturalHeight * w / img.naturalWidth);
        const c = document.createElement('canvas');
        c.width = w; c.height = h;
        const ctx = c.getContext('2d');
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, w, h);
        return { width: w, height: h, data: c.toDataURL('image/webp', q).split(',')[1] };
      });
    }, { src: `data:${mime};base64,${srcBuffer.toString('base64')}`, ws: widths, q: quality });
    return outs.map(({ width, height, data }) => ({ width, height, buf: Buffer.from(data, 'base64') }));
  } finally {
    await page.close();
  }
}

/** Los WebP de la landing: `<base>-<ancho>.webp` para cada ancho de WEBP_WIDTHS. */
async function writeWebps(browser, srcBuffer, outBase, widths = WEBP_WIDTHS) {
  const outs = await encodeWebps(browser, srcBuffer, widths);
  return outs.map(({ width, height, buf }) => {
    const file = `${outBase}-${width}.webp`;
    fs.writeFileSync(file, buf);
    return { file, width, height };
  });
}

/** Una captura → un WebP con el nombre exacto `file`, a su tamaño (capturas del manifest). */
async function writeWebp(browser, srcBuffer, file) {
  const [{ width, height, buf }] = await encodeWebps(browser, srcBuffer, [null]);
  fs.writeFileSync(file, buf);
  return { file, width, height };
}

async function main() {
  const { chromium } = require(process.env.PLAYWRIGHT_CORE || 'playwright-core');
  const { token, aid, webUrl, close } = await prepareDemo();
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ executablePath: CHROME });
  const shots = [
    ['inicio', '/app/home'],
    ['impuestos', '/app/finanzas/impuestos'],
    ['cobros', '/app/finanzas/cobros'],
    ['informe', `/app/historial/${aid}`],
    ...(MOBILE_OUT ? [['libro', '/app/finanzas/libro'], ['cuestionario', '/app/cuestionario'], ['calculadoras', '/app/calculadoras?c=hora'],
      ['historial', '/app/historial'], ['configuracion', '/app/configuracion'], ['ayuda', '/app/ayuda'], ['landing', '/home'], ['precios', '/pricing']] : [])
  ];
  for (const theme of ONLY_NARROW ? [] : MOBILE_OUT ? ['dark'] : ['dark', 'light']) {
    const ctx = await browser.newContext({
      viewport: MOBILE_OUT ? { width: 390, height: 844 } : { width: 1280, height: 800 },
      deviceScaleFactor: MOBILE_OUT ? 2 : 1.5, isMobile: !!MOBILE_OUT, hasTouch: !!MOBILE_OUT, locale: 'es-ES', timezoneId: 'Europe/Madrid'
    });
    await ctx.addInitScript(([tk, th]) => {
      sessionStorage.setItem('nokfi_session_token', tk);
      localStorage.setItem('nokfi_theme', th);
      localStorage.setItem('nokfi_lang', 'es');
    }, [token, theme]);
    // Media mañana de hoy, para que el saludo sea "Buenos días".
    // SHOTS_DATE=AAAA-MM-DD (sesión 13): otro día, p. ej. dentro del 3T de los datos de ejemplo.
    const d = process.env.SHOTS_DATE ? new Date(`${process.env.SHOTS_DATE}T00:00:00`) : new Date(); d.setHours(10, 30, 0, 0);
    await ctx.clock.setFixedTime(d);
    const page = await ctx.newPage();
    for (const [name, url] of shots) {
      await page.goto(`${webUrl}${url}`, { waitUntil: 'networkidle' });
      await page.addStyleTag({ content: '*,*::before,*::after{animation-duration:0s!important;transition-duration:0s!important}' });
      await wait(1200);
      await page.screenshot({ path: path.join(OUT, `${name}-${theme}.jpg`), type: 'jpeg', quality: 82, fullPage: !!MOBILE_OUT });
      // Landing: también los WebP que pide el <picture> (a partir de un PNG, sin pasar por el JPG).
      if (!MOBILE_OUT) await writeWebps(browser, await page.screenshot({ type: 'png' }), path.join(OUT, `${name}-${theme}`));
      console.log('✓', name, theme);
    }
    await ctx.close();
  }
  // Manifest PWA: capturas «narrow» (móvil, tema oscuro).
  if (!MOBILE_OUT) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'es-ES', timezoneId: 'Europe/Madrid' });
    await ctx.addInitScript((tk) => {
      sessionStorage.setItem('nokfi_session_token', tk);
      localStorage.setItem('nokfi_theme', 'dark');
      localStorage.setItem('nokfi_lang', 'es');
      localStorage.setItem('nokfi.news.2026-10-invoicing', '1'); // sin el aviso de novedades
    }, token);
    const d = process.env.SHOTS_DATE ? new Date(`${process.env.SHOTS_DATE}T00:00:00`) : new Date(); d.setHours(10, 30, 0, 0);
    await ctx.clock.setFixedTime(d);
    const page = await ctx.newPage();
    for (const [name, url] of NARROW) {
      await page.goto(`${webUrl}${url}`, { waitUntil: 'networkidle' });
      await page.addStyleTag({ content: '*,*::before,*::after{animation-duration:0s!important;transition-duration:0s!important}' });
      await wait(1200);
      await writeWebp(browser, await page.screenshot({ type: 'png' }), path.join(OUT, `${name}-dark-narrow.webp`));
      console.log('✓', name, 'narrow');
    }
    await ctx.close();
  }
  await browser.close();
  close();
  process.exit(0);
}

module.exports = { writeWebps, writeWebp, WEBP_WIDTHS, NARROW };

if (require.main === module) {
  main().catch((e) => { console.error(e); try { fs.unlinkSync(DB); } catch { /* nada */ } process.exit(1); });
}
