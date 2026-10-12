/**
 * marketing/redes/video/herramientas/montar.mjs — sesión 13: edita un vídeo vertical para
 * TikTok/Reels a partir de un guion, los clips grabados de la app y, si están,
 * la voz (grabada por una persona) y la música.
 *
 * Uso (desde la raíz del repo, después de backend/scripts/redes-clips.js):
 *   PLAYWRIGHT_CORE=… node marketing/redes/video/herramientas/montar.mjs marketing/redes/video/guiones/<id>.json
 *
 * Entrada:
 *   guion           escenas (clip + marca + frase de la voz), gancho y cierre
 *   salida/video/<id>/clips/*.mp4|json   grabaciones de la app (redes-clips.js)
 *   video/voz/<id>.(wav|m4a|mp3|ogg|opus)  voz leída del guion, con una pausa
 *                                         clara entre frases (opcional)
 *   video/recursos/musica/<archivo>                 "musica" del guion o la primera de la
 *                                         carpeta (opcional; con licencia de uso)
 * Salida (lista para buffer.mjs, pieza = <id>):
 *   salida/<id>/video.mp4       1080×1920, 30 fps, H.264 (~12 Mb/s) + AAC, −14 LUFS
 *   salida/<id>/01-portada.png  portada con el gancho
 *   salida/<id>/subtitulos.srt  por si se quieren subir aparte
 *
 * Sin voz, cada frase dura según sus palabras y sale solo como subtítulo.
 *
 * Escena: { clip, marca, voz (o "tarjeta" en vez de clip: ver tarjetas.mjs), congelar?, desplaza? (s), zoomInicial? (1, plano fijo más cerca), zoom? (0 = sin
 *   movimiento), x?, y? (0-1) }. Texto en pantalla dibujado con HTML/CSS (ver CSS abajo).
 */

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import os from 'node:os';

const HERE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');   // marketing/redes/video
const REDES = path.resolve(HERE, '..');
const SALIDA = path.join(REDES, 'salida');
const FUENTES = path.join(HERE, 'recursos/fuentes');
const W = 1080, H = 1920, FPS = 30;
const PUBLIC = path.resolve(REDES, '../../frontend/public');
// Franja de los subtítulos: por encima del texto de la publicación de TikTok y
// lejos de los botones de la derecha (zonas seguras, MANUAL.md §3).
const SUB_Y = 1230, SUB_H = 440, GANCHO_Y = 270;

const sh = (cmd, args, opts = {}) => execFileSync(cmd, args, { encoding: 'utf8', maxBuffer: 1 << 26, ...opts });
const dur = (f) => +sh('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]).trim();

/** «**palabra**» → tokens { w, clave }. */
function palabras(frase) {
  const out = [];
  let clave = false;
  for (const parte of frase.split(/(\*\*)/)) {
    if (parte === '**') { clave = !clave; continue; }
    for (const w of parte.split(/\s+/).filter(Boolean)) {
      // «**octubre**?» → la interrogación va pegada a «octubre», no suelta.
      if (/^[.,:;?!…)»]+$/.test(w) && out.length) out[out.length - 1].w += w;
      else out.push({ w, clave });
    }
  }
  return out;
}

/** Trozos de 1-3 palabras, cortando tras puntuación: lo que se lee de un golpe. */
function trozos(frase) {
  const ws = palabras(frase);
  const res = [];
  let cur = [];
  for (const t of ws) {
    cur.push(t);
    const largo = cur.map(x => x.w).join(' ').length;
    if (cur.length >= 3 || /[.,:;?!…]$/.test(t.w) || largo > 16) { res.push(cur); cur = []; }
  }
  if (cur.length) res.push(cur);
  return res;
}

const limpio = (s) => s.replace(/\*\*/g, '');
const segundosLectura = (frase) => Math.max(1.6, palabras(frase).length * 0.36 + 0.45);

/** Tramos con voz (silencedetect), agrupados en tantas frases como tiene el guion. */
function tramosDeVoz(vozPath, n) {
  const texto = spawnSync('ffmpeg', ['-hide_banner', '-i', vozPath, '-af', 'silencedetect=noise=-38dB:d=0.32', '-f', 'null', '-'], { encoding: 'utf8' }).stderr || '';
  const total = dur(vozPath);
  const silencios = [];
  let ini = null;
  for (const l of texto.split('\n')) {
    const a = l.match(/silence_start: ([\d.]+)/); if (a) ini = +a[1];
    const b = l.match(/silence_end: ([\d.]+)/); if (b && ini !== null) { silencios.push([ini, +b[1]]); ini = null; }
  }
  // Tramos hablados = huecos entre silencios.
  let tramos = [];
  let t = 0;
  for (const [s, e] of silencios) { if (s - t > 0.15) tramos.push([t, s]); t = e; }
  if (total - t > 0.15) tramos.push([t, total]);
  // Une los tramos separados por los silencios más cortos hasta tener n.
  while (tramos.length > n) {
    let k = 0, min = Infinity;
    for (let i = 0; i < tramos.length - 1; i++) { const g = tramos[i + 1][0] - tramos[i][1]; if (g < min) { min = g; k = i; } }
    tramos.splice(k, 2, [tramos[k][0], tramos[k + 1][1]]);
  }
  return { tramos: tramos.length === n ? tramos : null, total };
}

const tiempoSrt = (s) => {
  const ms = Math.round(s * 1000), h = Math.floor(ms / 3600000), m = Math.floor(ms / 60000) % 60, sec = Math.floor(ms / 1000) % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')},${String(ms % 1000).padStart(3, '0')}`;
};
/* ── Texto en pantalla dibujado con HTML/CSS (Chromium), con transparencia ── */
// Tipografía incrustada: Chromium no carga fuentes file:// en una página sin origen.
const fuente = (f) => `data:font/woff2;base64,${fs.readFileSync(path.join(PUBLIC, 'fonts', f)).toString('base64')}`;
const CSS = `
  @font-face { font-family: J; src: url('${fuente('PlusJakartaSans-latin.woff2')}') format('woff2'); font-weight: 200 800; }
  @font-face { font-family: J; src: url('${fuente('PlusJakartaSans-latin-ext.woff2')}') format('woff2'); font-weight: 200 800; unicode-range: U+0100-024F; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { background: transparent; width: ${W}px; }
  .lienzo { width: ${W}px; display: flex; align-items: center; justify-content: center; font-family: J, sans-serif; -webkit-font-smoothing: antialiased; }
  .sub { max-width: 920px; text-align: center; font-weight: 800; font-size: 82px; line-height: 1.16; letter-spacing: -0.015em; color: #fff;
    background: rgba(10, 11, 14, 0.80); padding: 24px 38px 28px; border-radius: 30px;
    box-shadow: 0 14px 44px rgba(0,0,0,.45), inset 0 0 0 1.5px rgba(255,255,255,.08); }
  .w { display: inline; border-radius: 12px; }
  .w.clave { color: #FFD43B; }
  /* Palabra que se está diciendo: fondo azul Nokfi sin mover el texto (box-shadow no cambia el tamaño). */
  .w.ahora { background: #1456A2; box-shadow: 0 0 0 9px #1456A2; color: #fff; }
  .w.ahora.clave { color: #FFE27A; }
  .gancho { max-width: 960px; text-align: center; font-weight: 800; font-size: 94px; line-height: 1.08; letter-spacing: -0.025em; color: #fff;
    background: linear-gradient(180deg, #1A63B8, #1456A2); padding: 30px 46px 36px; border-radius: 36px;
    box-shadow: 0 20px 60px rgba(0,0,0,.5), inset 0 0 0 2px rgba(255,255,255,.14); }
  .gancho b { color: #BFE0FF; font-weight: 800; }
`;
const esc = (x) => String(x).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Dibuja cada estado de subtítulo (trozo + palabra activa) y el gancho como PNG transparentes. */
async function dibujarTextos(estados, gancho, tmp) {
  const require = createRequire(import.meta.url);
  const { chromium } = require(process.env.PLAYWRIGHT_CORE || 'playwright-core');
  const CHROME = fs.readdirSync(path.join(os.homedir(), '.cache/ms-playwright'))
    .filter(d => /^chromium-\d+$/.test(d)).sort().map(d => path.join(os.homedir(), '.cache/ms-playwright', d, 'chrome-linux64/chrome'))
    .find(f => fs.existsSync(f));
  const browser = await chromium.launch({ executablePath: CHROME });
  const page = await browser.newPage({ viewport: { width: W, height: SUB_H } });
  const pintar = async (inner, alto, archivo) => {
    await page.setViewportSize({ width: W, height: alto });
    await page.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>${CSS}</style></head><body><div class="lienzo" style="height:${alto}px">${inner}</div></body></html>`);
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: archivo, omitBackground: true });
  };
  await pintar('', SUB_H, path.join(tmp, 'vacio.png'));
  for (const [i, e] of estados.entries()) {
    const words = e.tokens.map((t, k) => `<span class="w${t.clave ? ' clave' : ''}${k === e.activa ? ' ahora' : ''}">${esc(t.w)}</span>`).join(' ');
    e.png = path.join(tmp, `sub-${String(i).padStart(4, '0')}.png`);
    await pintar(`<div class="sub">${words}</div>`, SUB_H, e.png);
  }
  let ganchoPng = null;
  if (gancho) {
    ganchoPng = path.join(tmp, 'gancho.png');
    const inner = palabras(gancho).map(t => (t.clave ? `<b>${esc(t.w)}</b>` : esc(t.w))).join(' ');
    await pintar(`<div class="gancho">${inner}</div>`, 520, ganchoPng);
  }
  await browser.close();
  return ganchoPng;
}

async function main() {
  const guionPath = process.argv[2];
  if (!guionPath) throw new Error('Uso: node marketing/redes/video/herramientas/montar.mjs <guion.json>');
  const g = JSON.parse(fs.readFileSync(guionPath, 'utf8'));
  const clipsDir = path.join(SALIDA, 'video', g.id, 'clips');
  const out = path.join(SALIDA, g.id);
  const tmp = path.join(SALIDA, 'video', g.id, 'tmp');
  fs.mkdirSync(out, { recursive: true });
  fs.mkdirSync(tmp, { recursive: true });

  const frases = [...g.escenas.map(e => e.voz), g.cierre?.voz].filter(Boolean);
  const vozPath = ['wav', 'm4a', 'mp3', 'ogg', 'opus'].map(e => path.join(HERE, 'voz', `${g.id}.${e}`)).find(f => fs.existsSync(f));
  const musDir = path.join(HERE, 'recursos/musica');
  // MUSICA=<archivo> y SUFIJO=<texto> permiten probar varias pistas sin tocar el guion.
  const musPath = process.env.MUSICA ? path.join(musDir, process.env.MUSICA) : g.musica ? path.join(musDir, g.musica)
    : (fs.existsSync(musDir) ? fs.readdirSync(musDir).filter(n => /\.(mp3|m4a|wav|ogg)$/.test(n)).sort().map(n => path.join(musDir, n))[0] : null);

  // ── Tiempos de cada frase ──
  let tramos, vozTotal = 0;
  if (vozPath) {
    // partir_audio.py deja los tiempos exactos de cada frase; una voz grabada se corta por silencios.
    const tj = vozPath.replace(/\.\w+$/, '.tiempos.json');
    const exactos = fs.existsSync(tj) ? JSON.parse(fs.readFileSync(tj, 'utf8')).tiempos : null;
    const r = exactos?.length === frases.length ? { tramos: exactos, total: dur(vozPath) } : tramosDeVoz(vozPath, frases.length);
    vozTotal = r.total;
    if (r.tramos) tramos = r.tramos;
    else console.warn(`⚠️  La voz no tiene ${frases.length} pausas claras: reparto el tiempo por longitud de frase.`);
    if (!tramos) {
      const pesos = frases.map(f => limpio(f).length);
      const suma = pesos.reduce((a, b) => a + b, 0);
      let t = 0;
      tramos = pesos.map(p => { const d = (p / suma) * vozTotal; const tr = [t, t + d]; t += d; return tr; });
    }
  } else {
    let t = 0.15;
    tramos = frases.map(f => { const d = segundosLectura(f); const tr = [t, t + d - 0.15]; t += d; return tr; });
  }
  // Escena i: desde el inicio de su frase (la primera desde 0) hasta el de la siguiente.
  const inicios = tramos.map((tr, i) => (i === 0 ? 0 : tr[0]));
  const finTotal = Math.max(tramos.at(-1)[1] + (g.cierre ? 1.4 : 0.6), vozTotal);
  const durs = inicios.map((s, i) => +(((inicios[i + 1] ?? finTotal) - s)).toFixed(3));

  // ── Subtítulos: trozos repartidos por longitud dentro de cada tramo ──
  const lineas = frases.map((f, i) => {
    const [a, b] = tramos[i];
    const ts = trozos(f);
    const pesos = ts.map(c => c.map(t => t.w).join(' ').length + 3);
    const suma = pesos.reduce((x, y) => x + y, 0);
    let t = a;
    return { cierre: !!g.cierre?.voz && i === frases.length - 1, chunks: ts.map((c, k) => { const d = (pesos[k] / suma) * (b - a); const ch = { tokens: c, ini: t, fin: t + d }; t += d; return ch; }) };
  });
  // Estados del subtítulo: cada trozo, con la palabra que se está diciendo resaltada.
  const estados = [];
  for (const l of lineas) {
    if (l.cierre) continue; // la tarjeta final ya lo dice en grande
    for (const c of l.chunks) {
      const pesos = c.tokens.map(t => t.w.length + 1);
      const suma = pesos.reduce((x, y) => x + y, 0);
      let t = c.ini;
      c.tokens.forEach((_, k) => { const d = (pesos[k] / suma) * (c.fin - c.ini); estados.push({ tokens: c.tokens, activa: k, ini: t, fin: t + d }); t += d; });
    }
  }
  const ganchoPng = await dibujarTextos(estados, g.gancho, tmp);
  // Pista de subtítulos con transparencia: cada estado dura lo suyo; los huecos, en blanco.
  const listaSubs = [];
  let cursor = 0;
  for (const e of estados) {
    if (e.ini - cursor > 0.01) listaSubs.push(`file '${path.join(tmp, 'vacio.png')}'\nduration ${(e.ini - cursor).toFixed(3)}`);
    listaSubs.push(`file '${e.png}'\nduration ${(e.fin - Math.max(e.ini, cursor)).toFixed(3)}`);
    cursor = e.fin;
  }
  listaSubs.push(`file '${path.join(tmp, 'vacio.png')}'\nduration ${Math.max(0.1, finTotal - cursor).toFixed(3)}`, `file '${path.join(tmp, 'vacio.png')}'`);
  fs.writeFileSync(path.join(tmp, 'subs.txt'), listaSubs.join('\n') + '\n');
  const subsMov = path.join(tmp, 'subs.mov');
  sh('ffmpeg', ['-v', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', path.join(tmp, 'subs.txt'), '-vf', `fps=${FPS},format=rgba`, '-c:v', 'png', subsMov]);
  let n = 0;
  fs.writeFileSync(path.join(out, 'subtitulos.srt'), lineas.flatMap(l => l.chunks).map(c =>
    `${++n}\n${tiempoSrt(c.ini)} --> ${tiempoSrt(c.fin)}\n${c.tokens.map(t => t.w).join(' ')}\n`).join('\n'));

  // ── Tarjeta de cierre (plantilla de imagen de la casa) ──
  let cierrePng = null;
  if (g.cierre) {
    const pieza = [{ id: `${g.id}-cierre-tmp`, formato: 'vertical', tema: 'azul', laminas: [{
      plantilla: 'cierre', titulo: g.cierre.titulo || 'Tus números, **claros**.', texto: g.cierre.texto || 'nokfi.app',
      boton: g.cierre.boton || 'Pruébalo gratis 14 días', aviso: 'Enlace en la bio · Información orientativa', pie: '' }] }];
    const jf = path.join(tmp, 'cierre.json');
    fs.writeFileSync(jf, JSON.stringify(pieza));
    sh('node', [path.join(REDES, 'plantillas/render.mjs'), jf], { env: process.env });
    const src = path.join(SALIDA, `${g.id}-cierre-tmp`, '01-cierre.png');
    cierrePng = path.join(tmp, 'cierre.png');
    fs.copyFileSync(src, cierrePng);
    fs.rmSync(path.dirname(src), { recursive: true, force: true });
  }

  // ── Vídeo: un recorte de clip por escena, acercamiento suave, cortes secos ──
  const args = ['-v', 'error', '-y'];
  const filtros = [];
  const etiquetas = [];
  g.escenas.forEach((e, i) => {
    // Escena con tarjeta animada (tarjetas.mjs): su clip es t<posición> y ya mide 1080×1920.
    const clip = e.tarjeta ? `t${i}` : e.clip;
    // Los planos de la app que no estén grabados para este guion se toman de la biblioteca común (guiones/_biblio.json).
    const dirClip = fs.existsSync(path.join(clipsDir, `${clip}.json`)) ? clipsDir : path.join(SALIDA, 'video', '_biblio', 'clips');
    const meta = JSON.parse(fs.readFileSync(path.join(dirClip, `${clip}.json`), 'utf8'));
    const desde = Math.max(0, (e.marca ? meta.marcas[e.marca] : meta.inicio) + (e.desplaza || 0));
    const d = durs[i];
    // congelar: el fotograma de la marca se queda fijo (solo el acercamiento lento).
    args.push('-ss', desde.toFixed(3), '-t', (e.congelar ? 0.1 : d + 0.5).toFixed(3), '-i', path.join(dirClip, `${clip}.mp4`));
    const z = e.zoom ?? 0;               // plano estable; >0 solo si una escena lo pide
    const z0 = e.zoomInicial ?? 1;       // 1 = ancho completo del móvil
    const cy = e.y ?? 0;                 // 0 arriba … 1 abajo (de lo que sobra del alto)
    const cx = e.x ?? 0.5;
    filtros.push(`[${i}:v]tpad=stop_mode=clone:stop_duration=${d.toFixed(3)},trim=duration=${d.toFixed(3)},setpts=PTS-STARTPTS,`
      + `scale=w='trunc(${W}*(${z0}+${z}*t/${d.toFixed(3)})/2)*2':h=-2:eval=frame:flags=lanczos,`
      + `crop=${W}:${H}:x='(iw-${W})*${cx}':y='(ih-${H})*${cy}',setsar=1,fps=${FPS},format=yuv420p[v${i}]`);
    etiquetas.push(`[v${i}]`);
  });
  let idx = g.escenas.length;
  if (cierrePng) {
    const d = durs.at(-1);
    args.push('-loop', '1', '-t', d.toFixed(3), '-i', cierrePng);
    filtros.push(`[${idx}:v]scale=${W}:${H},setsar=1,fps=${FPS},format=yuv420p,fade=t=in:st=0:d=0.18[v${idx}]`);
    etiquetas.push(`[v${idx}]`);
    idx++;
  }
  filtros.push(`${etiquetas.join('')}concat=n=${etiquetas.length}:v=1:a=0[vc]`);
  // Capas de texto: subtítulos (pista con alfa) y gancho los primeros 2,8 s.
  args.push('-i', subsMov);
  filtros.push(`[vc][${idx}:v]overlay=0:${SUB_Y}:format=auto:shortest=0[vs]`);
  idx++;
  if (ganchoPng) {
    args.push('-loop', '1', '-t', '2.8', '-i', ganchoPng);
    filtros.push(`[${idx}:v]format=rgba,fade=t=in:st=0:d=0.14:alpha=1,fade=t=out:st=2.5:d=0.3:alpha=1[gch]`,
      `[vs][gch]overlay=0:${GANCHO_Y}:eof_action=pass:format=auto[vout]`);
    idx++;
  } else filtros.push('[vs]null[vout]');
  // "barra": true → barra de progreso fina arriba (ritmo de vídeo editado).
  let vmap = '[vout]';
  if (g.barra) {
    filtros.push(`color=c=0x3B82F6:s=${W}x10:r=${FPS}:d=${finTotal.toFixed(3)}[bar]`, `[vout][bar]overlay=x='-w+w*t/${finTotal.toFixed(3)}':y=0:shortest=0[voutb]`);
    vmap = '[voutb]';
  }

  // ── Audio: voz al frente; música debajo y más baja cuando habla la voz ──
  let audio = null;
  if (vozPath) { args.push('-i', vozPath); filtros.push(`[${idx}:a]aresample=48000,highpass=f=80,loudnorm=I=-16:TP=-1.5:LRA=9,apad=whole_dur=${finTotal.toFixed(3)}[voz]`); idx++; }
  if (musPath) {
    args.push('-stream_loop', '-1', '-i', musPath);
    filtros.push(`[${idx}:a]aresample=48000,atrim=duration=${finTotal.toFixed(3)},volume=${vozPath ? '-17dB' : '-9dB'},afade=t=in:d=0.6,afade=t=out:st=${(finTotal - 1.2).toFixed(3)}:d=1.2[mus]`);
    idx++;
  }
  if (vozPath && musPath) {
    filtros.push('[voz]asplit=2[voz1][voz2]', '[mus][voz1]sidechaincompress=threshold=0.02:ratio=10:attack=15:release=350[musb]',
      '[voz2][musb]amix=inputs=2:duration=first:normalize=0,loudnorm=I=-14:TP=-1:LRA=11[aout]');
    audio = '[aout]';
  } else if (vozPath) { filtros.push('[voz]loudnorm=I=-14:TP=-1:LRA=11[aout]'); audio = '[aout]'; }
  else if (musPath) { filtros.push('[mus]loudnorm=I=-14:TP=-1:LRA=11[aout]'); audio = '[aout]'; }
  else { args.push('-f', 'lavfi', '-t', finTotal.toFixed(3), '-i', 'anullsrc=r=48000:cl=stereo'); audio = `${idx}:a`; idx++; }

  const video = path.join(out, process.env.SUFIJO ? `video-${process.env.SUFIJO}.mp4` : 'video.mp4');
  args.push('-filter_complex', filtros.join(';'), '-map', vmap, '-map', audio,
    '-t', finTotal.toFixed(3), // CRF: la prueba del 2026-10-11 con un original de ~5 Mb/s no cambió lo que sirve TikTok (576×1024), así que se
    // vuelve a un archivo ligero y rápido de montar.
    '-c:v', 'libx264', '-profile:v', 'high', '-crf', '17', '-preset', 'veryfast', '-tune', 'animation', '-pix_fmt', 'yuv420p', '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709',
    '-r', String(FPS), '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-movflags', '+faststart', video);
  sh('ffmpeg', args);

  // Portada: fotograma con el gancho ya en pantalla.
  if (!process.env.SUFIJO) sh('ffmpeg', ['-v', 'error', '-y', '-ss', '0.9', '-i', video, '-frames:v', '1', path.join(out, '01-portada.png')]);
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(`✓ ${path.relative(path.resolve(REDES, '../..'), video)} · ${finTotal.toFixed(1)} s · voz: ${vozPath ? path.basename(vozPath) : 'no'} · música: ${musPath ? path.basename(musPath) : 'no'}`);
}

main().catch((e) => { console.error(e.message || e); process.exit(1); });
