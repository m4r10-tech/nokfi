/**
 * test/session13.tests.js — sesión 13 (redes): entradas desde X, Instagram y
 * TikTok. Los enlaces de cada red llevan ?utm_source=<red> y la web suma
 * ref_<red> en la página de llegada (mismos recuentos sin cookies de la S12).
 */

'use strict';

module.exports = async function session13Tests({ post, check }) {
  const a = await post('/api/events', { name: 'ref_instagram', path: '/calculadora-cuota-autonomos' });
  await post('/api/events', { name: 'ref_instagram', path: '/calculadora-cuota-autonomos?utm_source=instagram' });
  await post('/api/events', { name: 'ref_x', path: '/home' });
  await post('/api/events', { name: 'ref_tiktok', path: '/guias/modelo-303-iva-trimestral' });
  check('S13: las entradas desde redes se aceptan (204)', () => a.status === 204);

  const bad = await post('/api/events', { name: 'ref_facebook', path: '/home' });
  check('S13: una red sin enlaces propios → 400', () => bad.status === 400);

  const { eventsForDay } = require('../services/webEvents');
  const day = eventsForDay(new Date().toISOString().slice(0, 10));
  check('S13: totales del día por red', () => day.totals.ref_instagram === 2 && day.totals.ref_x === 1 && day.totals.ref_tiktok === 1);
  check('S13: se agrupan por página de llegada sin la query', () =>
    day.top.some(r => r.name === 'ref_instagram' && r.path === '/calculadora-cuota-autonomos' && r.count === 2));
};

/** Imágenes de las publicaciones para Buffer: /api/redes-media/<pieza>/<archivo>. */
module.exports.media = async function session13MediaTests({ get, check }) {
  const fs = require('fs');
  const path = require('path');
  const dir = path.join(process.env.SOCIAL_MEDIA_DIR, '2026-10-06-303-3t');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, '01-portada.png'), Buffer.from('89504e470d0a1a0a', 'hex'));
  fs.writeFileSync(path.join(dir, 'notas.txt'), 'privado');
  fs.writeFileSync(path.join(process.env.SOCIAL_MEDIA_DIR, '.env'), 'SECRETO=1');

  const ok = await get('/api/redes-media/2026-10-06-303-3t/01-portada.png');
  check('S13: una imagen de redes se sirve sin sesión (200)', () => ok.status === 200);
  const missing = await get('/api/redes-media/2026-10-06-303-3t/99-nada.png');
  check('S13: imagen inexistente → 404', () => missing.status === 404);
  const txt = await get('/api/redes-media/2026-10-06-303-3t/notas.txt');
  const dot = await get('/api/redes-media/.env');
  const up = await get('/api/redes-media/..%2F..%2Fserver.js');
  const listing = await get('/api/redes-media/2026-10-06-303-3t/');
  check('S13: solo PNG/JPG/MP4 dentro de una pieza (ni .txt, ni .env, ni rutas hacia arriba, ni listados)', () =>
    [txt, dot, up, listing].every(r => r.status === 404));
};
