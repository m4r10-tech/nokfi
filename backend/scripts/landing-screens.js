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
 * Redes (sesión 13): SHOTS_OUT=<carpeta> (móvil) y SHOTS_DATE=2026-09-29 (3T con datos).
 */

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const { prepareDemo, CHROME, wait, DB } = require('./demo-account');

// SHOTS_OUT=<carpeta>: revisión en móvil (390×844, más pantallas) sin tocar las capturas de la landing.
const MOBILE_OUT = process.env.SHOTS_OUT || null;
const OUT = MOBILE_OUT || path.join(__dirname, '../../frontend/public/screens');
const { chromium } = require(process.env.PLAYWRIGHT_CORE || 'playwright-core');

async function main() {
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
  for (const theme of MOBILE_OUT ? ['dark'] : ['dark', 'light']) {
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
      console.log('✓', name, theme);
    }
    await ctx.close();
  }
  await browser.close();
  close();
  process.exit(0);
}

main().catch((e) => { console.error(e); try { fs.unlinkSync(DB); } catch { /* nada */ } process.exit(1); });
