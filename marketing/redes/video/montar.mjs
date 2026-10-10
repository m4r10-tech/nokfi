/**
 * marketing/redes/video/montar.mjs — sesión 13: edita un vídeo vertical para
 * TikTok/Reels a partir de un guion, los clips grabados de la app y, si están,
 * la voz (grabada por una persona) y la música.
 *
 * Uso (desde la raíz del repo, después de backend/scripts/redes-clips.js):
 *   PLAYWRIGHT_CORE=… node marketing/redes/video/montar.mjs marketing/redes/video/guiones/<id>.json
 *
 * Entrada:
 *   guion           escenas (clip + marca + frase de la voz), gancho y cierre
 *   salida/video/<id>/clips/*.mp4|json   grabaciones de la app (redes-clips.js)
 *   video/voz/<id>.(wav|m4a|mp3|ogg|opus)  voz leída del guion, con una pausa
 *                                         clara entre frases (opcional)
 *   video/musica/<archivo>                 "musica" del guion o la primera de la
 *                                         carpeta (opcional; con licencia de uso)
 * Salida (lista para buffer.mjs, pieza = <id>):
 *   salida/<id>/video.mp4       1080×1920, 30 fps, H.264 + AAC, −14 LUFS
 *   salida/<id>/01-portada.png  portada con el gancho
 *   salida/<id>/subtitulos.srt  por si se quieren subir aparte
 *
 * Sin voz, cada frase dura según sus palabras y sale solo como subtítulo.
 *
 * Escena: { clip, marca, voz, congelar?, desplaza? (s), zoom? (0.06), zoomInicial? (1), x?, y? (0-1) }
 */

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REDES = path.resolve(HERE, '..');
const SALIDA = path.join(REDES, 'salida');
const FUENTES = path.join(HERE, 'fuentes');
const W = 1080, H = 1920, FPS = 30;

// Estilo (ver MANUAL.md): amarillo para la palabra clave, azul Nokfi para el gancho.
const COLOR = { texto: '&H00FFFFFF', clave: '&H003BD4FF', borde: '&H00000000', caja: '&H00A25614' };

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

const tiempoAss = (s) => {
  const h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60, sec = (s % 60).toFixed(2).padStart(5, '0');
  return `${h}:${String(m).padStart(2, '0')}:${sec}`;
};
const tiempoSrt = (s) => {
  const ms = Math.round(s * 1000), h = Math.floor(ms / 3600000), m = Math.floor(ms / 60000) % 60, sec = Math.floor(ms / 1000) % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')},${String(ms % 1000).padStart(3, '0')}`;
};
const assTexto = (tokens, clave = COLOR.clave) => tokens.map(t => (t.clave ? `{\\c${clave}}${t.w}{\\c${COLOR.texto}}` : t.w)).join(' ');

function ass(lineas, gancho, total) {
  const cab = `[Script Info]
ScriptType: v4.00+
PlayResX: ${W}
PlayResY: ${H}
WrapStyle: 0
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Sub,Jakarta ExtraBold,128,${COLOR.texto},${COLOR.texto},&H30000000,&H30000000,0,0,0,0,100,100,0,0,3,18,0,2,110,110,400,1
Style: Gancho,Jakarta ExtraBold,128,${COLOR.texto},${COLOR.texto},${COLOR.caja},${COLOR.caja},0,0,0,0,100,100,0,0,3,30,0,8,80,80,300,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;
  const ev = [];
  if (gancho) {
    // En la caja azul del gancho, la palabra clave va en azul claro.
    const g = assTexto(palabras(gancho), '&H00FFD45B');
    ev.push(`Dialogue: 1,${tiempoAss(0.05)},${tiempoAss(Math.min(2.8, total))},Gancho,,0,0,0,,{\\fad(80,180)\\fscx85\\fscy85\\t(0,160,\\fscx100\\fscy100)}${g}`);
  }
  for (const l of lineas) {
    if (l.cierre) continue; // la tarjeta final ya lo dice en grande
    for (const c of l.chunks) {
      ev.push(`Dialogue: 0,${tiempoAss(c.ini)},${tiempoAss(c.fin)},Sub,,0,0,0,,{\\fscx92\\fscy92\\t(0,90,\\fscx100\\fscy100)}${assTexto(c.tokens)}`);
    }
  }
  return cab + ev.join('\n') + '\n';
}

function main() {
  const guionPath = process.argv[2];
  if (!guionPath) throw new Error('Uso: node marketing/redes/video/montar.mjs <guion.json>');
  const g = JSON.parse(fs.readFileSync(guionPath, 'utf8'));
  const clipsDir = path.join(SALIDA, 'video', g.id, 'clips');
  const out = path.join(SALIDA, g.id);
  const tmp = path.join(SALIDA, 'video', g.id, 'tmp');
  fs.mkdirSync(out, { recursive: true });
  fs.mkdirSync(tmp, { recursive: true });

  const frases = [...g.escenas.map(e => e.voz), g.cierre?.voz].filter(Boolean);
  const vozPath = ['wav', 'm4a', 'mp3', 'ogg', 'opus'].map(e => path.join(HERE, 'voz', `${g.id}.${e}`)).find(f => fs.existsSync(f));
  const musDir = path.join(HERE, 'musica');
  const musPath = g.musica ? path.join(musDir, g.musica)
    : (fs.existsSync(musDir) ? fs.readdirSync(musDir).filter(n => /\.(mp3|m4a|wav|ogg)$/.test(n)).sort().map(n => path.join(musDir, n))[0] : null);

  // ── Tiempos de cada frase ──
  let tramos, vozTotal = 0;
  if (vozPath) {
    const r = tramosDeVoz(vozPath, frases.length);
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
  fs.writeFileSync(path.join(tmp, 'subs.ass'), ass(lineas, g.gancho, finTotal));
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
    const meta = JSON.parse(fs.readFileSync(path.join(clipsDir, `${e.clip}.json`), 'utf8'));
    const desde = Math.max(0, (e.marca ? meta.marcas[e.marca] : meta.inicio) + (e.desplaza || 0));
    const d = durs[i];
    // congelar: el fotograma de la marca se queda fijo (solo el acercamiento lento).
    args.push('-ss', desde.toFixed(3), '-t', (e.congelar ? 0.1 : d + 0.5).toFixed(3), '-i', path.join(clipsDir, `${e.clip}.mp4`));
    const z = e.zoom ?? 0.06;            // cuánto se acerca a lo largo de la escena
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
  const assPath = path.join(tmp, 'subs.ass').replace(/([:\\'])/g, '\\$1');
  const fontsDir = FUENTES.replace(/([:\\'])/g, '\\$1');
  filtros.push(`[vc]ass=${assPath}:fontsdir=${fontsDir}[vout]`);

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

  const video = path.join(out, 'video.mp4');
  args.push('-filter_complex', filtros.join(';'), '-map', '[vout]', '-map', audio,
    '-t', finTotal.toFixed(3), '-c:v', 'libx264', '-profile:v', 'high', '-crf', '19', '-preset', 'medium', '-pix_fmt', 'yuv420p',
    '-r', String(FPS), '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-movflags', '+faststart', video);
  sh('ffmpeg', args);

  // Portada: fotograma con el gancho ya en pantalla.
  sh('ffmpeg', ['-v', 'error', '-y', '-ss', '0.9', '-i', video, '-frames:v', '1', path.join(out, '01-portada.png')]);
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(`✓ ${path.relative(path.resolve(REDES, '../..'), video)} · ${finTotal.toFixed(1)} s · voz: ${vozPath ? path.basename(vozPath) : 'no'} · música: ${musPath ? path.basename(musPath) : 'no'}`);
}

main();
