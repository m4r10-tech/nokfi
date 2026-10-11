/**
 * marketing/redes/video/voz.mjs — sesión 13: locución sintética local y gratuita
 * con la voz fija de la marca (voz.json), frase a frase. Motores ("motor"):
 *   supertonic (por defecto desde el 2026-10-11) — Supertonic 3, voz "voz" (M1…M5, F1…F5)
 *   piper — modelo "modelo" de video/voces/
 *
 * Es una voz generada por IA: las publicaciones con esta voz llevan la etiqueta
 * de IA en TikTok ("ia": true en publicaciones/<semana>.json).
 *
 * Uso (desde la raíz del repo):
 *   node marketing/redes/video/voz.mjs marketing/redes/video/guiones/<id>.json [--forzar] [--repetir 3,5]
 * Cada frase locutada se guarda en voz/.tomas/ (por texto y ajustes de voz): al rehacer
 * un vídeo solo se locutan de nuevo las frases cambiadas y las demás suenan idénticas.
 * --repetir 3,5 vuelve a locutar las frases 3 y 5 (cada toma sale algo distinta).
 * Salida: marketing/redes/video/voz/<id>.wav (una frase por escena + cierre, con
 *   una pausa entre frases) y voz/<id>.tiempos.json con el [inicio, fin] exacto de
 *   cada frase, que montar.mjs usa para colocar cada frase en su escena.
 *
 * Instalación (una vez), desde marketing/redes/video/:
 *   supertonic: python3 -m venv .supertonic && .supertonic/bin/pip install supertonic
 *     (el modelo se descarga solo la primera vez, ~400 MB en ~/.cache/huggingface)
 *   piper: python3 -m venv .piper && .piper/bin/pip install piper-tts; modelos en
 *     video/voces/ (huggingface.co/rhasspy/piper-voices, es_ES).
 * Pronunciación: "locucion" en una escena sustituye al texto; además se aplica
 *   el diccionario de voz.json ("pronunciar"). Una barra « | » dentro de la frase
 *   mete una pausa breve ("pausaBreve" de voz.json) en ese punto.
 */

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PIPER = path.join(HERE, '.piper/bin/piper');
const conf = JSON.parse(fs.readFileSync(path.join(HERE, 'voz.json'), 'utf8'));

function texto(frase) {
  let t = frase.replace(/\*\*/g, '');
  for (const [de, a] of Object.entries(conf.pronunciar || {})) t = t.replace(new RegExp(de, 'g'), a);
  return t.replace(/\s+/g, ' ').trim();
}

function main() {
  const [guionPath, ...resto] = process.argv.slice(2);
  const flag = resto.includes('--forzar') || resto.includes('--repetir') ? '--forzar' : null;
  const repetir = new Set((resto[resto.indexOf('--repetir') + 1] || '').split(',').map(Number).filter(n => resto.includes('--repetir') && n));
  if (!guionPath) throw new Error('Uso: node marketing/redes/video/voz.mjs <guion.json> [--forzar]');
  const g = JSON.parse(fs.readFileSync(guionPath, 'utf8'));
  const destino = path.join(HERE, 'voz', `${g.id}.wav`);
  const otra = ['m4a', 'mp3', 'ogg', 'opus'].map(e => path.join(HERE, 'voz', `${g.id}.${e}`)).find(f => fs.existsSync(f));
  if (otra) throw new Error(`Ya hay una voz grabada (${path.basename(otra)}): no la sustituyo.`);
  if (fs.existsSync(destino) && flag !== '--forzar') throw new Error(`Ya existe ${path.basename(destino)} (usa --forzar para rehacerla).`);
  const motor = conf.motor || 'piper';
  const frases = [...g.escenas.map(e => e.locucion ?? e.voz), g.cierre?.locucion ?? g.cierre?.voz].filter(Boolean).map(texto);
  const tmp = fs.mkdtempSync(path.join(HERE, 'voz', '.tmp-'));
  const parte = (i) => path.join(tmp, `${String(i).padStart(2, '0')}.wav`);
  // «a | b»: trozos que se locutan por separado y se unen con una pausa breve.
  const trozos = frases.map(f => f.split('|').map(x => x.trim()).filter(Boolean));
  const tomas = path.join(HERE, 'voz', '.tomas');
  fs.mkdirSync(tomas, { recursive: true });
  const toma = (i) => path.join(tomas, crypto.createHash('sha1').update(JSON.stringify([motor, motor === 'supertonic' ? conf.voz : conf.modelo,
    conf.hablante ?? null, conf.pasos ?? null, conf.velocidad ?? null, conf.pausaBreve ?? null, frases[i]])).digest('hex').slice(0, 16) + '.wav');
  const nueva = frases.map((_, i) => repetir.has(i + 1) || !fs.existsSync(toma(i)));
  const sueltos = trozos.filter((_, i) => nueva[i]).flat();
  try {
    let rate;
    if (!sueltos.length) rate = null;
    else if (motor === 'supertonic') {
      const py = path.join(HERE, '.supertonic/bin/python');
      if (!fs.existsSync(py)) throw new Error('Falta Supertonic: ver la cabecera de este archivo.');
      const r = execFileSync(py, [path.join(HERE, 'voz_supertonic.py')], { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'],
        input: JSON.stringify({ frases: sueltos, voz: conf.voz, idioma: 'es', pasos: conf.pasos, velocidad: conf.velocidad, dir: tmp }) });
      rate = JSON.parse(r.trim().split('\n').at(-1)).rate;
    } else {
      if (!fs.existsSync(PIPER)) throw new Error('Falta Piper: ver la cabecera de este archivo.');
      sueltos.forEach((f, i) => execFileSync(PIPER, ['-m', path.join(HERE, 'voces', conf.modelo), ...(conf.hablante != null ? ['-s', String(conf.hablante)] : []),
        '--length-scale', String(conf.velocidad ?? 1), '--sentence-silence', '0.15', '-f', parte(i)], { input: f, stdio: ['pipe', 'ignore', 'ignore'] }));
      rate = JSON.parse(fs.readFileSync(path.join(HERE, 'voces', `${conf.modelo}.json`), 'utf8')).audio?.sample_rate || 22050;
    }
    rate ??= +execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=sample_rate', '-of', 'csv=p=0', toma(0)], { encoding: 'utf8' }).trim();
    // Cada frase sin el silencio de los extremos: así los tiempos son exactos.
    const recorte = 'silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.03';
    const pausa = conf.pausa ?? 0.4;
    const tiempos = [];
    let t = 0;
    const breve = path.join(tmp, 'breve.wav');
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', `anullsrc=r=${rate}:cl=mono`, '-t', String(conf.pausaBreve ?? 0.28), breve]);
    let k = 0;
    const limpias = trozos.map((ts, i) => {
      const wav = toma(i);
      if (nueva[i]) {
      const ins = ts.flatMap((_, j) => (j ? [breve, parte(k++)] : [parte(k++)]));
      const filtro = ins.map((_, j) => (ins[j] === breve ? `[${j}:a]anull[a${j}]` : `[${j}:a]${recorte},areverse,${recorte},areverse[a${j}]`)).join(';')
        + `;${ins.map((_, j) => `[a${j}]`).join('')}concat=n=${ins.length}:v=0:a=1[o]`;
      execFileSync('ffmpeg', ['-v', 'error', '-y', ...ins.flatMap(f => ['-i', f]), '-filter_complex', filtro, '-map', '[o]', '-ar', String(rate), '-ac', '1', wav]);
      }
      const d = +execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', wav], { encoding: 'utf8' }).trim();
      tiempos.push([+t.toFixed(3), +(t + d).toFixed(3)]);
      t += d + pausa;
      return wav;
    });
    const silencio = path.join(tmp, 'silencio.wav');
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', `anullsrc=r=${rate}:cl=mono`, '-t', String(pausa), silencio]);
    const lista = limpias.flatMap((p, i) => (i ? [silencio, p] : [p])).map(p => `file '${p}'`).join('\n');
    fs.writeFileSync(path.join(tmp, 'lista.txt'), lista + '\n');
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', path.join(tmp, 'lista.txt'), '-c:a', 'pcm_s16le', destino]);
    fs.writeFileSync(destino.replace(/\.wav$/, '.tiempos.json'), JSON.stringify({ frases, tiempos }, null, 1));
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  console.log(`✓ voz/${path.basename(destino)} · ${frases.length} frases (${nueva.filter(Boolean).length} nuevas) · ${motor} ${motor === 'supertonic' ? conf.voz : conf.modelo}`);
}

main();
