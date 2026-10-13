#!/usr/bin/env node
/**
 * marketing/redes/video/herramientas/editor.mjs — sesión 13: montador de la etapa 2 (edición «de encargo»).
 *
 * Teléfono enmarcado con aire a los lados, cámara que se acerca a lo que se nombra, rótulos con muelle, secciones a
 * pantalla completa, subtítulos pequeños palabra a palabra, efectos de sonido y música bajo la voz.
 * Cada fotograma se dibuja en editor-pagina.html en función del tiempo (Chromium sin cabeza) y se une con ffmpeg.
 *
 * Uso (desde la raíz del repo, con la voz ya cortada por partir_audio.py):
 *   PLAYWRIGHT_CORE=… node marketing/redes/video/herramientas/editor.mjs marketing/redes/video/guiones/<id>.json [--foto 12.5] [--desde s --hasta s] [--rehacer-cierre] [--rehacer-sonido]
 *   --rehacer-cierre  solo redibuja la última escena y la empalma con el vídeo existente
 *   --foto t        solo guarda el fotograma del segundo t en salida/_registro/<id>-<t>.png (para revisar el diseño)
 * Salida: salida/PARA-SUBIR/<carpeta>/ video.mp4 · portada.png · texto.txt · titulo.txt
 *
 * Guion: { id, carpeta, titulo, texto, musica, ritmo: "sereno|medio|vivo", transicion: "lateral|vertical|empuje|corte",
 *   escenas: [ { tipo: "titulo|cifra|pregunta|seccion|app|dato|duo|paso|mito|prueba|caso|codigo|partida|lista|cierre", frases: [desde, hasta],
 *   tag, titulo, planos: [ { clip, desde: s | { marca, mas }, peso, foco: [x, y] (0-1 en la pantalla de la app), zoom, suelta } ],
 *   rotulos: [ { texto, en: 0-1 (momento dentro de la escena), y, lado, plano (se va con ese plano) } ], … } ] }
 * Se para solo si el equipo pasa de 72 °C y sigue al bajar de 62 °C.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const VIDEO = path.resolve(AQUI, '..');
const SALIDA = path.resolve(VIDEO, '../salida');
const BIBLIO = path.join(SALIDA, 'video/_biblio/clips');
const FPS = 30, OFFSET = 0.3, COLA = 1.6;
// Velocidad del montaje (método, documento 05, mando E): transición, arranque y duración del acercamiento, y tamaño del trozo de subtítulo.
const RITMOS = { sereno: { tr: 0.55, zIni: 0.6, zDur: 1.0, trozo: 3, letras: 22 }, medio: { tr: 0.42, zIni: 0.45, zDur: 0.8, trozo: 3, letras: 19 }, vivo: { tr: 0.28, zIni: 0.22, zDur: 0.45, trozo: 2, letras: 15 } };
const sh = (c, a, o = {}) => execFileSync(c, a, { stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 1 << 28, ...o });
const dur = (f) => parseFloat(sh('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]).toString());
const espera = (ms) => new Promise(r => setTimeout(r, ms));
const temperatura = () => Math.max(0, ...fs.readdirSync('/sys/class/thermal').map(z => { try { return +fs.readFileSync(`/sys/class/thermal/${z}/temp`, 'utf8') / 1000; } catch { return 0; } }));
async function enfriar() { if (temperatura() >= 72) { while (temperatura() > 62) await espera(4000); } }

const args = process.argv.slice(2);
const opcion = (n) => args.includes(n) ? +args[args.indexOf(n) + 1] : null;
const g = JSON.parse(fs.readFileSync(args[0], 'utf8'));
const voz = path.join(VIDEO, 'voz', `${g.id}.wav`);
const T = JSON.parse(fs.readFileSync(voz.replace('.wav', '.tiempos.json'), 'utf8'));
const tiempos = T.tiempos.map(([a, b]) => [a + OFFSET, b + OFFSET]);
const total = tiempos.at(-1)[1] + COLA;
const RITMO = RITMOS[g.ritmo || 'medio'];
if (!RITMO) throw new Error(`ritmo desconocido: ${g.ritmo} (sereno, medio, vivo)`);
if (!['lateral', 'vertical', 'empuje', 'corte'].includes(g.transicion || 'lateral')) throw new Error(`transición desconocida: ${g.transicion}`);
const tmp = path.join(SALIDA, '_registro', `.editor-${g.id}`);
fs.rmSync(tmp, { recursive: true, force: true });
fs.mkdirSync(tmp, { recursive: true });

// ── Escenas con sus tiempos (cada una empieza un poco antes de su primera frase) ──
const escenas = g.escenas.map((e, k) => ({ ...e, ini: k === 0 ? 0 : +(tiempos[e.frases[0]][0] - 0.14).toFixed(3) }));
escenas.forEach((e, k) => { e.fin = k + 1 < escenas.length ? escenas[k + 1].ini : total; });
const efectos = [];   // [segundo, tipo]
for (const [k, e] of escenas.entries()) {
  if (k) efectos.push([e.ini, e.tipo === 'seccion' ? 'barrido' : 'paso']);
  if (e.cambio != null) { e.cambio = tiempos[e.cambio][0] - 0.1; efectos.push([e.cambio, 'paso']); }
  for (const r of e.rotulos || []) { r.t = +(e.ini + r.en * (e.fin - e.ini)).toFixed(3); efectos.push([r.t, 'pop']); }
  if (e.tipo === 'cierre') efectos.push([e.ini + 0.1, 'campana']);
  // «Dos casos»: cada caso es un plano que dura toda la escena.
  for (const [i, c] of (e.casos || []).entries()) {
    c.ini = e.ini; c.fin = e.fin;
    const meta = JSON.parse(fs.readFileSync(path.join(BIBLIO, `${c.clip}.json`), 'utf8'));
    const desde = typeof c.desde === 'object' ? meta.marcas[c.desde.marca] + (c.desde.mas || 0) : (c.desde ?? meta.inicio);
    const dirC = path.join(tmp, `c${k}-${i}`); fs.mkdirSync(dirC);
    sh('ffmpeg', ['-v', 'error', '-y', '-ss', desde.toFixed(3), '-t', (c.quieto ? 0.05 : e.fin - e.ini + 0.1).toFixed(3), '-i', path.join(BIBLIO, `${c.clip}.mp4`), '-vf', `fps=${FPS},scale=1080:-2:flags=lanczos`, '-q:v', '2', path.join(dirC, '%05d.jpg')]);
    c.n = fs.readdirSync(dirC).length; c.dir = `file://${dirC}`;
    if (!c.n) throw new Error(`${c.clip}: sin fotogramas desde ${desde}`);
  }
  // Planos: se reparten la escena según su peso y se extraen sus fotogramas.
  const pesos = (e.planos || []).map(p => p.peso || 1), suma = pesos.reduce((a, b) => a + b, 0);
  let t = e.ini;
  for (const [i, p] of (e.planos || []).entries()) {
    p.ini = +t.toFixed(3); t += (e.fin - e.ini) * pesos[i] / suma; p.fin = +t.toFixed(3);
    if (i) efectos.push([p.ini, 'paso']);
    const meta = JSON.parse(fs.readFileSync(path.join(BIBLIO, `${p.clip}.json`), 'utf8'));
    const desde = typeof p.desde === 'object' ? meta.marcas[p.desde.marca] + (p.desde.mas || 0) : (p.desde ?? meta.inicio);
    if (desde == null || Number.isNaN(desde)) throw new Error(`${p.clip}: marca desconocida ${JSON.stringify(p.desde)}`);
    p.dir = path.join(tmp, `p${escenas.indexOf(e)}-${i}`);
    fs.mkdirSync(p.dir);
    sh('ffmpeg', ['-v', 'error', '-y', '-ss', desde.toFixed(3), '-t', (p.fin - p.ini + 0.1).toFixed(3), '-i', path.join(BIBLIO, `${p.clip}.mp4`),
      '-vf', `fps=${FPS},scale=1080:-2:flags=lanczos`, '-q:v', '2', path.join(p.dir, '%05d.jpg')]);
    p.n = fs.readdirSync(p.dir).length;
    if (!p.n) throw new Error(`${p.clip}: sin fotogramas desde ${desde}`);
    p.dir = `file://${p.dir}`;
  }
  for (const r of e.rotulos || []) if (r.plano != null) r.hasta = e.planos[r.plano].fin;
}

// ── Subtítulos: trozos de hasta 3 palabras, con el tiempo de cada palabra ──
const subs = [];
T.frases.forEach((dicha, i) => {
  const frase = g.subtitulos?.[i] ?? dicha;   // lo que se lee puede diferir de lo que se dice («nokfi punto app» → «nokfi.app»)
  const [a, b] = tiempos[i];
  const pal = frase.split(/\s+/).filter(Boolean);
  const largo = (w) => w.replace(/[^\p{L}\p{N}]/gu, '').length || 1;
  const sumaP = pal.reduce((s, w) => s + largo(w), 0);
  // Mapa «progreso en letras → segundo» a partir de las palabras que oyó Whisper (si las hay); si no, reparto lineal.
  const oidas = (T.palabras?.[i] || []).map(([s, f, txt]) => ({ s: s + OFFSET, f: f + OFFSET, l: largo(txt) }));
  const puntos = [[0, a]];
  if (oidas.length > 1) { const tot = oidas.reduce((s, w) => s + w.l, 0); let c = 0; for (const w of oidas) { puntos.push([c / tot, Math.max(a, w.s)]); c += w.l; puntos.push([c / tot, Math.min(b, w.f)]); } }
  puntos.push([1, b]);
  puntos.sort((x, y) => x[0] - y[0] || x[1] - y[1]);
  const enT = (f) => { for (let k = 1; k < puntos.length; k++) if (f <= puntos[k][0]) { const [f0, t0] = puntos[k - 1], [f1, t1] = puntos[k]; return f1 === f0 ? t1 : t0 + (t1 - t0) * (f - f0) / (f1 - f0); } return b; };
  let c = 0, trozo = [];
  const cerrar = () => { if (trozo.length) { subs.push({ ini: trozo[0].ini, fin: trozo.at(-1).fin, pal: trozo }); trozo = []; } };
  for (const w of pal) {
    const ini = enT(c / sumaP); c += largo(w); const fin = enT(c / sumaP);
    if (trozo.length && (trozo.length >= RITMO.trozo || trozo.reduce((s, x) => s + x.txt.length + 1, 0) + w.length > RITMO.letras)) cerrar();
    trozo.push({ txt: w, ini: +ini.toFixed(3), fin: +fin.toFixed(3) });
    if (/[.,:;?!]$/.test(w)) cerrar();
  }
  cerrar();
});

fs.writeFileSync(path.join(tmp, 'data.js'), `window.DATA = ${JSON.stringify({ fps: FPS, total, escenas, subs, ritmo: RITMO, transicion: g.transicion || 'lateral', pasos: g.pasos || [] })};`);
fs.writeFileSync(path.join(tmp, 'index.html'), fs.readFileSync(path.join(AQUI, 'editor-pagina.html'), 'utf8').replaceAll('FUENTES', `file://${path.join(VIDEO, 'recursos/fuentes')}`));

// ── Dibujo fotograma a fotograma ──
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_CORE || 'playwright-core');
const chrome = fs.readdirSync(path.join(process.env.HOME, '.cache/ms-playwright')).filter(n => /^chromium-\d+$/.test(n)).sort().at(-1);
const browser = await chromium.launch({ executablePath: path.join(process.env.HOME, '.cache/ms-playwright', chrome, fs.existsSync(path.join(process.env.HOME, '.cache/ms-playwright', chrome, 'chrome-linux64')) ? 'chrome-linux64/chrome' : 'chrome-linux/chrome'), args: ['--allow-file-access-from-files', '--disable-web-security'] });
const page = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
page.on('pageerror', (e) => { console.error('Error en la página:', e.message); });
await page.goto(`file://${path.join(tmp, 'index.html')}`);
await page.evaluate(() => window.lista);

const foto = opcion('--foto');
if (foto != null) {
  const fotos = args.slice(args.indexOf('--foto') + 1).filter(x => /^[\d.]+$/.test(x)).map(Number);
  for (const t of fotos) {
    await page.evaluate((x) => window.pinta(x), t);
    const f = path.join(SALIDA, '_registro', `${g.id}-${t.toFixed(1)}.png`);
    await page.screenshot({ path: f });
    console.log('✓', path.relative(process.cwd(), f));
  }
  await browser.close(); fs.rmSync(tmp, { recursive: true, force: true }); process.exit(0);
}

const cuadros = path.join(tmp, 'cuadros'); fs.mkdirSync(cuadros);
const nTotal = Math.round(total * FPS), t0 = Date.now();
// --rehacer-cierre: solo se vuelve a dibujar la última escena y se empalma con el vídeo que ya existe (ahorra casi toda la pasada).
// --rehacer-sonido: no se dibuja nada; se vuelve a mezclar el sonido sobre la imagen del vídeo que ya existe.
const soloSonido = args.includes('--rehacer-sonido');
const soloCierre = args.includes('--rehacer-cierre'), nIni = soloSonido ? nTotal : soloCierre ? Math.round(escenas.at(-1).ini * FPS) : 0;
for (let n = nIni; n < nTotal; n++) {
  await page.evaluate((x) => window.pinta(x), n / FPS);
  await page.screenshot({ path: path.join(cuadros, `${String(n - nIni + 1).padStart(5, '0')}.jpg`), type: 'jpeg', quality: 96 });
  if (n % 30 === 0) { await enfriar(); if (n % 150 === 0) console.log(`  ${(n / FPS).toFixed(0)} / ${total.toFixed(0)} s · ${temperatura().toFixed(0)} °C · ${((Date.now() - t0) / 60000).toFixed(1)} min`); }
}
await browser.close();

// ── Sonido: voz + música baja + efectos sintetizados ──
const FX = {
  paso: ['anoisesrc=d=0.38:c=pink:a=0.9', 'bandpass=f=1400:w=1200,afade=t=in:d=0.16,afade=t=out:st=0.16:d=0.22,volume=0.5'],
  barrido: ['anoisesrc=d=0.6:c=pink:a=0.9', 'bandpass=f=700:w=900,afade=t=in:d=0.3,afade=t=out:st=0.3:d=0.3,volume=0.75'],
  pop: ['sine=f=920:d=0.11', 'afade=t=out:st=0.02:d=0.09,volume=0.33'],
  campana: ['sine=f=1318:d=0.7', 'afade=t=out:st=0.03:d=0.67,volume=0.26']
};
for (const [n, [fuente, filtro]] of Object.entries(FX)) sh('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', fuente, '-af', filtro, '-ar', '48000', '-ac', '2', path.join(tmp, `${n}.wav`)]);
const musica = path.join(VIDEO, 'recursos/musica', g.musica || fs.readdirSync(path.join(VIDEO, 'recursos/musica')).sort()[0]);
const ent = ['-i', voz, '-stream_loop', '-1', '-i', musica];
// Volumen de la voz: una sola ganancia fija para todo el vídeo (medida antes). El ajuste automático de ffmpeg sube y
// baja el volumen a mitad de frase y se oye como un corte (lección del 2026-10-12).
const medida = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-i', voz, '-af', 'loudnorm=print_format=json', '-f', 'null', '-'], { encoding: 'utf8' }).stderr.match(/"input_i"\s*:\s*"(-?[\d.]+)"/);
const GANANCIA = medida ? Math.max(-6, Math.min(10, -15 - parseFloat(medida[1]))) : 0;
const fil = [`[1:a]adelay=${OFFSET * 1000}:all=1,volume=${GANANCIA.toFixed(2)}dB,aresample=48000[v]`,
  `[2:a]atrim=0:${total.toFixed(2)},volume=0.085,afade=t=in:d=0.8,afade=t=out:st=${(total - 1.4).toFixed(2)}:d=1.4,aresample=48000[m]`];
efectos.forEach(([t, tipo], i) => { ent.push('-i', path.join(tmp, `${tipo}.wav`)); fil.push(`[${i + 3}:a]adelay=${Math.max(0, Math.round((t - 0.06) * 1000))}:all=1[e${i}]`); });
fil.push(`[v][m]${efectos.map((_, i) => `[e${i}]`).join('')}amix=inputs=${efectos.length + 2}:normalize=0:duration=longest,alimiter=limit=0.95,volume=-1.2dB[a]`);

const carpeta = path.join(SALIDA, 'PARA-SUBIR', g.carpeta || g.id);
fs.mkdirSync(carpeta, { recursive: true });
const video = path.join(carpeta, 'video.mp4');
await enfriar();
if (soloSonido) {
  const nuevo = path.join(tmp, 'nuevo.mp4');
  sh('ffmpeg', ['-v', 'error', '-y', '-i', video, ...ent, '-filter_complex', fil.join(';'), '-map', '0:v', '-map', '[a]', '-t', total.toFixed(2),
    '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', nuevo]);
  fs.copyFileSync(nuevo, video);
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(`✓ sonido rehecho · ${path.relative(process.cwd(), video)} · ${dur(video).toFixed(1)} s`);
  process.exit(0);
}
if (soloCierre) {
  const nuevo = path.join(tmp, 'nuevo.mp4'), corte = (nIni / FPS).toFixed(4);
  sh('ffmpeg', ['-v', 'error', '-y', '-i', video, '-framerate', String(FPS), '-i', path.join(cuadros, '%05d.jpg'), '-filter_complex',
    `[0:v]trim=0:${corte},setpts=PTS-STARTPTS[a];[1:v]setpts=PTS-STARTPTS[b];[a][b]concat=n=2:v=1:a=0[v]`, '-map', '[v]', '-map', '0:a', '-c:a', 'copy',
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '17', '-pix_fmt', 'yuv420p', '-r', String(FPS), '-threads', '2', '-movflags', '+faststart', nuevo]);
  fs.copyFileSync(nuevo, video);
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(`✓ cierre rehecho · ${path.relative(process.cwd(), video)} · ${dur(video).toFixed(1)} s`);
  process.exit(0);
}
sh('ffmpeg', ['-v', 'error', '-y', '-framerate', String(FPS), '-i', path.join(cuadros, '%05d.jpg'), ...ent, '-filter_complex', fil.join(';'),
  '-map', '0:v', '-map', '[a]', '-t', total.toFixed(2), '-c:v', 'libx264', '-preset', 'medium', '-crf', '17', '-pix_fmt', 'yuv420p', '-threads', '2',
  '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', video]);
sh('ffmpeg', ['-v', 'error', '-y', '-ss', '0.9', '-i', video, '-frames:v', '1', path.join(carpeta, 'portada.png')]);
fs.writeFileSync(path.join(carpeta, 'texto.txt'), `${g.texto}\n`);
fs.writeFileSync(path.join(carpeta, 'titulo.txt'), `${g.titulo}\n`);
fs.writeFileSync(path.join(carpeta, 'portada-ms.txt'), '900\n');
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`✓ ${path.relative(process.cwd(), video)} · ${dur(video).toFixed(1)} s · ${((Date.now() - t0) / 60000).toFixed(1)} min de dibujo`);
