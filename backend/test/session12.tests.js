/**
 * test/session12.tests.js — sesión 12 (SEO): eventos de la web pública.
 *
 * POST /api/events cuenta clics y usos sin cookies ni datos personales
 * (solo día, evento y ruta) y el informe diario los resume.
 */

'use strict';

module.exports = async function session12Tests({ post, check, getDB }) {
  const ok = await post('/api/events', { name: 'cta_trial', path: '/calculadora-iva?utm=x#faq' });
  await post('/api/events', { name: 'cta_trial', path: '/calculadora-iva' });
  await post('/api/events', { name: 'tool_use', path: '/en/spain-vat-calculator/' });
  check('S12: POST /api/events responde 204 sin sesión', () => ok.status === 204);

  const bad = await post('/api/events', { name: 'page_view', path: '/home' });
  check('S12: evento desconocido → 400', () => bad.status === 400);

  await post('/api/events', { name: 'checkout_start', path: '<script>alert(1)</script>' });
  const db = getDB();
  const rows = db.prepare('SELECT name, path, count FROM web_events ORDER BY name, path').all();
  check('S12: se agrupa por evento y ruta limpia (sin query, hash ni barra final)', () =>
    rows.some(r => r.name === 'cta_trial' && r.path === '/calculadora-iva' && r.count === 2)
    && rows.some(r => r.name === 'tool_use' && r.path === '/en/spain-vat-calculator'));
  check('S12: una ruta que no es de la web se guarda vacía', () => rows.some(r => r.name === 'checkout_start' && r.path === ''));
  check('S12: la tabla no guarda IP ni user-agent', () =>
    db.prepare('PRAGMA table_info(web_events)').all().map(c => c.name).join(',') === 'day,name,path,count');

  const { eventsForDay } = require('../services/webEvents');
  const today = new Date().toISOString().slice(0, 10);
  const day = eventsForDay(today);
  check('S12: resumen del día con los totales por evento', () => day.totals.cta_trial === 2 && day.totals.tool_use === 1 && day.totals.checkout_start === 1);

  const { buildOpsReport } = require('../services/opsReport');
  const report = buildOpsReport(new Date(Date.now() + 86400000));
  check('S12: el informe diario incluye la web pública de ayer', () => report.web?.day === today && report.web.totals.cta_trial === 2);
};
