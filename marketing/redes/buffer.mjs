/**
 * marketing/redes/buffer.mjs — sesión 13: programar en Buffer lo aprobado.
 *
 * Nada se publica sin el ok del usuario: solo se envían las publicaciones con
 * "aprobado": true en marketing/redes/publicaciones/<semana>.json, y cada una
 * guarda su "buffer_id" para no enviarla dos veces.
 *
 * Configuración en marketing/redes/.env (no se versiona):
 *   BUFFER_API_KEY=…                      (publish.buffer.com → Settings → API)
 *   MEDIA_RSYNC_DEST=deploy@<vps>:~/nokfi/media-redes/
 *   MEDIA_BASE_URL=https://nokfi.app/api/redes-media     (opcional)
 *
 * Comandos (desde la raíz del repo):
 *   node marketing/redes/buffer.mjs canales                      → cuentas conectadas en Buffer
 *   node marketing/redes/buffer.mjs esquema                      → campos de createPost (comprobar la API)
 *   node marketing/redes/buffer.mjs revisar  <semana.json>       → qué se enviaría, sin enviar nada
 *   node marketing/redes/buffer.mjs subir    <semana.json>       → imágenes al VPS y comprobación de las URL
 *   node marketing/redes/buffer.mjs programar <semana.json> [--borrador]
 *        → crea en Buffer las aprobadas (con --borrador quedan como borrador en Buffer)
 *
 * Publicación: { "id", "red": "x|instagram|tiktok", "cuando": "2026-10-06T13:00" (hora de Madrid),
 *   "texto", "pieza": "<carpeta de salida/>" (opcional), "tipo": "post|story|reel" (Instagram),
 *   "video": "<archivo .mp4 en salida/<pieza>/>" (opcional), "titulo" y "ia" (TikTok, opcionales),
 *   "aprobado": false }
 */

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SALIDA = path.join(HERE, 'salida');
const API = 'https://api.buffer.com';
const LIMITES = { x: 280, instagram: 2200, tiktok: 2200 };
const SERVICIOS = { x: ['twitter', 'x'], instagram: ['instagram'], tiktok: ['tiktok'] };

function cargarEnv() {
  const f = path.join(HERE, '.env');
  if (!fs.existsSync(f)) return;
  for (const linea of fs.readFileSync(f, 'utf8').split('\n')) {
    const m = linea.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}
cargarEnv();
const MEDIA_BASE = (process.env.MEDIA_BASE_URL || 'https://nokfi.app/api/redes-media').replace(/\/+$/, '');

async function gql(query, variables = {}) {
  if (!process.env.BUFFER_API_KEY) throw new Error('Falta BUFFER_API_KEY en marketing/redes/.env');
  const r = await fetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.BUFFER_API_KEY}` },
    body: JSON.stringify({ query, variables })
  });
  const body = await r.json().catch(() => ({}));
  if (!r.ok || body.errors) throw new Error(`Buffer ${r.status}: ${JSON.stringify(body.errors || body).slice(0, 500)}`);
  return body.data;
}

/** "2026-10-06T13:00" en Madrid → ISO UTC (tiene en cuenta el cambio de hora). */
function madridAUtc(local) {
  const [d, t] = local.split('T');
  const [Y, M, D] = d.split('-').map(Number);
  const [h, mi] = t.split(':').map(Number);
  const supuesto = Date.UTC(Y, M - 1, D, h, mi);
  const partes = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Madrid', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
    .formatToParts(new Date(supuesto)).reduce((o, p) => ({ ...o, [p.type]: p.value }), {});
  const comoMadrid = Date.UTC(+partes.year, +partes.month - 1, +partes.day, +partes.hour, +partes.minute);
  return new Date(supuesto - (comoMadrid - supuesto)).toISOString();
}

function leerSemana(fich) {
  if (!fich) throw new Error('Indica el archivo: marketing/redes/publicaciones/<semana>.json');
  return { fich: path.resolve(fich), lista: JSON.parse(fs.readFileSync(path.resolve(fich), 'utf8')) };
}

/** Archivos de la pieza en orden (PNG, o el vídeo si lo hay). */
function archivos(pub) {
  if (!pub.pieza) return [];
  const dir = path.join(SALIDA, pub.pieza);
  if (!fs.existsSync(dir)) throw new Error(`${pub.id}: no existe salida/${pub.pieza} (genera las imágenes con plantillas/render.mjs)`);
  if (pub.video) {
    if (!fs.existsSync(path.join(dir, pub.video))) throw new Error(`${pub.id}: falta el vídeo salida/${pub.pieza}/${pub.video}`);
    return [pub.video];
  }
  return fs.readdirSync(dir).filter(n => /\.(png|jpe?g)$/.test(n)).sort();
}

function problemas(pub) {
  const p = [];
  if (!LIMITES[pub.red]) p.push(`red desconocida «${pub.red}»`);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(pub.cuando || '')) p.push('«cuando» debe ser AAAA-MM-DDTHH:MM (hora de Madrid)');
  else if (new Date(madridAUtc(pub.cuando)) < new Date()) p.push('la fecha ya ha pasado');
  // X cuenta cada enlace como 23 caracteres.
  const largo = pub.red === 'x' ? (pub.texto || '').replace(/(https?:\/\/)?[a-z0-9.-]+\.[a-z]{2,}\/\S*/gi, 'x'.repeat(23)).length : (pub.texto || '').length;
  if (largo > (LIMITES[pub.red] || Infinity)) p.push(`texto de ${largo} caracteres (máx. ${LIMITES[pub.red]})`);
  if ((pub.red === 'instagram' || pub.red === 'tiktok') && !pub.pieza) p.push(`${pub.red} necesita imagen o vídeo`);
  if (pub.red === 'tiktok' && pub.tipo === 'video' && !pub.video) p.push('vídeo de TikTok pendiente de grabar');
  if (pub.red === 'instagram' && pub.tipo === 'reel' && !pub.video) p.push('reel pendiente de grabar');
  try { const a = archivos(pub); if (pub.red === 'x' && a.length > 4) p.push('X admite como máximo 4 imágenes'); if (a.length > 10) p.push('máximo 10 imágenes'); }
  catch (e) { p.push(e.message.replace(`${pub.id}: `, '')); }
  return p;
}

async function canales() {
  const d = await gql('query { account { organizations { id name } } }');
  const out = [];
  for (const org of d.account.organizations) {
    const c = await gql(`query { channels(input: { organizationId: ${JSON.stringify(org.id)} }) { id name service } }`);
    for (const ch of c.channels) out.push({ org: org.name, ...ch });
  }
  return out;
}

async function canalDe(red, lista) {
  const ch = lista.find(c => SERVICIOS[red].includes(String(c.service).toLowerCase()));
  if (!ch) throw new Error(`No hay ninguna cuenta de ${red} conectada en Buffer`);
  return ch.id;
}

async function crear(pub, channelId, borrador) {
  // Vídeo: la primera lámina PNG de la pieza hace de portada.
  const portada = pub.video ? fs.readdirSync(path.join(SALIDA, pub.pieza)).filter(n => n.endsWith('.png')).sort()[0] : null;
  const assets = archivos(pub).map(n => {
    const url = `${MEDIA_BASE}/${pub.pieza}/${n}`;
    return n.endsWith('.mp4')
      ? { video: { url, ...(portada ? { thumbnailUrl: `${MEDIA_BASE}/${pub.pieza}/${portada}` } : {}) } }
      : { image: { url } };
  });
  const input = {
    text: pub.texto,
    channelId,
    schedulingType: 'automatic',
    mode: 'customScheduled',
    dueAt: madridAUtc(pub.cuando),
    ...(assets.length ? { assets } : {}),
    ...(pub.red === 'instagram' ? { metadata: { instagram: { type: pub.tipo || 'post', shouldShareToFeed: true } } } : {}),
    // TikTok: título del vídeo y etiqueta de contenido generado con IA («ia»: true).
    ...(pub.red === 'tiktok' ? { metadata: { tiktok: { ...(pub.titulo ? { title: pub.titulo } : {}), isAiGenerated: !!pub.ia } } } : {}),
    ...(borrador ? { saveToDraft: true } : {})
  };
  const d = await gql(`mutation($input: CreatePostInput!) { createPost(input: $input) {
      ... on PostActionSuccess { post { id dueAt } }
      ... on MutationError { message } } }`, { input });
  if (d.createPost.message) throw new Error(`${pub.id}: ${d.createPost.message}`);
  return d.createPost.post;
}

async function main() {
  const [cmd, fich, ...flags] = process.argv.slice(2);

  if (cmd === 'canales') {
    for (const c of await canales()) console.log(`${c.service.padEnd(10)} ${c.name.padEnd(24)} ${c.id}  (${c.org})`);
    return;
  }

  if (cmd === 'esquema') {
    const d = await gql(`query { t: __type(name: "CreatePostInput") { inputFields { name type { name kind ofType { name } } } }
      s: __type(name: "SchedulingType") { enumValues { name } } m: __type(name: "ShareMode") { enumValues { name } } }`);
    console.log('CreatePostInput:', d.t?.inputFields?.map(f => f.name).join(', '));
    console.log('SchedulingType:', d.s?.enumValues?.map(v => v.name).join(', '));
    console.log('ShareMode:', d.m?.enumValues?.map(v => v.name).join(', '));
    return;
  }

  const { fich: ruta, lista } = leerSemana(fich);

  if (cmd === 'revisar') {
    for (const pub of lista) {
      const p = problemas(pub);
      const estado = pub.buffer_id ? 'ya en Buffer' : !pub.aprobado ? 'sin aprobar' : p.length ? 'BLOQUEADA' : 'lista';
      console.log(`${estado.padEnd(13)} ${pub.cuando}  ${pub.red.padEnd(9)} ${pub.id}${p.length ? `\n              → ${p.join(' · ')}` : ''}`);
    }
    return;
  }

  if (cmd === 'subir') {
    if (!process.env.MEDIA_RSYNC_DEST) throw new Error('Falta MEDIA_RSYNC_DEST en marketing/redes/.env');
    const piezas = [...new Set(lista.filter(p => p.pieza).map(p => p.pieza))];
    for (const pieza of piezas) {
      execFileSync('rsync', ['-az', '--chmod=D755,F644', `${path.join(SALIDA, pieza)}/`, `${process.env.MEDIA_RSYNC_DEST.replace(/\/?$/, '/')}${pieza}/`], { stdio: 'inherit' });
      const pub = lista.find(p => p.pieza === pieza);
      for (const n of archivos(pub)) {
        const r = await fetch(`${MEDIA_BASE}/${pieza}/${n}`, { method: 'HEAD' });
        console.log(`${r.ok ? '✓' : '✗'} ${r.status} ${MEDIA_BASE}/${pieza}/${n}`);
        if (!r.ok) process.exitCode = 1;
      }
    }
    return;
  }

  if (cmd === 'programar') {
    const borrador = flags.includes('--borrador');
    const conectados = await canales();
    let enviadas = 0;
    for (const pub of lista) {
      if (pub.buffer_id || !pub.aprobado) continue;
      const p = problemas(pub);
      if (p.length) { console.log(`– ${pub.id}: no se envía (${p.join(' · ')})`); continue; }
      const post = await crear(pub, await canalDe(pub.red, conectados), borrador);
      pub.buffer_id = post.id;
      pub.buffer_estado = borrador ? 'borrador' : 'programada';
      fs.writeFileSync(ruta, `${JSON.stringify(lista, null, 2)}\n`);
      console.log(`✓ ${pub.id} → ${pub.red} ${post.dueAt || pub.cuando}${borrador ? ' (borrador)' : ''}`);
      enviadas++;
    }
    console.log(`${enviadas} publicaciones enviadas a Buffer.`);
    return;
  }

  console.log('Comandos: canales · esquema · revisar <semana.json> · subir <semana.json> · programar <semana.json> [--borrador]');
}

main().catch(e => { console.error(e.message); process.exit(1); });
