/**
 * marketing/redes/video/voz.mjs — sesión 13: locución sintética (Piper, local,
 * código abierto) con la voz fija de la marca (voz.json), frase a frase.
 *
 * Es una voz generada por IA: las publicaciones con esta voz llevan la etiqueta
 * de IA en TikTok ("ia": true en publicaciones/<semana>.json).
 *
 * Uso (desde la raíz del repo):
 *   node marketing/redes/video/voz.mjs marketing/redes/video/guiones/<id>.json [--forzar]
 * Salida: marketing/redes/video/voz/<id>.wav (una frase por escena + cierre,
 *   con una pausa entre frases para que montar.mjs las coloque en su escena).
 *
 * Instalación (una vez): python3 -m venv marketing/redes/video/.piper &&
 *   marketing/redes/video/.piper/bin/pip install piper-tts; modelos en video/voces/
 *   (huggingface.co/rhasspy/piper-voices, es_ES).
 * Pronunciación: "locucion" en una escena sustituye al texto; además se aplica
 *   el diccionario de voz.json ("pronunciar").
 */

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
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
  const [guionPath, flag] = process.argv.slice(2);
  if (!guionPath) throw new Error('Uso: node marketing/redes/video/voz.mjs <guion.json> [--forzar]');
  const g = JSON.parse(fs.readFileSync(guionPath, 'utf8'));
  const destino = path.join(HERE, 'voz', `${g.id}.wav`);
  const otra = ['m4a', 'mp3', 'ogg', 'opus'].map(e => path.join(HERE, 'voz', `${g.id}.${e}`)).find(f => fs.existsSync(f));
  if (otra) throw new Error(`Ya hay una voz grabada (${path.basename(otra)}): no la sustituyo.`);
  if (fs.existsSync(destino) && flag !== '--forzar') throw new Error(`Ya existe ${path.basename(destino)} (usa --forzar para rehacerla).`);
  if (!fs.existsSync(PIPER)) throw new Error('Falta Piper: ver la cabecera de este archivo.');

  const frases = [...g.escenas.map(e => e.locucion ?? e.voz), g.cierre?.locucion ?? g.cierre?.voz].filter(Boolean).map(texto);
  const tmp = fs.mkdtempSync(path.join(HERE, 'voz', '.tmp-'));
  try {
    const partes = frases.map((f, i) => {
      const wav = path.join(tmp, `${String(i).padStart(2, '0')}.wav`);
      execFileSync(PIPER, ['-m', path.join(HERE, 'voces', conf.modelo), ...(conf.hablante != null ? ['-s', String(conf.hablante)] : []),
        '--length-scale', String(conf.velocidad ?? 1), '--sentence-silence', '0.15', '-f', wav], { input: f, stdio: ['pipe', 'ignore', 'ignore'] });
      return wav;
    });
    // Pausa entre frases (más larga que cualquier pausa dentro de una frase).
    const silencio = path.join(tmp, 'silencio.wav');
    const rate = JSON.parse(fs.readFileSync(path.join(HERE, 'voces', `${conf.modelo}.json`), 'utf8')).audio?.sample_rate || 22050;
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', `anullsrc=r=${rate}:cl=mono`, '-t', String(conf.pausa ?? 0.7), silencio]);
    const lista = partes.flatMap((p, i) => (i ? [silencio, p] : [p])).map(p => `file '${p}'`).join('\n');
    fs.writeFileSync(path.join(tmp, 'lista.txt'), lista + '\n');
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', path.join(tmp, 'lista.txt'), '-c:a', 'pcm_s16le', destino]);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  console.log(`✓ voz/${path.basename(destino)} · ${frases.length} frases · ${conf.modelo}${conf.hablante != null ? ` (${conf.hablante})` : ''}`);
}

main();
