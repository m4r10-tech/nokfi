/**
 * marketing/redes/video/tarjetas.mjs — sesión 13: tarjetas animadas (terminal, flujo de
 * nodos, chat con un agente, cifras) para los vídeos de API, MCP y n8n. Se dibujan con
 * HTML/CSS en Chromium, fotograma a fotograma, y quedan como un clip más del guion.
 *
 * Uso (desde la raíz del repo, DESPUÉS de voz.mjs: cada tarjeta dura lo que su frase):
 *   PLAYWRIGHT_CORE=… node marketing/redes/video/tarjetas.mjs marketing/redes/video/guiones/<id>.json
 * Salida: salida/video/<id>/clips/t<n>.mp4 + t<n>.json (n = posición de la escena), 1080×1920.
 *
 * En el guion, una escena con tarjeta lleva "tarjeta" en vez de "clip":
 *   { "voz": "…", "tarjeta": { "tipo": "terminal", "titulo": "bash", "comando": "curl …", "respuesta": "{…}",
 *       "resalta": ["\"valid\""], "escrito": false, "zona": "alta" } }
 *   tipos: terminal (comando que se teclea + respuesta; sin "comando" es un archivo que se va mostrando),
 *          flujo    ({ nodos: [{ icono, t, s, nokfi }] }, nodos encadenados de arriba abajo),
 *          chat     ({ mensajes: [{ de: "yo" | "ia" | "tool", texto }], desde: n ya visibles }),
 *          datos    ({ lineas: [{ n, t }] }, cifras grandes una a una).
 *   zona: "alta" (por defecto; entre el gancho y los subtítulos) o "baja" (primera escena, bajo el gancho).
 *   pie: texto pequeño bajo la tarjeta. Los datos de las tarjetas deben ser reales (respuestas de la API).
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REDES = path.resolve(HERE, '..');
const PUBLIC = path.resolve(REDES, '../../frontend/public');
const W = 1080, H = 1920, FPS = 20;
const fuente = (f) => `data:font/woff2;base64,${fs.readFileSync(path.join(PUBLIC, 'fonts', f)).toString('base64')}`;

const CSS = `
  @font-face { font-family: J; src: url('${fuente('PlusJakartaSans-latin.woff2')}') format('woff2'); font-weight: 200 800; }
  @font-face { font-family: J; src: url('${fuente('PlusJakartaSans-latin-ext.woff2')}') format('woff2'); font-weight: 200 800; unicode-range: U+0100-024F; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: ${W}px; height: ${H}px; overflow: hidden; background: #0B0C0F; font-family: J, sans-serif; color: #fff; -webkit-font-smoothing: antialiased; }
  body { background: radial-gradient(1200px 900px at 50% 38%, #12233d 0%, #0B0C0F 62%); }
  .rejilla { position: absolute; inset: 0; background-image: linear-gradient(rgba(255,255,255,.035) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.035) 1px, transparent 1px); background-size: 60px 60px; }
  .marca { position: absolute; left: 60px; top: 232px; font-weight: 800; font-size: 38px; letter-spacing: -.02em; color: #8FB9EC; display: flex; gap: 14px; align-items: center; }
  .marca i { width: 14px; height: 14px; border-radius: 50%; background: #3B82F6; box-shadow: 0 0 18px #3B82F6; }
  .zona { position: absolute; left: 40px; width: 1000px; display: flex; flex-direction: column; justify-content: center; }
  .zona.alta { top: 310px; height: 880px; } .zona.baja { top: 820px; height: 380px; }
  .pie { margin-top: 22px; font-size: 28px; color: #7F8EA3; font-weight: 600; text-align: center; }

  .win { background: #0F1116; border: 2px solid #232834; border-radius: 28px; box-shadow: 0 30px 80px rgba(0,0,0,.6); overflow: hidden; }
  .win .bar { height: 68px; background: #171B23; display: flex; align-items: center; gap: 12px; padding: 0 26px; border-bottom: 2px solid #232834; }
  .win .bar i { width: 18px; height: 18px; border-radius: 50%; background: #FF5F57; } .win .bar i:nth-child(2) { background: #FEBC2E; } .win .bar i:nth-child(3) { background: #28C840; }
  .win .bar span { margin-left: 14px; font-size: 30px; color: #8B95A7; font-weight: 600; }
  .win pre { padding: 28px 26px 32px; font-family: 'DejaVu Sans Mono', 'Liberation Mono', monospace; line-height: 1.5; white-space: pre-wrap; word-break: break-all; color: #D7DEE9; }
  .win .l { display: block; border-radius: 8px; padding: 0 8px; margin: 0 -8px; }
  .win .l.hl { background: rgba(255, 212, 59, .18); box-shadow: inset 4px 0 0 #FFD43B; }
  .p { color: #28C840; } .k { color: #7CB7FF; } .s { color: #F2B880; } .n { color: #FFD43B; } .c { color: #6B7688; }
  .cur { display: inline-block; width: .6em; height: 1.05em; background: #D7DEE9; vertical-align: text-bottom; }

  .nodo { display: flex; align-items: center; gap: 28px; background: #12151C; border: 3px solid #252B38; border-radius: 30px; padding: 26px 32px; box-shadow: 0 18px 50px rgba(0,0,0,.45); }
  .nodo .ic { flex: none; width: 96px; height: 96px; border-radius: 24px; display: flex; align-items: center; justify-content: center; font-size: 50px; background: #1C2230; }
  .nodo b { display: block; font-size: 48px; font-weight: 800; letter-spacing: -.02em; } .nodo small { display: block; font-size: 33px; color: #9AA6B8; font-weight: 500; margin-top: 4px; }
  .nodo.nokfi { border-color: #3B82F6; background: linear-gradient(180deg, #132644, #101826); } .nodo.nokfi .ic { background: #1456A2; }
  .nodo.activo { border-color: #7CB7FF; box-shadow: 0 0 0 8px rgba(59,130,246,.22), 0 18px 50px rgba(0,0,0,.45); }
  .cable { width: 6px; margin: 0 auto; background: #252B38; position: relative; border-radius: 3px; }
  .cable u { position: absolute; left: 0; top: 0; width: 6px; background: #3B82F6; border-radius: 3px; }
  .cable s { position: absolute; left: -9px; width: 24px; height: 24px; border-radius: 50%; background: #BFE0FF; box-shadow: 0 0 22px #3B82F6; }
  .baja .nodo { padding: 14px 24px; border-radius: 22px; } .baja .nodo .ic { width: 64px; height: 64px; font-size: 34px; border-radius: 16px; } .baja .nodo b { font-size: 34px; } .baja .nodo small { display: none; }

  .chat { display: flex; flex-direction: column; justify-content: flex-end; gap: 22px; height: 100%; overflow: hidden; }
  .msg { max-width: 900px; padding: 24px 32px; border-radius: 34px; font-size: 46px; line-height: 1.3; font-weight: 600; }
  .msg.yo { align-self: flex-end; background: #1456A2; border-bottom-right-radius: 10px; }
  .msg.ia { align-self: flex-start; background: #1A1E27; border: 2px solid #272D3A; border-bottom-left-radius: 10px; }
  .msg.tool { align-self: flex-start; font-family: 'DejaVu Sans Mono', monospace; font-size: 34px; font-weight: 400; color: #8FE3A4; background: #0F1A14; border: 2px solid #1E3A2A; border-radius: 18px; padding: 16px 24px; }
  .msg b { color: #FFD43B; font-weight: 800; }

  .dato { display: flex; align-items: baseline; gap: 26px; margin: 16px 0; }
  .dato b { flex: none; min-width: 170px; text-align: right; font-size: 120px; font-weight: 800; letter-spacing: -.04em; color: #7CB7FF; line-height: 1; }
  .dato span { font-size: 52px; font-weight: 700; line-height: 1.15; }
`;

/** Código de la página: pintar(p, t) dibuja la tarjeta en el instante p (0-1) de su duración. */
const JS = `(() => {
  const T = window.TARJETA;
  const zona = document.querySelector('.zona');
  const clamp = (x) => Math.max(0, Math.min(1, x));
  const ease = (x) => 1 - Math.pow(1 - clamp(x), 3);
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const colorea = (l) => esc(l)
    .replace(/^(\\s*)("[^"]+")(\\s*:)/, '$1<span class="k">$2</span>$3')
    .replace(/(:\\s*)("[^"]*")/, '$1<span class="s">$2</span>')
    .replace(/(:\\s*)(-?\\d[\\d.]*|true|false|null)/, '$1<span class="n">$2</span>');
  const pintores = {
    terminal(p) {
      const cmd = T.comando || '', resp = (T.respuesta || '').split('\\n');
      const pc = T.escrito || !cmd ? 1 : clamp(p / 0.42);
      const ini = !cmd ? 0.04 : T.escrito ? 0.08 : 0.5, fin = !cmd ? 0.7 : T.escrito ? 0.6 : 0.82;
      const vis = Math.ceil(resp.length * clamp((p - ini) / (fin - ini)));
      const escrito = cmd.slice(0, Math.round(cmd.length * pc));
      let h = '';
      if (cmd) h += '<span class="l"><span class="p">$</span> ' + esc(escrito).replace(/(\\\\\\n)/g, '$1') + (pc < 1 || (p * 6 % 1 < 0.5 && vis === 0) ? '<span class="cur"></span>' : '') + '</span>';
      const marcar = p > fin + 0.06;
      for (const l of resp.slice(0, vis)) {
        const hl = marcar && (T.resalta || []).some(r => l.includes(r));
        h += '<span class="l' + (hl ? ' hl' : '') + '">' + (cmd || T.json ? colorea(l) : esc(l)) + '</span>';
      }
      zona.querySelector('pre').innerHTML = h;
    },
    flujo(p) {
      const ns = [...zona.querySelectorAll('.nodo')], cs = [...zona.querySelectorAll('.cable')];
      const n = ns.length, paso = 0.72 / n;
      ns.forEach((el, i) => {
        const a = ease((p - i * paso) / (paso * 0.6));
        el.style.opacity = a; el.style.transform = 'translateY(' + (1 - a) * 40 + 'px)';
        el.classList.toggle('activo', p >= i * paso + paso * 0.5 && (i === n - 1 ? p < 0.86 : p < (i + 1) * paso + paso * 0.5));
      });
      cs.forEach((el, i) => {
        const a = clamp((p - (i * paso + paso * 0.55)) / (paso * 0.45));
        el.style.opacity = p > i * paso ? 1 : 0;
        el.querySelector('u').style.height = a * 100 + '%';
        const s = el.querySelector('s'); s.style.top = 'calc(' + a * 100 + '% - 12px)'; s.style.opacity = a > 0 && a < 1 ? 1 : 0;
      });
    },
    chat(p) {
      const ms = [...zona.querySelectorAll('.msg')], d = T.desde || 0, nuevos = ms.length - d, paso = 0.8 / Math.max(1, nuevos);
      ms.forEach((el, i) => {
        if (i < d) { el.style.display = ''; return; }
        const q = (p - 0.04 - (i - d) * paso) / paso;
        el.style.display = q > 0 ? '' : 'none';
        const a = ease(q / 0.25); el.style.opacity = a; el.style.transform = 'translateY(' + (1 - a) * 30 + 'px)';
        if (el.classList.contains('ia')) { const full = el.dataset.t; el.innerHTML = full.slice(0, Math.round(full.length * clamp(q / 0.85))).replace(/\\*\\*(.+?)\\*\\*/g, '<b>$1</b>').replace(/\\*\\*/g, ''); }
      });
    },
    datos(p) {
      const ds = [...zona.querySelectorAll('.dato')], paso = 0.75 / ds.length;
      ds.forEach((el, i) => {
        const q = (p - 0.03 - i * paso) / (paso * 0.6), a = ease(q);
        el.style.opacity = a; el.style.transform = 'translateX(' + (1 - a) * -60 + 'px)';
        const b = el.querySelector('b'), fin = b.dataset.n;
        b.textContent = /^\\d+$/.test(fin) ? String(Math.round(+fin * ease(q))) : fin;
      });
    }
  };
  window.pintar = (p) => pintores[T.tipo](p);
})();`;

const esc = (x) => String(x).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const negrita = (x) => esc(x).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');

function cuerpo(t) {
  if (t.tipo === 'terminal') return `<div class="win"><div class="bar"><i></i><i></i><i></i><span>${esc(t.titulo || 'bash')}</span></div><pre style="font-size:${t.tam || 38}px"></pre></div>`;
  if (t.tipo === 'flujo') {
    const alto = t.zona === 'baja' ? 26 : Math.max(34, Math.min(90, Math.floor((860 - t.nodos.length * 152) / Math.max(1, t.nodos.length - 1))));
    return t.nodos.map((n, i) => `${i ? `<div class="cable" style="height:${alto}px"><u></u><s></s></div>` : ''}<div class="nodo${n.nokfi ? ' nokfi' : ''}"><div class="ic">${esc(n.icono || '•')}</div><div><b>${esc(n.t)}</b><small>${esc(n.s || '')}</small></div></div>`).join('');
  }
  if (t.tipo === 'chat') return `<div class="chat">${t.mensajes.map(m => `<div class="msg ${m.de}" data-t="${esc(m.texto)}">${negrita(m.texto)}</div>`).join('')}</div>`;
  if (t.tipo === 'datos') return t.lineas.map(l => `<div class="dato"><b data-n="${esc(l.n)}">${esc(l.n)}</b><span>${negrita(l.t)}</span></div>`).join('');
  throw new Error(`Tipo de tarjeta desconocido: ${t.tipo}`);
}

const pagina = (t) => `<!doctype html><html><head><meta charset="utf-8"><style>${CSS}</style></head><body><div class="rejilla"></div>
<div class="marca"><i></i>${esc(t.rotulo || 'nokfi · desarrolladores')}</div>
<div class="zona ${t.zona === 'baja' ? 'baja' : 'alta'}">${cuerpo(t)}${t.pie ? `<div class="pie">${esc(t.pie)}</div>` : ''}</div>
<script>window.TARJETA = ${JSON.stringify(t).replace(/</g, '\\u003c')};${JS}</script></body></html>`;

/** Duración de cada escena, igual que la calcula montar.mjs (inicio de su frase → inicio de la siguiente). */
function duraciones(g) {
  const frases = [...g.escenas.map(e => e.voz), g.cierre?.voz].filter(Boolean);
  const tj = path.join(HERE, 'voz', `${g.id}.tiempos.json`);
  let tramos;
  if (fs.existsSync(tj)) tramos = JSON.parse(fs.readFileSync(tj, 'utf8')).tiempos;
  if (!tramos || tramos.length !== frases.length) {
    let t = 0.15;
    tramos = frases.map(f => { const d = Math.max(1.6, f.replace(/\*\*/g, '').split(/\s+/).length * 0.36 + 0.45); const tr = [t, t + d - 0.15]; t += d; return tr; });
  }
  const inicios = tramos.map((tr, i) => (i === 0 ? 0 : tr[0]));
  const fin = tramos.at(-1)[1] + (g.cierre ? 1.4 : 0.6);
  return inicios.map((s, i) => (inicios[i + 1] ?? fin) - s);
}

async function main() {
  const guionPath = process.argv[2];
  if (!guionPath) throw new Error('Uso: node marketing/redes/video/tarjetas.mjs <guion.json>');
  const g = JSON.parse(fs.readFileSync(guionPath, 'utf8'));
  const dir = path.join(REDES, 'salida/video', g.id, 'clips');
  fs.mkdirSync(dir, { recursive: true });
  const durs = duraciones(g);
  const require = createRequire(import.meta.url);
  const { chromium } = require(process.env.PLAYWRIGHT_CORE || 'playwright-core');
  const CHROME = fs.readdirSync(path.join(os.homedir(), '.cache/ms-playwright'))
    .filter(d => /^chromium-\d+$/.test(d)).sort().map(d => path.join(os.homedir(), '.cache/ms-playwright', d, 'chrome-linux64/chrome'))
    .find(f => fs.existsSync(f));
  const browser = await chromium.launch({ executablePath: CHROME });
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  for (const [i, e] of g.escenas.entries()) {
    if (!e.tarjeta) continue;
    const d = durs[i] + 0.3, n = Math.ceil(d * FPS);
    await page.setContent(pagina(e.tarjeta));
    await page.evaluate(() => document.fonts.ready);
    const destino = path.join(dir, `t${i}.mp4`);
    const ff = spawn('ffmpeg', ['-v', 'error', '-y', '-f', 'image2pipe', '-framerate', String(FPS), '-i', '-', '-vf', 'fps=30,format=yuv420p',
      '-c:v', 'libx264', '-crf', '10', '-preset', 'veryfast', destino], { stdio: ['pipe', 'inherit', 'inherit'] });
    const hecho = new Promise((res, rej) => ff.on('close', c => (c === 0 ? res() : rej(new Error(`ffmpeg ${c}`)))));
    for (let f = 0; f < n; f++) {
      // La animación se completa algo antes de que acabe la frase y se queda quieta.
      await page.evaluate((p) => window.pintar(p), Math.min(1, (f / FPS) / Math.max(0.5, durs[i] * (e.tarjeta.ritmo || 0.9))));
      const png = await page.screenshot({ type: 'png' });
      if (!ff.stdin.write(png)) await new Promise(r => ff.stdin.once('drain', r));
    }
    ff.stdin.end();
    await hecho;
    fs.writeFileSync(path.join(dir, `t${i}.json`), JSON.stringify({ inicio: 0, fin: +d.toFixed(3), marcas: {} }));
    console.log(`✓ tarjeta t${i} · ${e.tarjeta.tipo} · ${d.toFixed(1)} s`);
  }
  await browser.close();
}

main().catch((e) => { console.error(e.message || e); process.exit(1); });
