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
};
