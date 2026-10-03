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
