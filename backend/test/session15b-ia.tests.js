/**
 * test/session15b-ia.tests.js — S15b, lote 5 (IA y diagnóstico).
 *
 * Todo con la IA SIMULADA (global.fetch falso, como el resto de e2e):
 *   D2  el prompt del chat no hace rechazar preguntas financieras en otro idioma
 *       y pide responder en el idioma de la pregunta
 *   D3  el contexto del libro etiqueta cada modelo con su plazo (303/130 vs 111/115)
 *   D5  asunto del email de reclamación aunque la IA escriba algo antes de «ASUNTO:»
 *       (+ provider en la respuesta para el aviso de IA de respaldo)
 *   D6  la media de una columna no cuenta las filas a 0
 *   D8  renombrar y borrar análisis en la web y en /api/v1 (nk_test_ no toca lo real)
 */

'use strict';

const http = require('http');

module.exports = async function session15bIaTests({ post, put, get, check, checkAsync, getDB }) {
  function req(method, path, { body, auth } = {}) {
    return new Promise((resolve, reject) => {
      const data = body === undefined ? undefined : JSON.stringify(body);
      const h = { 'Content-Type': 'application/json' };
      if (data) h['Content-Length'] = Buffer.byteLength(data);
      if (auth) h.Authorization = `Bearer ${auth}`;
      const r = http.request(`http://localhost:${process.env.PORT}${path}`, { method, headers: h }, (res) => {
        let b = '';
        res.on('data', d => { b += d; });
        res.on('end', () => { let j; try { j = JSON.parse(b); } catch { j = b; } resolve({ status: res.statusCode, data: j }); });
      });
      r.on('error', reject);
      if (data) r.write(data);
      r.end();
    });
  }
  const patch = (path, body, auth) => req('PATCH', path, { body, auth });
  const del = (path, auth) => req('DELETE', path, { auth });

  async function account(email, legalForm) {
    const lic = await post('/api/admin/licenses', { email, plan: 'pro', password: 'IaLote5!x' }, 'admin');
    const login = await post('/api/auth/login', { email, license_key: lic.data.key, password: 'IaLote5!x' });
    const tok = login.data.token;
    if (legalForm) await put('/api/profile', { legalForm }, tok);
    return { tok, lid: lic.data.id };
  }

  // ── D2: chat en cualquier idioma y en el idioma de la pregunta ──
  {
    const { chatSystemPrompt } = require('../services/ai/chat');
    const sys = chatSystemPrompt({ profile: null, lang: 'es', analysisContext: '', financeText: 'Por cobrar: nada pendiente.' });
    check('S15b D2: el prompt del chat ya no dice «si te preguntan otra cosa, di que solo puedes ayudar» sin más', () =>
      !sys.includes('Si te preguntan otra cosa, di amablemente que solo puedes ayudar con eso.'));
    check('S15b D2: las preguntas financieras son válidas en cualquier idioma (inglés, francés…) y no se rechazan', () =>
      /SIEMPRE válidas/.test(sys) && sys.includes('inglés') && sys.includes('francés') && /NO la convierte en ajena/.test(sys));
    check('S15b D2: pide responder en el idioma de la pregunta, no en el de la interfaz (sin «Escribe TODO… en español»)', () =>
      sys.includes('mismo idioma en que está escrita la última pregunta del usuario') && !sys.includes('Escribe TODO el contenido en español')
      && chatSystemPrompt({ profile: null, lang: 'pl' }).includes('responde en polaco'));
  }

  // ── D3: cada modelo con su nombre y su plazo ──
  {
    const { financeContext } = require('../services/ai/financeContext');
    const a = await account('ia-d3-autonomo@nokfi.local', 'autonomo');
    await post('/api/ledger', { entries: [
      { type: 'income', party_name: 'Cliente D3', invoice_number: 'D3-1', invoice_date: '2026-11-02', base: 1000, vat_amount: 210, total: 1210 },
      { type: 'expense', party_name: 'Proveedor D3', invoice_number: 'P-1', invoice_date: '2026-11-03', base: 200, vat_amount: 42, total: 242 }
    ] }, a.tok);
    // 10 de enero: el próximo plazo es el de 111/115 (20-ene) y el 303/130 del 4T vence más tarde.
    const t = financeContext(a.lid, { today: '2027-01-10' }).text;
    const nextLine = t.split('\n').find(l => l.startsWith('Próximo plazo fiscal')) || '';
    const taxLine = t.split('\n').find(l => l.startsWith('Impuestos estimados')) || '';
    check('S15b D3: el próximo plazo nombra cada modelo (111 retenciones…, 115 alquileres) y dice que Nokfi no estima su importe', () =>
      nextLine.includes('modelo 111 (retenciones de trabajadores y profesionales)') && nextLine.includes('modelo 115 (retenciones de alquileres)')
      && nextLine.includes('Nokfi no estima el importe de el 111 ni el 115') && nextLine.includes('20 de enero de 2027'));
    check('S15b D3: la línea de impuestos estimados dice que son SOLO los modelos 303 y 130, con su plazo, y que no se mezclen con 111/115', () =>
      taxLine.includes('solo modelos 303 y 130') && taxLine.includes('plazo de estos modelos') && /no mezcles este importe ni este plazo con los de otros modelos como el 111 o el 115/.test(taxLine)
      && taxLine.includes('2027') && taxLine.includes('IVA (303)'));
    const s = await account('ia-d3-sociedad@nokfi.local', 'sociedad');
    await post('/api/ledger', { entries: [{ type: 'income', party_name: 'C', invoice_number: 'S-1', invoice_date: '2026-11-02', base: 100, vat_amount: 21, total: 121 }] }, s.tok);
    check('S15b D3: en una sociedad la línea de impuestos dice «solo modelo 303» (sin 130)', () =>
      (financeContext(s.lid, { today: '2027-01-10' }).text.split('\n').find(l => l.startsWith('Impuestos estimados')) || '').includes('solo modelo 303 ('));
  }

  // ── D5: asunto tolerante + provider ──
  {
    const saved = { fetch: global.fetch, GK: process.env.GEMINI_API_KEY };
    process.env.GEMINI_API_KEY = 'fake-key-for-test';
    let reply = '';
    global.fetch = async () => ({ ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: reply }] } }] }), text: async () => '' });
    const a = await account('ia-d5@nokfi.local');
    const id = (await post('/api/ledger', { entries: [{ type: 'income', party_name: 'Delta SL', invoice_number: 'D5-1', invoice_date: '2026-08-01', base: 100, vat_amount: 21, total: 121 }] }, a.tok)).data.ids?.[0];
    reply = 'Claro, aquí tienes el email:\n\n**ASUNTO:** Factura D5-1 pendiente\n\nHola,\nle recordamos la factura D5-1.\n\nTaller Delta';
    await checkAsync('S15b D5: con texto antes de «ASUNTO:» (y en negrita) el asunto sale y no queda en el cuerpo',
      post('/api/finance/collection-email', { entry_id: id, tone: 'friendly', lang: 'es' }, a.tok),
      r => r.status === 200 && r.data.subject === 'Factura D5-1 pendiente' && r.data.body.startsWith('Hola,') && !/ASUNTO|aquí tienes/i.test(r.data.body));
    reply = 'SUBJECT: Invoice D5-1\n\nHello,\nfriendly reminder.';
    await checkAsync('S15b D5: el formato normal (primera línea) sigue igual, también en inglés, y devuelve el proveedor',
      post('/api/finance/collection-email', { entry_id: id, tone: 'friendly', lang: 'en' }, a.tok),
      r => r.status === 200 && r.data.subject === 'Invoice D5-1' && r.data.body === 'Hello,\nfriendly reminder.' && r.data.provider === 'gemini');
    global.fetch = saved.fetch;
    if (saved.GK === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = saved.GK;
  }

  // ── D6: media sin las filas a 0 ──
  {
    const { tableStats } = require('../utils/tableStats');
    const caja = [
      { Fecha: '2026-10-01', Concepto: 'Cobro A', Entradas: 1200, Salidas: 0, Saldo: 2200 },
      { Fecha: '2026-10-05', Concepto: 'Alquiler', Entradas: 0, Salidas: 600, Saldo: 1600 },
      { Fecha: '2026-10-10', Concepto: 'Luz', Entradas: 0, Salidas: 150, Saldo: 1450 },
      { Fecha: '2026-10-15', Concepto: 'Cobro B', Entradas: 900, Salidas: 0, Saldo: 2350 },
      { Fecha: '2026-10-20', Concepto: 'Gestoría', Entradas: 0, Salidas: 200, Saldo: 2150 },
      { Fecha: '2026-10-25', Concepto: 'Material', Entradas: 0, Salidas: 300, Saldo: 1850 }
    ];
    const st = tableStats(caja);
    check('S15b D6: Excel › Caja: media de entradas 1.050 (no 350) y de salidas 312,50; la suma no cambia', () =>
      st.totales.Entradas.media === 1050 && st.totales.Entradas.suma === 2100 && st.totales.Salidas.media === 312.5 && st.totales.Salidas.suma === 1250);
  }

  // ── D8: renombrar y borrar (web + API) ──
  {
    const { createAnalysis } = require('../db/database');
    const { createActionsForAnalysis } = require('../db/actions');
    const a = await account('ia-d8@nokfi.local');
    const b = await account('ia-d8-otro@nokfi.local');
    const mk = (lid, title) => {
      const id = createAnalysis({ license_id: lid, kind: 'cuestionario', title, result_json: { summary: 's', priorities: [], action_plan: [] } });
      createActionsForAnalysis(lid, id, [{ title: 'Tarea 1' }, { title: 'Tarea 2' }]);
      return id;
    };
    const id1 = mk(a.lid, 'Diagnóstico de negocio');
    const id2 = mk(a.lid, 'Caja · oct 2026');
    const other = mk(b.lid, 'Ajeno');
    getDB().prepare('INSERT OR IGNORE INTO ai_usage (license_id, day, slot) VALUES (?, ?, 0)').run(a.lid, new Date().toISOString().slice(0, 10));

    await checkAsync('S15b D8: PATCH /api/analyses/:id renombra (espacios juntados) y se ve en la lista',
      patch(`/api/analyses/${id1}`, { title: '  Diagnóstico   noviembre  ' }, a.tok).then(async r => ({ r, list: (await get('/api/analyses', a.tok)).data })),
      ({ r, list }) => r.status === 200 && r.data.title === 'Diagnóstico noviembre'
        && list.analyses.find(x => x.id === id1)?.title === 'Diagnóstico noviembre');
    await checkAsync('S15b D8: título vacío o de más de 120 caracteres → 400 invalid_title',
      Promise.all([patch(`/api/analyses/${id1}`, { title: '   ' }, a.tok), patch(`/api/analyses/${id1}`, { title: 'x'.repeat(121) }, a.tok)]),
      rs => rs.every(r => r.status === 400 && r.data.error === 'invalid_title'));
    await checkAsync('S15b D8: no se puede renombrar ni borrar un análisis de otra cuenta (404, sin tocarlo)',
      Promise.all([patch(`/api/analyses/${other}`, { title: 'x' }, a.tok), del(`/api/analyses/${other}`, a.tok)]),
      rs => rs.every(r => r.status === 404) && getDB().prepare('SELECT title FROM analyses WHERE id = ?').get(other)?.title === 'Ajeno');
    const tasksBefore = getDB().prepare('SELECT COUNT(*) c FROM action_items WHERE analysis_id = ?').get(id2).c;
    const quotaBefore = getDB().prepare('SELECT COUNT(*) c FROM ai_usage WHERE license_id = ?').get(a.lid).c;
    await checkAsync('S15b D8: DELETE /api/analyses/:id lo borra con sus tareas; ya no se abre (404)',
      del(`/api/analyses/${id2}`, a.tok).then(async r => ({ r, after: await get(`/api/analyses/${id2}`, a.tok) })),
      ({ r, after }) => r.status === 200 && r.data.success === true && tasksBefore === 2
        && !getDB().prepare('SELECT 1 FROM analyses WHERE id = ?').get(id2)
        && getDB().prepare('SELECT COUNT(*) c FROM action_items WHERE analysis_id = ?').get(id2).c === 0
        && after.status === 404);
    check('S15b D8: borrar un análisis no devuelve cuota (ai_usage intacto)', () =>
      getDB().prepare('SELECT COUNT(*) c FROM ai_usage WHERE license_id = ?').get(a.lid).c === quotaBefore);
    await checkAsync('S15b D8: borrar dos veces → 404; id no numérico → 400',
      Promise.all([del(`/api/analyses/${id2}`, a.tok), del('/api/analyses/abc', a.tok)]),
      ([r1, r2]) => r1.status === 404 && r2.status === 400 && r2.data.error === 'invalid_id');

    // API /api/v1: clave real y clave de prueba.
    const live = (await post('/api/keys', { name: 'd8-live' }, a.tok)).data.key;
    const test = (await post('/api/keys', { name: 'd8-test', mode: 'test' }, a.tok)).data.key;
    const id3 = mk(a.lid, 'Para la API');
    await checkAsync('S15b D8 API: una clave nk_test_ no renombra ni borra un análisis real (404 y queda igual)',
      Promise.all([patch(`/api/v1/analyses/${id3}`, { title: 'Cambiado' }, test), del(`/api/v1/analyses/${id3}`, test)]),
      rs => String(test).startsWith('nk_test_') && rs.every(r => r.status === 404 && r.data.error === 'not_found')
        && getDB().prepare('SELECT title FROM analyses WHERE id = ?').get(id3)?.title === 'Para la API');
    await checkAsync('S15b D8 API: PATCH /api/v1/analyses/:id con clave real renombra; título inválido → 400',
      Promise.all([patch(`/api/v1/analyses/${id3}`, { title: 'Informe API' }, live), patch(`/api/v1/analyses/${id3}`, { title: '' }, live)]),
      ([ok, bad]) => ok.status === 200 && ok.data.title === 'Informe API' && bad.status === 400 && bad.data.error === 'invalid_title'
        && getDB().prepare('SELECT title FROM analyses WHERE id = ?').get(id3)?.title === 'Informe API');
    await checkAsync('S15b D8 API: la clave real no toca análisis de otra cuenta (404)',
      del(`/api/v1/analyses/${other}`, live), r => r.status === 404 && !!getDB().prepare('SELECT 1 FROM analyses WHERE id = ?').get(other));
    await checkAsync('S15b D8 API: DELETE /api/v1/analyses/:id con clave real lo borra; después GET → 404',
      del(`/api/v1/analyses/${id3}`, live).then(async r => ({ r, after: await get(`/api/v1/analyses/${id3}`, live) })),
      ({ r, after }) => r.status === 200 && r.data.deleted === true && after.status === 404);
    const spec = (await get('/api/v1/openapi.json')).data;
    check('S15b D8 API: la especificación OpenAPI declara PATCH y DELETE de /analyses/{id}', () =>
      !!spec.paths['/analyses/{id}'].patch?.requestBody && !!spec.paths['/analyses/{id}'].delete?.responses[404]);
  }
};
