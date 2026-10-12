#!/usr/bin/env node
/**
 * marketing/redes/buffer/viaje.mjs — sesión 13: «modo viaje».
 *
 * Lo normal es que Mario suba los vídeos a mano desde salida/PARA-SUBIR/. Este guion solo se usa cuando él lo
 * pide (viaje, imprevisto): programa en Buffer los vídeos de PARA-SUBIR, en orden, a partir del último publicado.
 *
 * Uso (desde la raíz del repo):
 *   node marketing/redes/buffer/viaje.mjs estado                 qué hay en PARA-SUBIR y qué hay programado (sin red)
 *   node marketing/redes/buffer/viaje.mjs lanzar --simular       enseña el plan sin tocar Buffer ni el servidor
 *   node marketing/redes/buffer/viaje.mjs lanzar [--al-dia N]    programa hasta llenar Buffer (10); N = 1-4, por defecto 2
 *   node marketing/redes/buffer/viaje.mjs parar                  retira de Buffer lo programado por el modo viaje
 *   node marketing/redes/buffer/viaje.mjs vaciar-antiguo         retira lo que quedó programado con la herramienta antigua
 *
 * Carpeta de cada vídeo: salida/PARA-SUBIR/<NNN-tema>/ con video.mp4 y texto.txt (texto de la publicación);
 * opcionales titulo.txt y portada-ms.txt (milisegundo del fotograma de portada; por defecto 900).
 * Reglas: nunca menos de 4-5 h entre vídeos (TikTok penalizó la cuenta por publicar en ráfaga); Buffer gratis
 * admite 10 programadas y su API 250 peticiones al día, así que aquí no hay bucles: una pasada y fuera.
 * Los vídeos cuya hora ya pasó se mueven solos a salida/SUBIDOS/. Estado en salida/_control/viaje.json.
 * Claves en marketing/redes/buffer/.env (BUFFER_API_KEY, MEDIA_RSYNC_DEST; no se versiona).
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SALIDA = path.resolve(HERE, '../salida');
const PARA = path.join(SALIDA, 'PARA-SUBIR');
const SUBIDOS = path.join(SALIDA, 'SUBIDOS');
const ESTADO = path.join(SALIDA, '_control/viaje.json');
const HISTORIAL = path.join(HERE, 'publicaciones');
const API = 'https://api.buffer.com';
const TOPE_BUFFER = 10, TOPE_PETICIONES = 200;
const HUECOS = { 1: ['18:00'], 2: ['13:30', '22:30'], 3: ['09:00', '13:30', '18:00'], 4: ['09:00', '13:30', '18:00', '22:30'] };

for (const linea of (fs.existsSync(path.join(HERE, '.env')) ? fs.readFileSync(path.join(HERE, '.env'), 'utf8') : '').split('\n')) {
  const m = linea.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const MEDIA_BASE = (process.env.MEDIA_BASE_URL || 'https://nokfi.app/api/redes-media').replace(/\/+$/, '');

const estado = fs.existsSync(ESTADO) ? JSON.parse(fs.readFileSync(ESTADO, 'utf8')) : { canal: null, programados: [], peticiones: {} };
const guardar = () => { fs.mkdirSync(path.dirname(ESTADO), { recursive: true }); fs.writeFileSync(ESTADO, `${JSON.stringify(estado, null, 1)}\n`); };
const hoy = () => new Date().toISOString().slice(0, 10);

async function gql(query, variables = {}) {
  if (!process.env.BUFFER_API_KEY) throw new Error('Falta BUFFER_API_KEY en marketing/redes/buffer/.env');
  if ((estado.peticiones[hoy()] || 0) >= TOPE_PETICIONES) throw new Error(`Tope propio de ${TOPE_PETICIONES} peticiones al día alcanzado: mañana más.`);
  estado.peticiones = { [hoy()]: (estado.peticiones[hoy()] || 0) + 1 }; guardar();
  const r = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.BUFFER_API_KEY}` }, body: JSON.stringify({ query, variables }) });
  const body = await r.json().catch(() => ({}));
  if (r.status === 429) throw new Error(`Buffer no admite más peticiones hasta dentro de ${Math.ceil((+r.headers.get('retry-after') || 0) / 60)} min.`);
  if (!r.ok || body.errors) throw new Error(`Buffer ${r.status}: ${JSON.stringify(body.errors || body).slice(0, 300)}`);
  return body.data;
}

/** Hora de Madrid "AAAA-MM-DDTHH:MM" → ISO UTC (con cambio de hora). */
function madridAUtc(local) {
  const [d, t] = local.split('T'); const [Y, M, D] = d.split('-').map(Number); const [h, mi] = t.split(':').map(Number);
  const supuesto = Date.UTC(Y, M - 1, D, h, mi);
  const p = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Madrid', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
    .formatToParts(new Date(supuesto)).reduce((o, x) => ({ ...o, [x.type]: x.value }), {});
  return new Date(supuesto - (Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute) - supuesto)).toISOString();
}
const pasado = (cuando) => new Date(madridAUtc(cuando)) <= new Date();
const diaMadrid = (fecha) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Madrid' }).format(fecha);

/** Lo ya publicado pasa de PARA-SUBIR a SUBIDOS. */
function archivarPublicados() {
  for (const p of estado.programados.filter(x => !x.subido && pasado(x.cuando))) {
    const de = path.join(PARA, p.carpeta);
    if (fs.existsSync(de)) { fs.mkdirSync(SUBIDOS, { recursive: true }); fs.renameSync(de, path.join(SUBIDOS, p.carpeta)); }
    p.subido = true;
  }
  guardar();
}

function pendientes() {
  if (!fs.existsSync(PARA)) return [];
  const ya = new Set(estado.programados.map(p => p.carpeta));
  return fs.readdirSync(PARA).sort().filter(n => fs.statSync(path.join(PARA, n)).isDirectory() && !ya.has(n)).map(n => {
    const dir = path.join(PARA, n);
    const falta = ['video.mp4', 'texto.txt'].filter(f => !fs.existsSync(path.join(dir, f)));
    return { carpeta: n, dir, falta };
  });
}

/** Huecos libres a partir de `desde` (Date), respetando la rejilla del día. */
function* huecos(desde, alDia) {
  for (let d = new Date(desde); ; d = new Date(d.getTime() + 86400000)) {
    for (const h of HUECOS[alDia]) {
      const c = `${diaMadrid(d)}T${h}`;
      if (new Date(madridAUtc(c)) > desde) yield c;
    }
  }
}

async function canal() {
  if (estado.canal) return estado.canal;
  const d = await gql('query { account { organizations { id } } }');
  for (const org of d.account.organizations) {
    const c = await gql(`query { channels(input: { organizationId: ${JSON.stringify(org.id)} }) { id service } }`);
    const tk = c.channels.find(ch => String(ch.service).toLowerCase() === 'tiktok');
    if (tk) { estado.canal = tk.id; guardar(); return tk.id; }
  }
  throw new Error('No hay ninguna cuenta de TikTok conectada en Buffer');
}

async function main() {
  const [cmd, ...flags] = process.argv.slice(2);
  const simular = flags.includes('--simular');
  const alDia = flags.includes('--al-dia') ? +flags[flags.indexOf('--al-dia') + 1] : 2;
  if (!HUECOS[alDia]) throw new Error('--al-dia admite 1, 2, 3 o 4');

  if (cmd === 'estado' || cmd === 'lanzar') {
    if (!simular) archivarPublicados();
    const activos = estado.programados.filter(p => !pasado(p.cuando));
    const cola = pendientes();
    console.log(`En Buffer por el modo viaje: ${activos.length} · en PARA-SUBIR sin programar: ${cola.length}`);
    for (const p of activos) console.log(`  programado ${p.cuando}  ${p.carpeta}`);
    if (cmd === 'estado') { for (const c of cola) console.log(`  pendiente  ${c.carpeta}${c.falta.length ? `  ⚠ falta ${c.falta.join(', ')}` : ''}`); return; }

    // Primer hueco: 4 h después de lo último publicado o programado, y nunca antes de media hora desde ahora.
    const ultimo = estado.programados.map(p => new Date(madridAUtc(p.cuando)).getTime()).sort((a, b) => b - a)[0] || 0;
    const desde = new Date(Math.max(Date.now() + 30 * 60000, ultimo + 4 * 3600000 - 60000));
    const gen = huecos(desde, alDia);
    let libres = TOPE_BUFFER - activos.length, hechos = 0;
    for (const c of cola) {
      if (libres <= 0) break;
      if (c.falta.length) { console.log(`– ${c.carpeta}: falta ${c.falta.join(', ')}; me paro aquí para no alterar el orden.`); break; }
      const cuando = gen.next().value;
      if (simular) { console.log(`  (simulado) ${cuando}  ${c.carpeta}`); libres--; hechos++; continue; }
      if (!process.env.MEDIA_RSYNC_DEST) throw new Error('Falta MEDIA_RSYNC_DEST en marketing/redes/buffer/.env');
      execFileSync('rsync', ['-az', '--chmod=D755,F644', `${c.dir}/`, `${process.env.MEDIA_RSYNC_DEST.replace(/\/?$/, '/')}${c.carpeta}/`], { stdio: 'ignore' });
      const leer = (f) => fs.existsSync(path.join(c.dir, f)) ? fs.readFileSync(path.join(c.dir, f), 'utf8').trim() : '';
      const url = `${MEDIA_BASE}/${c.carpeta}/video.mp4?v=${Math.round(fs.statSync(path.join(c.dir, 'video.mp4')).mtimeMs / 1000)}`;
      const input = { text: leer('texto.txt'), channelId: await canal(), schedulingType: 'automatic', mode: 'customScheduled', dueAt: madridAUtc(cuando),
        assets: [{ video: { url, metadata: { thumbnailOffset: +leer('portada-ms.txt') || 900 } } }],
        metadata: { tiktok: { ...(leer('titulo.txt') ? { title: leer('titulo.txt') } : {}), isAiGenerated: true } } };
      const d = await gql(`mutation($input: CreatePostInput!) { createPost(input: $input) { ... on PostActionSuccess { post { id } } ... on MutationError { message } } }`, { input });
      if (d.createPost.message) throw new Error(`${c.carpeta}: ${d.createPost.message}`);
      estado.programados.push({ carpeta: c.carpeta, cuando, buffer_id: d.createPost.post.id }); guardar();
      console.log(`✓ ${cuando}  ${c.carpeta}`); libres--; hechos++;
    }
    console.log(`${hechos} ${simular ? 'se programarían' : 'programados'} · ${alDia} al día (${HUECOS[alDia].join(', ')}).`);
    return;
  }

  if (cmd === 'parar') {
    archivarPublicados();
    for (const p of estado.programados.filter(x => !x.subido && x.buffer_id)) {
      await gql(`mutation { deletePost(input: { id: ${JSON.stringify(p.buffer_id)} }) { __typename } }`);
      estado.programados = estado.programados.filter(x => x !== p); guardar();
      console.log(`↩ ${p.carpeta}: retirado de Buffer (sigue en PARA-SUBIR)`);
    }
    console.log('Modo viaje parado.');
    return;
  }

  if (cmd === 'vaciar-antiguo') {
    let quedan = 0;
    for (const n of fs.readdirSync(HISTORIAL).filter(x => x.endsWith('.json'))) {
      const ruta = path.join(HISTORIAL, n); const lista = JSON.parse(fs.readFileSync(ruta, 'utf8'));
      for (const pub of lista.filter(x => x.buffer_id && !pasado(x.cuando)).sort((a, b) => a.cuando.localeCompare(b.cuando))) {
        try {
          await gql(`mutation { deletePost(input: { id: ${JSON.stringify(pub.buffer_id)} }) { __typename } }`);
          delete pub.buffer_id; delete pub.buffer_estado; pub.aprobado = false;
          fs.writeFileSync(ruta, `${JSON.stringify(lista, null, 2)}\n`);
          console.log(`↩ ${pub.id} (${pub.cuando}) retirada`);
        } catch (e) { quedan++; console.log(`– ${pub.id}: ${e.message.slice(0, 120)}`); }
      }
    }
    console.log(quedan ? `QUEDAN ${quedan} sin retirar.` : 'Buffer a cero (de lo que programó la herramienta antigua).');
    if (quedan) process.exitCode = 1;
    return;
  }

  console.log('Comandos: estado · lanzar [--simular] [--al-dia N] · parar · vaciar-antiguo');
}

main().catch(e => { console.error(e.message); process.exit(1); });
