/**
 * test/session15b-t4-ia.tests.js — S15b T4, lote 12 (IA y diagnóstico).
 *
 * Todo con la IA SIMULADA (global.fetch falso, como el resto de e2e):
 *   D4  cancelar en el servidor: cola de la IA local, petición cortada por el
 *       navegador y respuesta aplazada (DELETE /api/pending/:id); sin gastar crédito
 */

'use strict';

const http = require('http');

module.exports = async function session15bT4IaTests({ post, put, get, call, check, checkAsync, getDB }) {
  const tick = (ms = 10) => new Promise(r => setTimeout(r, ms));
  // Sin el arreglo, algunas promesas no acaban nunca: se da por fallo en vez de colgar la suite.
  const within = (p, ms = 1000) => Promise.race([p, tick(ms).then(() => 'timeout')]);

  async function account(email, legalForm) {
    const lic = await post('/api/admin/licenses', { email, plan: 'pro', password: 'IaLote12!x' }, 'admin');
    const login = await post('/api/auth/login', { email, license_key: lic.data.key, password: 'IaLote12!x' });
    const tok = login.data.token;
    if (legalForm) await put('/api/profile', { legalForm }, tok);
    return { tok, lid: lic.data.id };
  }

  /** IA simulada (Gemini por global.fetch). `hang`: no responde hasta que se aborta. */
  function fakeAi() {
    const st = { reply: '', hang: false, calls: 0, aborted: 0, last: null };
    st.saved = { fetch: global.fetch, GK: process.env.GEMINI_API_KEY };
    process.env.GEMINI_API_KEY = 'fake-key-for-test';
    global.fetch = (url, opts = {}) => {
      st.calls++;
      st.last = opts.body ? JSON.parse(opts.body) : null;
      if (st.hang) {
        return new Promise((_res, rej) => {
          opts.signal?.addEventListener('abort', () => { st.aborted++; rej(new Error('aborted')); }, { once: true });
        });
      }
      const text = typeof st.reply === 'function' ? st.reply(st.last) : st.reply;
      return Promise.resolve({ ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text }] } }] }), text: async () => '' });
    };
    st.restore = () => {
      global.fetch = st.saved.fetch;
      if (st.saved.GK === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = st.saved.GK;
    };
    return st;
  }

  /** POST que el «navegador» corta a los `ms` (como un AbortController en fetch). */
  function cutAfter(path, payload, tok, ms, beforeCut) {
    const body = JSON.stringify(payload);
    return new Promise((resolve) => {
      const r = http.request(`http://localhost:${process.env.PORT}${path}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body), Authorization: `Bearer ${tok}` }
      }, () => resolve());
      r.on('error', () => resolve());
      r.write(body);
      r.end();
      setTimeout(() => { if (beforeCut) beforeCut(); r.destroy(); }, ms);
    });
  }

  const usage = (lid) => getDB().prepare('SELECT COUNT(*) c FROM ai_usage WHERE license_id = ?').get(lid).c;
  const excelInput = { module: 'caja', files: [{ name: 'caja.csv', rows: [{ dia: 1, saldo: 100 }, { dia: 2, saldo: 150 }] }] };

  // ── D4: cola de la IA local cancelable ──
  {
    const q = require('../services/ai/localQueue');
    let releaseA;
    const a = q.run(() => new Promise(r => { releaseA = r; }));
    const ctrl = new AbortController();
    let bRan = false;
    const b = q.run(async () => { bRan = true; }, { signal: ctrl.signal });
    const c = q.run(async () => 'c');
    await tick();
    const before = q.stats();
    ctrl.abort();
    const bErr = await within(b.catch(e => e));
    const mid = q.stats();
    releaseA('a');
    const [ra, rc] = (await within(Promise.all([a, c]))) || [];
    check('S15b T4 D4: una petición en cola de la IA local que se cancela sale de la cola sin generar (ai_cancelled) y el turno sigue',
      () => before.waiting === 2 && mid.waiting === 1 && bErr?.code === 'ai_cancelled' && !bRan && ra === 'a' && rc === 'c' && q.stats().running === 0);

    const ctrl2 = new AbortController();
    const running = q.run(sig => new Promise((_r, rej) => sig.addEventListener('abort', () => rej(new Error('cortada')), { once: true })), { signal: ctrl2.signal });
    await tick();
    ctrl2.abort();
    const err2 = await within(running.catch(e => e));
    check('S15b T4 D4: la que ya genera recibe la señal (se corta la conexión con la IA local) y libera el turno',
      () => err2?.message === 'cortada' && q.stats().running === 0 && q.stats().waiting === 0);
    const pre = new AbortController(); pre.abort();
    let preRan = false;
    const preErr = await within(q.run(async () => { preRan = true; }, { signal: pre.signal }).catch(e => e));
    check('S15b T4 D4: una ya cancelada ni entra en la cola', () => preErr?.code === 'ai_cancelled' && !preRan);
  }

  // ── D4: el navegador corta la petición antes de la respuesta → se cancela y no gasta crédito ──
  {
    const ai = fakeAi();
    ai.hang = true;
    const a = await account('ia-t4-d4@nokfi.local');
    const before = usage(a.lid);
    let during = -1;
    await cutAfter('/api/ai/analyze', { task: 'excel', input: excelInput, lang: 'es' }, a.tok, 300, () => { during = usage(a.lid); });
    await tick(150);
    check('S15b T4 D4: si el navegador corta un análisis en curso, la IA se cancela y el crédito se devuelve',
      () => during === before + 1 && ai.aborted === 1 && usage(a.lid) === before);

    // Respuesta aplazada (202) cancelada con DELETE /api/pending/:id.
    const { deferrable, cancelHandler, pendingHandler, _store } = require('../services/deferred');
    const { runAnalysis } = require('../services/ai/analyze');
    const license = getDB().prepare('SELECT * FROM licenses WHERE id = ?').get(a.lid);
    const fakeRes = () => { const r = { code: 200, body: null, status(c) { r.code = c; return r; }, json(b) { r.body = b; return r; } }; return r; };
    const handler = async (req, res) => {
      const out = await runAnalysis({ license: req.license, task: 'excel', input: excelInput, lang: 'es', source: 'web', signal: req.aiSignal });
      res.status(out.status).json(out.body);
    };
    const first = fakeRes();
    await deferrable(handler, { waitMs: 50 })({ license, body: {} }, first);
    const id = first.body?.pending;
    const charged = usage(a.lid);
    const other = fakeRes(); cancelHandler({ license: { id: -1 }, params: { id } }, other);
    const cancel = fakeRes(); cancelHandler({ license, params: { id } }, cancel);
    await tick(50);
    const after = fakeRes(); pendingHandler({ license, params: { id } }, after);
    check('S15b T4 D4: DELETE /api/pending/:id cancela la aplazada (otra cuenta → 404), corta la IA y devuelve el crédito',
      () => first.code === 202 && charged === before + 1 && other.code === 404 && cancel.code === 200 && cancel.body.cancelled === true
        && ai.aborted === 2 && usage(a.lid) === before && after.code === 404 && !_store.has(id));
    await checkAsync('S15b T4 D4: la ruta DELETE /api/pending/:id existe y pide sesión (sin sesión 401; id ajeno 404)',
      Promise.all([call('DELETE', '/api/pending/pend_x'), call('DELETE', '/api/pending/pend_nada', { auth: a.tok })]),
      ([r1, r2]) => r1.status === 401 && r2.status === 404 && r2.data.error === 'pending_not_found');

    // El email de reclamación (sin crédito, pero ocupa la cola de la IA local) también se cancela.
    const eid = (await post('/api/ledger', { entries: [{ type: 'income', party_name: 'Cancel SL', invoice_number: 'C-1', invoice_date: '2026-08-01', base: 100, vat_amount: 21, total: 121 }] }, a.tok)).data.ids?.[0];
    const aborted0 = ai.aborted;
    await cutAfter('/api/finance/collection-email', { entry_id: eid, tone: 'friendly', lang: 'es' }, a.tok, 300);
    await tick(150);
    check('S15b T4 D4: Reclamar: si el navegador corta (otro tono, cerrar), la generación del email se cancela en el servidor',
      () => ai.aborted === aborted0 + 1);
    ai.restore();
  }
};
