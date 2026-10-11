/**
 * scripts/redes-clips.js — sesión 13: graba en vídeo la app REAL con la cuenta
 * de ejemplo («Taller García», datos ficticios) para los vídeos de redes.
 *
 * Lee los clips de un guion (marketing/redes/video/guiones/<id>.json, campo
 * "clips") y graba cada uno en vertical 1080×2340 (móvil de 360×780 a 3×),
 * con un círculo en cada toque para que se vea dónde se pulsa.
 *
 * Uso (desde backend/, con el frontend compilado):
 *   PLAYWRIGHT_CORE=… node scripts/redes-clips.js ../marketing/redes/video/guiones/<id>.json
 * Salida: marketing/redes/salida/video/<id>/clips/<clip>.mp4 + <clip>.json ({ inicio, fin, marcas } en s, desde el
 *   primer fotograma). Las marcas son absolutas en el clip (no relativas a «inicio»).
 *
 * Pasos de un clip:
 *   { "ir": "/app/finanzas/impuestos" }          navegar (la grabación empieza aquí)
 *   { "esperar": 800 }                            ms
 *   { "tocar": "text=3T" }                        selector de Playwright
 *   { "escribir": { "en": "input[name=x]", "texto": "1200" } }
 *   { "bajar": 500 } / { "subir": 500 }           desplazamiento suave en px
 *   { "marca": "importe" }                        segundo del clip que usa el montaje (escena.marca)
 * SHOTS_DATE=AAAA-MM-DD fija el día (por defecto 2026-09-29, dentro del 3T de los datos).
 */

'use strict';

const fs = require('fs');
const path = require('path');

process.env.SHOTS_DATE = process.env.SHOTS_DATE || '2026-09-29';
const { prepareDemo, CHROME, wait, DB } = require('./demo-account');
const { chromium } = require(process.env.PLAYWRIGHT_CORE || 'playwright-core');

const TAP_JS = `
  window.__nokfiTap = (x, y) => {
    const d = document.createElement('div');
    d.style.cssText = 'position:fixed;z-index:2147483647;pointer-events:none;left:' + (x - 22) + 'px;top:' + (y - 22) + 'px;width:44px;height:44px;border-radius:50%;background:rgba(255,255,255,.35);border:2px solid rgba(255,255,255,.9);box-shadow:0 0 0 6px rgba(59,130,246,.35);transform:scale(.6);opacity:1;transition:transform .45s ease-out,opacity .45s ease-out';
    document.body.appendChild(d);
    requestAnimationFrame(() => { d.style.transform = 'scale(1.25)'; d.style.opacity = '0'; });
    setTimeout(() => d.remove(), 600);
  };`;

/** Desplaza suavemente el contenedor que tenga scroll (la ventana o el <main>). */
async function desplazar(page, px) {
  await page.evaluate((dy) => {
    const cands = [document.scrollingElement, ...document.querySelectorAll('main, [data-scroll], .overflow-y-auto')];
    const el = cands.find(e => e && e.scrollHeight > e.clientHeight + 10) || document.scrollingElement;
    el.scrollBy({ top: dy, behavior: 'smooth' });
  }, px);
  await wait(Math.min(1400, 500 + Math.abs(px)));
}

async function grabarClip(browser, demo, clip, dir) {
  const ctx = await browser.newContext({
    viewport: { width: 360, height: 780 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true,
    locale: 'es-ES', timezoneId: 'Europe/Madrid'
  });
  await ctx.addInitScript(([tk, js]) => {
    sessionStorage.setItem('nokfi_session_token', tk);
    localStorage.setItem('nokfi_theme', 'dark');
    localStorage.setItem('nokfi_lang', 'es');
    // Aviso de novedades de Inicio cerrado (frontend/src/pages/Home.jsx, NEWS_KEY).
    localStorage.setItem('nokfi.news.2026-10-invoicing', '1');
    // eslint-disable-next-line no-new-func
    new Function(js)();
  }, [demo.token, TAP_JS]);
  const d = new Date(`${process.env.SHOTS_DATE}T00:00:00`); d.setHours(10, 30, 0, 0);
  await ctx.clock.setFixedTime(d);
  const page = await ctx.newPage();
  // Screencast de Chrome a resolución real (1080×2340): la grabación de vídeo de
  // Playwright no respeta deviceScaleFactor y deja la app pequeña en una esquina.
  const framesDir = path.join(dir, `${clip.id}-frames`);
  fs.rmSync(framesDir, { recursive: true, force: true });
  fs.mkdirSync(framesDir, { recursive: true });
  const frames = [];
  const cdp = await ctx.newCDPSession(page);
  cdp.on('Page.screencastFrame', ({ data, metadata, sessionId }) => {
    const f = path.join(framesDir, `${String(frames.length).padStart(5, '0')}.png`);
    fs.writeFileSync(f, Buffer.from(data, 'base64'));
    frames.push({ f, t: metadata.timestamp });
    cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {});
  });
  // PNG: sin pérdida (el texto de la app queda nítido tras la compresión de TikTok).
  await cdp.send('Page.startScreencast', { format: 'png', maxWidth: 1080, maxHeight: 2340, everyNthFrame: 1 });
  const ahora = () => Date.now() / 1000;
  let inicio = null;
  const marcas = {};

  for (const paso of clip.pasos) {
    if (paso.ir) {
      await page.goto(`${demo.webUrl}${paso.ir}`, { waitUntil: 'networkidle' });
      await wait(900);
      if (inicio === null) inicio = ahora();
    } else if (paso.marca) {
      marcas[paso.marca] = ahora();
    } else if (paso.esperar) {
      await wait(paso.esperar);
    } else if (paso.tocar) {
      const loc = page.locator(paso.tocar).filter({ visible: true }).first();
      await loc.scrollIntoViewIfNeeded();
      const b = await loc.boundingBox();
      if (b) await page.evaluate(([x, y]) => window.__nokfiTap(x, y), [b.x + b.width / 2, b.y + b.height / 2]);
      await wait(180);
      await loc.click();
      await wait(700);
    } else if (paso.escribir) {
      const loc = page.locator(paso.escribir.en).filter({ visible: true }).first();
      const b = await loc.boundingBox();
      if (b) await page.evaluate(([x, y]) => window.__nokfiTap(x, y), [b.x + b.width / 2, b.y + b.height / 2]);
      await loc.click();
      await loc.pressSequentially(String(paso.escribir.texto), { delay: 110 });
      await wait(500);
    } else if (paso.bajar) {
      await desplazar(page, paso.bajar);
    } else if (paso.subir) {
      await desplazar(page, -paso.subir);
    }
  }
  await wait(400);
  const fin = ahora();
  await cdp.send('Page.stopScreencast');
  await ctx.close();
  if (!frames.length) throw new Error(`${clip.id}: sin fotogramas`);
  // Lista para ffmpeg con la duración real de cada fotograma (solo llegan
  // cuando la pantalla cambia) → vídeo a 30 fps constantes.
  const t0 = frames[0].t;
  const lista = frames.map((fr, i) => `file '${fr.f}'\nduration ${((frames[i + 1]?.t ?? fin) - fr.t).toFixed(3)}`).join('\n') + `\nfile '${frames.at(-1).f}'\n`;
  const listaPath = path.join(framesDir, 'lista.txt');
  fs.writeFileSync(listaPath, lista);
  const destino = path.join(dir, `${clip.id}.mp4`);
  require('child_process').execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', listaPath,
    '-vf', 'fps=30,scale=1080:2340:flags=lanczos,format=yuv420p', '-c:v', 'libx264', '-crf', '10', '-preset', 'medium', '-tune', 'animation', destino]);
  fs.rmSync(framesDir, { recursive: true, force: true });
  const rel = (t) => Math.max(0, +(t - t0).toFixed(3));
  fs.writeFileSync(path.join(dir, `${clip.id}.json`), JSON.stringify({
    inicio: rel(inicio ?? t0), fin: rel(fin),
    marcas: Object.fromEntries(Object.entries(marcas).map(([k, v]) => [k, rel(v)]))
  }, null, 2));
  return destino;
}

async function main() {
  const guionPath = process.argv[2];
  if (!guionPath) throw new Error('Uso: node scripts/redes-clips.js <guion.json>');
  const guion = JSON.parse(fs.readFileSync(guionPath, 'utf8'));
  const dir = path.join(__dirname, '../../marketing/redes/salida/video', guion.id, 'clips');
  fs.mkdirSync(dir, { recursive: true });
  const solo = process.argv[3]; // opcional: grabar solo un clip
  const demo = await prepareDemo();
  const browser = await chromium.launch({ executablePath: CHROME });
  for (const clip of guion.clips) {
    if (solo && clip.id !== solo) continue;
    await grabarClip(browser, demo, clip, dir);
    console.log('✓ clip', clip.id);
  }
  await browser.close();
  demo.close();
  process.exit(0);
}

main().catch((e) => { console.error(e); try { fs.unlinkSync(DB); } catch { /* nada */ } process.exit(1); });
