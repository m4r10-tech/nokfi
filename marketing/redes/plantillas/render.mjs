/**
 * marketing/redes/plantillas/render.mjs — sesión 13: imágenes para redes.
 *
 * Lee una o varias piezas en JSON (marketing/redes/piezas/*.json) y genera un
 * PNG por lámina con Chromium (playwright-core), con la tipografía, los
 * colores y las capturas reales de Nokfi. Todo local: no publica nada.
 *
 * Uso (desde la raíz del repo):
 *   PLAYWRIGHT_CORE=/ruta/node_modules/playwright-core node marketing/redes/plantillas/render.mjs [pieza.json ...]
 * Sin argumentos: todas las piezas de marketing/redes/piezas/.
 * Salida: marketing/redes/salida/<pieza>/<nn>-<plantilla>.png
 *
 * Pieza:
 *   { "id": "2026-10-06-plazo-303", "formato": "post", "tema": "oscuro",
 *     "laminas": [ { "plantilla": "portada", "etiqueta": "...", "titulo": "...", "texto": "..." }, ... ] }
 * Formatos: cuadrado 1080×1080 · post 1080×1350 · vertical 1080×1920 ·
 *           horizontal 1600×900 · cabecera 1500×500
 * Plantillas: portada, paso, dato, lista, captura, cierre, cabecera, perfil.
 * Texto: **negrita** resalta en azul; \n parte la línea.
 * captura: "captura" (inicio, impuestos, cobros, informe, libro, cuestionario,
 *   calculadoras), "desde" y "ventana" opcionales (px de la pantalla de 390).
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../..');
const PIEZAS = path.resolve(HERE, '../piezas');
const SALIDA = path.resolve(HERE, '../salida');
const PUBLIC = path.join(ROOT, 'frontend/public');
const MOVIL = path.join(HERE, 'capturas-movil');

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_CORE || 'playwright-core');
const CHROME = fs.readdirSync(path.join(os.homedir(), '.cache/ms-playwright'))
  .filter(d => /^chromium-\d+$/.test(d)).sort().map(d => path.join(os.homedir(), '.cache/ms-playwright', d, 'chrome-linux64/chrome'))
  .find(p => fs.existsSync(p));

const FORMATOS = {
  cuadrado: { w: 1080, h: 1080, s: 1 },
  post: { w: 1080, h: 1350, s: 1 },
  vertical: { w: 1080, h: 1920, s: 1.08 },
  horizontal: { w: 1600, h: 900, s: 1.05 },
  cabecera: { w: 1500, h: 500, s: 1 }
};

const TEMAS = {
  oscuro: { bg: '#0F0F0F', bg2: '#171A21', text: '#FFFFFF', text2: '#A3A3A3', accent: '#1456A2', hl: '#5B9BE6', border: 'rgba(255,255,255,0.10)' },
  claro: { bg: '#FFFFFF', bg2: '#F1F5F9', text: '#0F172A', text2: '#475569', accent: '#1456A2', hl: '#2563EB', border: 'rgba(15,23,42,0.10)' },
  azul: { bg: '#1456A2', bg2: '#0F427D', text: '#FFFFFF', text2: 'rgba(255,255,255,0.80)', accent: '#FFFFFF', hl: '#BFDBFE', border: 'rgba(255,255,255,0.20)' }
};

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
/** **negrita** → resaltado; \n → salto de línea. */
const rich = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\n/g, '<br>');
const file = (p) => pathToFileURL(p).href;
const marca = fs.readFileSync(path.join(PUBLIC, 'favicon.svg'), 'utf8');
const marcaColor = (color) => marca.replace('#1456A2', color).replace('<svg ', '<svg class="marca" ');

function css(f, t) {
  const u = (n) => `${Math.round(n * f.s)}px`;
  return `
  @font-face { font-family: 'Jakarta'; src: url('${file(path.join(PUBLIC, 'fonts/PlusJakartaSans-latin.woff2'))}') format('woff2'); font-weight: 200 800; }
  @font-face { font-family: 'Jakarta'; src: url('${file(path.join(PUBLIC, 'fonts/PlusJakartaSans-latin-ext.woff2'))}') format('woff2'); font-weight: 200 800; unicode-range: U+0100-024F; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { width: ${f.w}px; height: ${f.h}px; }
  body { font-family: 'Jakarta', sans-serif; background: ${t.bg}; color: ${t.text}; overflow: hidden; position: relative;
    -webkit-font-smoothing: antialiased; letter-spacing: -0.01em; }
  .fondo { position: absolute; inset: 0; background:
    radial-gradient(${f.w * 0.9}px ${f.w * 0.9}px at 100% 0%, ${t.accent}38, transparent 60%),
    radial-gradient(${f.w * 0.7}px ${f.w * 0.7}px at 0% 100%, ${t.accent}22, transparent 60%); }
  .lienzo { position: absolute; inset: 0; padding: ${u(84)} ${u(84)} ${u(72)}; display: flex; flex-direction: column; }
  .cuerpo { flex: 1; display: flex; flex-direction: column; justify-content: center; gap: ${u(28)}; min-height: 0; }
  .etiqueta { display: inline-flex; align-self: flex-start; align-items: center; gap: ${u(10)}; padding: ${u(10)} ${u(20)};
    border-radius: 999px; background: ${t.accent}2e; color: ${t.hl}; border: 1px solid ${t.hl}55;
    font-size: ${u(26)}; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; }
  h1 { font-size: ${u(84)}; line-height: 1.06; font-weight: 800; letter-spacing: -0.03em; }
  h2 { font-size: ${u(64)}; line-height: 1.1; font-weight: 800; letter-spacing: -0.025em; }
  h1 b, h2 b, p b, li b { color: ${t.hl}; font-weight: inherit; }
  p { font-size: ${u(36)}; line-height: 1.4; color: ${t.text2}; font-weight: 500; }
  p b { font-weight: 700; }
  .pie { display: flex; align-items: center; justify-content: space-between; gap: ${u(20)}; padding-top: ${u(28)};
    border-top: 1px solid ${t.border}; font-size: ${u(24)}; color: ${t.text2}; font-weight: 500; }
  .logo { display: inline-flex; align-items: center; gap: ${u(10)}; font-size: ${u(34)}; font-weight: 700; color: ${t.text}; letter-spacing: -0.02em; }
  .marca { width: ${u(42)}; height: ${u(42)}; }
  .num { display: inline-flex; align-items: center; justify-content: center; width: ${u(92)}; height: ${u(92)}; border-radius: ${u(24)};
    background: ${t.accent}; color: #fff; font-size: ${u(48)}; font-weight: 800; }
  .contador { font-size: ${u(24)}; font-weight: 600; color: ${t.text2}; }
  .dato { font-size: ${u(190)}; line-height: 0.95; font-weight: 800; letter-spacing: -0.045em; color: ${t.hl}; }
  ul { list-style: none; display: flex; flex-direction: column; gap: ${u(22)}; }
  li { display: flex; gap: ${u(20)}; align-items: flex-start; font-size: ${u(36)}; line-height: 1.35; font-weight: 600; }
  li::before { content: ''; flex: none; width: ${u(16)}; height: ${u(16)}; margin-top: ${u(15)}; border-radius: 50%; background: ${t.hl}; }
  .captura { display: flex; gap: ${u(48)}; flex: 1; min-height: 0; align-items: stretch; }
  .captura.col { flex-direction: column; gap: ${u(36)}; }
  .captura .txt { flex: 1 1 auto; display: flex; flex-direction: column; justify-content: center; gap: ${u(24)}; }
  .movil { flex: none; align-self: center; border-radius: ${u(52)}; padding: ${u(14)}; background: #050505;
    border: ${u(3)} solid #2A2F3A; box-shadow: 0 ${u(40)}px ${u(90)}px rgba(0,0,0,0.45); overflow: hidden; }
  .movil .pantalla { border-radius: ${u(40)}; overflow: hidden; background: #0F0F0F; height: 100%; }
  .movil img { display: block; width: 100%; height: auto; }
  .aviso { font-size: ${u(22)}; color: ${t.text2}; opacity: 0.85; }
  .cta { display: inline-flex; align-self: flex-start; align-items: center; gap: ${u(14)}; padding: ${u(26)} ${u(40)}; border-radius: ${u(20)};
    background: ${t.accent === '#FFFFFF' ? '#FFFFFF' : t.accent}; color: ${t.accent === '#FFFFFF' ? '#1456A2' : '#FFFFFF'}; font-size: ${u(38)}; font-weight: 800; }
  `;
}

function pie(f, t, lam) {
  const derecha = lam.contador ? `<span class="contador">${esc(lam.contador)}</span>` : `<span>${esc(lam.pie ?? 'nokfi.app · información orientativa')}</span>`;
  return `<div class="pie"><span class="logo">${marcaColor(t.accent === '#FFFFFF' ? '#FFFFFF' : '#3B82F6')}nokfi</span>${derecha}</div>`;
}

/**
 * Marco de móvil con la captura. `desde`: px (en la captura de 390 de ancho)
 * desde donde se muestra; `ventana`: cuántos px de pantalla se ven (844 = la
 * pantalla entera; menos = móvil más ancho y legible, cortado por abajo).
 */
function movil(f, lam, alto, ventana) {
  const src = path.join(MOVIL, `${lam.captura}-dark.jpg`);
  if (!fs.existsSync(src)) throw new Error(`No existe la captura ${src}`);
  const v = lam.ventana || ventana;
  const marco = Math.round(14 * f.s) * 2;
  const ancho = Math.round((alto - marco) * 390 / v) + marco;
  const desde = Math.round((lam.desde || 0) * (ancho - marco) / 390);
  return `<div class="movil" style="width:${ancho}px;height:${alto}px"><div class="pantalla">
    <img src="${file(src)}" style="margin-top:-${desde}px"></div></div>`;
}

const PLANTILLAS = {
  portada: (f, t, l) => `<div class="cuerpo">
      ${l.etiqueta ? `<span class="etiqueta">${esc(l.etiqueta)}</span>` : ''}
      <h1>${rich(l.titulo)}</h1>
      ${l.texto ? `<p>${rich(l.texto)}</p>` : ''}
    </div>${pie(f, t, l)}`,

  paso: (f, t, l) => `<div class="cuerpo">
      ${l.numero != null ? `<span class="num">${esc(l.numero)}</span>` : ''}
      <h2>${rich(l.titulo)}</h2>
      ${l.texto ? `<p>${rich(l.texto)}</p>` : ''}
    </div>${pie(f, t, l)}`,

  dato: (f, t, l) => `<div class="cuerpo">
      ${l.etiqueta ? `<span class="etiqueta">${esc(l.etiqueta)}</span>` : ''}
      <div class="dato">${rich(l.dato)}</div>
      <h2>${rich(l.titulo)}</h2>
      ${l.texto ? `<p>${rich(l.texto)}</p>` : ''}
    </div>${pie(f, t, l)}`,

  lista: (f, t, l) => `<div class="cuerpo">
      ${l.etiqueta ? `<span class="etiqueta">${esc(l.etiqueta)}</span>` : ''}
      <h2>${rich(l.titulo)}</h2>
      <ul>${(l.puntos || []).map(x => `<li><span>${rich(x)}</span></li>`).join('')}</ul>
    </div>${pie(f, t, l)}`,

  captura: (f, t, l) => {
    // Horizontal: texto a la izquierda y móvil a la derecha. Resto: texto
    // arriba y móvil debajo, sin pisar el pie.
    const horizontal = f.w > f.h;
    const alto = Math.round(horizontal ? f.h * 0.66 : f.h - (f.h / f.w > 1.5 ? 760 : 640) * f.s);
    const ventana = horizontal ? 560 : f.h / f.w > 1.5 ? 600 : f.h > f.w ? 500 : 340;
    const txt = `<div class="txt">
        ${l.etiqueta ? `<span class="etiqueta">${esc(l.etiqueta)}</span>` : ''}
        <h2>${rich(l.titulo)}</h2>
        ${l.texto ? `<p>${rich(l.texto)}</p>` : ''}
        <span class="aviso">Captura real · cuenta de ejemplo con datos ficticios</span>
      </div>`;
    return `<div class="captura ${horizontal ? '' : 'col'}">${txt}${movil(f, l, alto, ventana)}</div>${pie(f, t, l)}`;
  },

  cierre: (f, t, l) => `<div class="cuerpo">
      <h1>${rich(l.titulo || 'Tus números, **claros**.')}</h1>
      ${l.texto ? `<p>${rich(l.texto)}</p>` : ''}
      <span class="cta">${esc(l.boton || 'Prueba 14 días gratis')} →</span>
      <span class="aviso">${esc(l.aviso || 'nokfi.app · Información orientativa: no sustituye a tu gestoría.')}</span>
    </div>${pie(f, t, { ...l, pie: l.pie ?? 'Enlace en la bio' })}`,

  cabecera: (f, t, l) => `<div class="cuerpo" style="flex-direction:row;align-items:center;justify-content:space-between;padding-left:${Math.round(f.w * 0.17)}px">
      <div style="display:flex;flex-direction:column;gap:${Math.round(18 * f.s)}px;max-width:60%">
        <h2>${rich(l.titulo)}</h2>
        ${l.texto ? `<p>${rich(l.texto)}</p>` : ''}
      </div>
      <span class="logo" style="font-size:${Math.round(56 * f.s)}px">${marcaColor('#3B82F6').replace('class="marca"', `class="marca" style="width:${Math.round(68 * f.s)}px;height:${Math.round(68 * f.s)}px"`)}nokfi</span>
    </div>`,

  perfil: (f) => `<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:#1456A2">
      ${marcaColor('#FFFFFF').replace('class="marca"', `style="width:${Math.round(f.w * 0.62)}px;height:${Math.round(f.w * 0.62)}px;margin-left:${Math.round(f.w * 0.02)}px"`)}
    </div>`
};

function html(pieza, lam) {
  const f = FORMATOS[lam.formato || pieza.formato || 'post'];
  const t = TEMAS[lam.tema || pieza.tema || 'oscuro'];
  if (!f) throw new Error(`Formato desconocido en ${pieza.id}`);
  if (!t) throw new Error(`Tema desconocido en ${pieza.id}`);
  const plantilla = PLANTILLAS[lam.plantilla];
  if (!plantilla) throw new Error(`Plantilla desconocida «${lam.plantilla}» en ${pieza.id}`);
  const lienzoPad = lam.plantilla === 'cabecera' ? 'style="padding:0 64px"' : '';
  return { f, doc: `<!doctype html><html lang="es"><head><meta charset="utf-8"><style>${css(f, t)}</style></head>
    <body><div class="fondo"></div><div class="lienzo" ${lienzoPad}>${plantilla(f, t, lam)}</div></body></html>` };
}

async function main() {
  const args = process.argv.slice(2);
  const ficheros = args.length ? args.map(a => path.resolve(a))
    : fs.readdirSync(PIEZAS).filter(n => n.endsWith('.json')).sort().map(n => path.join(PIEZAS, n));
  const browser = await chromium.launch({ executablePath: CHROME });
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nokfi-redes-'));
  let total = 0;
  for (const fich of ficheros) {
    const lista = [].concat(JSON.parse(fs.readFileSync(fich, 'utf8')));
    for (const pieza of lista) {
      const dir = path.join(SALIDA, pieza.id);
      // Se rehacen las láminas; el vídeo grabado (video.mp4) se queda.
      fs.mkdirSync(dir, { recursive: true });
      for (const n of fs.readdirSync(dir)) if (n.endsWith('.png')) fs.rmSync(path.join(dir, n));
      for (const [i, lam] of pieza.laminas.entries()) {
        const { f, doc } = html(pieza, { ...lam, contador: lam.contador ?? (pieza.laminas.length > 1 ? `${i + 1}/${pieza.laminas.length}` : null) });
        const page = await browser.newPage({ viewport: { width: f.w, height: f.h } });
        const htmlPath = path.join(tmp, `${pieza.id}-${i}.html`);
        fs.writeFileSync(htmlPath, doc);
        await page.goto(file(htmlPath), { waitUntil: 'load' });
        await page.evaluate(() => document.fonts.ready);
        const out = path.join(dir, `${String(i + 1).padStart(2, '0')}-${lam.plantilla}.png`);
        await page.screenshot({ path: out });
        await page.close();
        total++;
      }
      console.log(`✓ ${pieza.id} (${pieza.laminas.length})`);
    }
  }
  await browser.close();
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(`${total} imágenes en ${path.relative(ROOT, SALIDA)}/`);
}

main().catch(e => { console.error(e.message); process.exit(1); });
