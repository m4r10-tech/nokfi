/**
 * test/session15b-peticiones.tests.js — S15b, lote 1 (peticiones del usuario).
 *
 *   U10  sociedad: sin 130/IRPF en el calendario, el chat y el contexto financiero
 *
 * Se ejecuta desde test/e2e.test.js con sus helpers (misma BD temporal y server).
 * Sin IA real.
 */

'use strict';

module.exports = async function session15bPeticionesTests({ post, put, get, check }) {
  async function account(email, legalForm, plan = 'pro') {
    const lic = await post('/api/admin/licenses', { email, plan, password: 'Peticion15b!' }, 'admin');
    const login = await post('/api/auth/login', { email, license_key: lic.data.key, password: 'Peticion15b!' });
    const tok = login.data.token;
    if (legalForm) await put('/api/profile', { legalForm }, tok);
    return { tok, lid: lic.data.id, key: lic.data.key };
  }

  // ═══ U10 — sociedad (opción B): sin 130 ni «IRPF»; 111/115 como «Si te aplica» ═══
  {
    const { deadlinesFor } = require('../utils/fiscalCalendar');
    const soc = deadlinesFor(2026, 'sociedad');
    const quarterly = soc.filter(d => d.models.includes('303'));
    check('S15b U10: calendario de sociedad sin el 130 en ningún plazo', () => soc.every(d => !d.models.includes('130')));
    check('S15b U10: los trimestrales de sociedad son solo el IVA (303, tipo quarterly_vat, sin el texto con IRPF)', () =>
      quarterly.length === 4 && quarterly.every(d => d.models.join() === '303' && d.kind === 'quarterly_vat'));
    const wh = soc.filter(d => d.kind === 'withholdings');
    check('S15b U10: 111/115 de sociedad en los 4 trimestres, aparte y como «Si te aplica» (conditional)', () =>
      wh.length === 4 && wh.every(d => d.models.join() === '111,115' && d.conditional === true)
      && new Set(soc.map(d => d.key)).size === soc.length);
    const auto = deadlinesFor(2026, 'autonomo');
    check('S15b U10: el calendario del autónomo no cambia (303+130+111+115 en el 1T)', () =>
      auto.find(d => d.key === '2026-1T')?.models.join() === '303,130,111,115' && auto.find(d => d.key === '2026-1T').kind === 'quarterly');

    const c = await account('peticiones-sl@nokfi.local', 'sociedad');
    const cal = await get('/api/finance/calendar?year=2026', c.tok);
    check('S15b U10: GET /api/finance/calendar de una SL no lleva 130', () =>
      cal.status === 200 && cal.data.deadlines.length > 0 && cal.data.deadlines.every(d => !d.models.includes('130')));

    const { chatSystemPrompt } = require('../services/ai/chat');
    const { financeContext } = require('../services/ai/financeContext');
    const { getCompanyProfile } = require('../db/database');
    const fin = financeContext(c.lid, { lang: 'es' }).text;
    const prompt = chatSystemPrompt({ profile: getCompanyProfile(c.lid), lang: 'es', financeText: fin });
    check('S15b U10/F2: el chat de una SL no ofrece «303/130» y le dice al modelo que no presenta el 130', () =>
      !prompt.includes('303/130') && /NO presenta el modelo 130/.test(fin) && /202/.test(fin) && /111 y el 115/.test(fin));
    const a = await account('peticiones-auto@nokfi.local', 'autonomo');
    const pa = chatSystemPrompt({ profile: getCompanyProfile(a.lid), lang: 'es', financeText: financeContext(a.lid, { lang: 'es' }).text });
    check('S15b U10: el chat del autónomo sigue con 303/130 y sin el aviso de sociedad', () => pa.includes('303/130') && !/NO presenta el modelo 130/.test(pa));
  }
};
