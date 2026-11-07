/**
 * test/session15api.tests.js — S15b, lote 8 (API, MCP y n8n).
 *
 *   S1  una clave nk_test_ no ve datos reales (análisis, clientes, trabajos,
 *       libro/impuestos, webhooks) y una real no ve los de prueba
 *   S2  un lote JSON-RPC del MCP cuenta cada mensaje en el límite por minuto
 *   SSRF IPv6 ::/96, ff00::/8, 2002::/16 y «localhost.» rechazados
 *   N1  la Idempotency-Key de una emisión dura 30 días
 *   N2  429 con Retry-After; la idempotencia no guarda errores; 409 claro en
 *       facturas de prueba
 *   Preference-Applied con Prefer: respond-async
 */

'use strict';

const http = require('http');

module.exports = async function session15ApiTests({ post, put, get, call, check, checkAsync, getDB }) {
  /** Petición con cabeceras propias; devuelve también las cabeceras de respuesta. */
  function req(method, path, { body, auth, headers = {} } = {}) {
    return new Promise((resolve, reject) => {
      const data = body === undefined ? undefined : JSON.stringify(body);
      const h = { 'Content-Type': 'application/json', ...headers };
      if (data) h['Content-Length'] = Buffer.byteLength(data);
      if (auth) h.Authorization = `Bearer ${auth}`;
      const r = http.request(`http://localhost:${process.env.PORT}${path}`, { method, headers: h }, (res) => {
        let b = '';
        res.on('data', d => { b += d; });
        res.on('end', () => { let j; try { j = JSON.parse(b); } catch { j = b; } resolve({ status: res.statusCode, data: j, headers: res.headers }); });
      });
      r.on('error', reject);
      if (data) r.write(data);
      r.end();
    });
  }
  const patch = (path, body, auth) => req('PATCH', path, { body, auth });
  const del = (path, auth) => req('DELETE', path, { auth });
  const rpc = (key, name, args) => req('POST', '/api/mcp', { auth: key, body: { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } } });

  const webhooks = require('../services/webhooks');
  const jobs = require('../services/jobs');
  const W = require('../db/webhooks');

  // IA simulada (como el resto de la suite): nunca sale a la red.
  const saved = { fetch: global.fetch, GK: process.env.GEMINI_API_KEY, RATE: process.env.API_RATE_PER_MINUTE };
  process.env.API_RATE_PER_MINUTE = '1000';
  process.env.GEMINI_API_KEY = 'fake';
  global.fetch = async () => ({ ok: true, status: 200, text: async () => '', json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify({ summary: 'Informe S15', priorities: [], action_plan: [] }) }] } }] }) });
  const excelBody = { type: 'excel', data: { module: 'ventas', files: [{ name: 'v.csv', rows: [{ fecha: '2026-09-01', importe: 100 }] }] } };
  const cust = { name: 'Cliente Real SL', tax_id: 'A58818501', address: 'Calle Sol 1', postal_code: '28001', city: 'Madrid' };
  const lines = [{ description: 'Servicio', quantity: 1, unit_price: 100, vat_rate: 21 }];

  // Receptor local de webhooks
  process.env.WEBHOOKS_ALLOW_HTTP = '1';
  process.env.WEBHOOKS_ALLOW_PRIVATE = '1';
  const srv = http.createServer((rq, rs) => { rq.resume(); rq.on('end', () => { rs.writeHead(200); rs.end('ok'); }); });
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  const hookUrl = (p) => `http://127.0.0.1:${srv.address().port}/${p}`;

  try {
    // ── N3: la especificación OpenAPI cuadra con las rutas reales ──
    {
      const spec = (await get('/api/v1/openapi.json')).data;
      const src = require('fs').readFileSync(require('path').join(__dirname, '../routes/v1.js'), 'utf8');
      const routes = [...src.matchAll(/router\.(get|post|patch|delete)\('([^']+)'/g)].map(m => [m[1], m[2].replace(/:id/g, '{id}')]);
      const ops = Object.entries(spec.paths).flatMap(([p, item]) => Object.entries(item).map(([m, op]) => ({ p, m, op })));
      check('S15 OpenAPI: todas las rutas de /api/v1 están en la especificación (POST /tax/nif incluido)', () =>
        routes.length > 25 && routes.every(([m, p]) => spec.paths[p]?.[m]) && !!spec.paths['/tax/nif'].post);
      check('S15 OpenAPI: errores comunes (401/403 api_plan_required/429 con Retry-After) en cada operación; /openapi.json sin seguridad', () =>
        ops.filter(o => o.p !== '/openapi.json').every(o => o.op.responses[401] && /api_plan_required/.test(o.op.responses[403]?.description) && o.op.responses[429]?.headers?.['Retry-After'])
        && Array.isArray(spec.paths['/openapi.json'].get.security) && spec.paths['/openapi.json'].get.security.length === 0 && !!spec.components.schemas.Error);
      check('S15 OpenAPI: /usage declara mode, PATCH/DELETE de webhooks declaran 404 y POST /customers el 200 de prueba', () =>
        !!spec.paths['/usage'].get.responses[200].content['application/json'].schema.properties.mode
        && spec.paths['/webhooks/{id}'].patch.responses[404] && spec.paths['/webhooks/{id}'].delete.responses[404] && spec.paths['/customers'].post.responses[200]);
    }

    const c = await post('/api/admin/licenses', { email: 'api15@nokfi.local', plan: 'pro', password: 'ApiQuince15!' }, 'admin');
    const tok = (await post('/api/auth/login', { email: 'api15@nokfi.local', license_key: c.data.key, password: 'ApiQuince15!' })).data.token;
    const lid = c.data.id;
    const newKey = async (name, mode) => (await post('/api/keys', mode ? { name, mode } : { name }, tok)).data.key;
    const live = await newKey('real');
    const test = await newKey('prueba', 'test');

    // ── N2: la idempotencia no guarda errores que dependen del estado ──
    // Sin datos de emisor → 422 issuer_incomplete; se completan; mismo reintento → se emite de verdad.
    const e1 = await req('POST', '/api/v1/invoices', { auth: live, body: { customer: cust, lines }, headers: { 'Idempotency-Key': 'pedido-sin-emisor' } });
    await put('/api/invoicing/settings', { legal_name: 'Taller Quince SL', tax_id: 'B12345674', address: 'Calle Luna 7', postal_code: '28004', city: 'Madrid' }, tok);
    const e2 = await req('POST', '/api/v1/invoices', { auth: live, body: { customer: cust, lines }, headers: { 'Idempotency-Key': 'pedido-sin-emisor' } });
    check('S15 idem: un 422 issuer_incomplete no se guarda: tras completar el emisor, el reintento con la misma clave emite', () =>
      e1.status === 422 && e1.data.error === 'issuer_incomplete' && e2.status === 201 && !e2.headers['idempotent-replayed'] && e2.data.livemode === true);

    // ── N1: ventana de 30 días en la emisión ──
    const k30 = { 'Idempotency-Key': 'pedido-30d' };
    const i1 = await req('POST', '/api/v1/invoices', { auth: live, body: { customer: cust, lines }, headers: k30 });
    getDB().prepare("UPDATE idempotency_keys SET created_at = datetime('now', '-5 days') WHERE license_id = ? AND idem_key = 'live:pedido-30d'").run(lid);
    W.purgeWebhookData();
    const i2 = await req('POST', '/api/v1/invoices', { auth: live, body: { customer: cust, lines }, headers: k30 });
    check('S15 idem: la Idempotency-Key de una emisión sigue valiendo a los 5 días (30 días; la misma factura, sin duplicar)', () =>
      i1.status === 201 && i2.status === 201 && i2.data.id === i1.data.id && i2.headers['idempotent-replayed'] === 'true'
      && getDB().prepare("SELECT ttl_hours t FROM idempotency_keys WHERE license_id = ? AND idem_key = 'live:pedido-30d'").get(lid).t === 720);
    {
      await req('POST', '/api/v1/tax/vat', { auth: live, body: { amount: 1 }, headers: { 'Idempotency-Key': 'iva-1' } });
      const a1 = await req('POST', '/api/v1/webhooks', { auth: live, body: { url: 'https://example.com/a', events: ['job.failed'] }, headers: { 'Idempotency-Key': 'hook-24h' } });
      getDB().prepare("UPDATE idempotency_keys SET created_at = datetime('now', '-2 days') WHERE license_id = ? AND idem_key = 'live:hook-24h'").run(lid);
      getDB().prepare("UPDATE idempotency_keys SET created_at = datetime('now', '-31 days') WHERE license_id = ? AND idem_key = 'live:pedido-30d'").run(lid);
      W.purgeWebhookData();
      const left = getDB().prepare("SELECT idem_key FROM idempotency_keys WHERE license_id = ? AND idem_key IN ('live:hook-24h', 'live:pedido-30d')").all(lid);
      check('S15 idem: la limpieza borra las claves normales a las 24 h y las de emisión a los 30 días', () => a1.status === 201 && left.length === 0);
      await del(`/api/v1/webhooks/${a1.data.id}`, live);
    }
    {
      const m1 = await rpc(live, 'issue_invoice', { idempotency_key: 'mcp-30d', customer: cust, lines });
      check('S15 MCP: issue_invoice guarda su idempotency_key 30 días', () => !m1.data.result.isError
        && getDB().prepare("SELECT ttl_hours t FROM idempotency_keys WHERE license_id = ? AND idem_key = 'live:mcp-30d'").get(lid).t === 720);
    }

    // ── Datos reales de la cuenta: análisis, cliente, trabajo, libro, webhook ──
    const an = await post('/api/v1/analyze', excelBody, live);
    const asyncLive = await req('POST', '/api/v1/analyze?async=true', { auth: live, body: excelBody });
    await jobs.waitFor(asyncLive.data.id);
    const liveHook = await post('/api/v1/webhooks', { url: hookUrl('live'), events: '*' }, live);
    const customerId = e2.data.customer_id;

    // ── S1: la clave de prueba no ve nada real ──
    await checkAsync('S15 test/live: análisis — la clave de prueba no ve el historial real (lista vacía y 404)',
      Promise.all([get('/api/v1/analyses', live), get('/api/v1/analyses', test), get(`/api/v1/analyses/${an.data.id}`, test)]),
      ([l, t, one]) => an.status === 200 && Number.isInteger(an.data.id) && l.data.analyses.some(a => a.id === an.data.id)
        && t.status === 200 && t.data.analyses.length === 0 && one.status === 404);
    await checkAsync('S15 test/live: MCP list_analyses y get_analysis con clave de prueba → vacío y not_found',
      Promise.all([rpc(test, 'list_analyses', {}), rpc(test, 'get_analysis', { id: an.data.id }), rpc(live, 'get_analysis', { id: an.data.id })]),
      ([l, g, ok]) => l.data.result.structuredContent.analyses.length === 0 && g.data.result.isError
        && JSON.parse(g.data.result.content[0].text).error === 'not_found' && ok.data.result.structuredContent.id === an.data.id);
    await checkAsync('S15 test/live: clientes — la clave de prueba no ve la libreta real (NIF, direcciones)',
      Promise.all([get('/api/v1/customers', live), get('/api/v1/customers', test)]),
      ([l, t]) => l.data.customers.some(x => x.tax_id === 'A58818501') && t.status === 200 && t.data.customers.length === 0 && !JSON.stringify(t.data).includes('A58818501'));
    await checkAsync('S15 test/live: factura de prueba con customer_id real → 404 customer_not_found (no copia sus datos)',
      req('POST', '/api/v1/invoices', { auth: test, body: { customer_id: customerId, lines }, headers: { 'Idempotency-Key': 'test-cid' } }),
      r => r.status === 404 && r.data.error === 'customer_not_found' && !getDB().prepare("SELECT 1 FROM invoices WHERE license_id = ? AND livemode = 0 AND customer_json LIKE '%A58818501%'").get(lid));
    await checkAsync('S15 test/live: MCP issue_invoice de prueba con customer_id real → error',
      rpc(test, 'issue_invoice', { idempotency_key: 'mcp-test-cid', customer_id: customerId, lines }),
      r => r.data.result.isError && JSON.parse(r.data.result.content[0].text).error === 'customer_not_found');
    let testJob = null;
    {
      const tj = await req('POST', '/api/v1/analyze', { auth: test, body: excelBody, headers: { Prefer: 'respond-async' } });
      testJob = tj.data.id;
      await jobs.waitFor(testJob);
      check('S15 Preference-Applied: Prefer: respond-async → 202 con Preference-Applied: respond-async', () =>
        tj.status === 202 && tj.headers['preference-applied'] === 'respond-async' && !asyncLive.headers['preference-applied']);
    }
    await checkAsync('S15 test/live: trabajos — cada clave solo ve los de su modo (lista y 404 cruzado)',
      Promise.all([get('/api/v1/jobs', test), get('/api/v1/jobs', live), get(`/api/v1/jobs/${asyncLive.data.id}`, test), get(`/api/v1/jobs/${testJob}`, live), get(`/api/v1/jobs/${testJob}`, test)]),
      ([lt, ll, x, y, own]) => lt.data.jobs.length >= 1 && lt.data.jobs.every(j => j.livemode === false) && ll.data.jobs.every(j => j.livemode === true)
        && ll.data.jobs.some(j => j.id === asyncLive.data.id) && x.status === 404 && y.status === 404 && own.status === 200);
    await checkAsync('S15 test/live: impuestos — con clave de prueba el libro real no se lee (trimestre y 130 desde el libro)',
      Promise.all([get('/api/v1/tax/quarter', live), get('/api/v1/tax/quarter', test),
        post('/api/v1/tax/model-130', { source: 'ledger' }, live), post('/api/v1/tax/model-130', { source: 'ledger' }, test),
        rpc(test, 'estimate_model_130', { source: 'ledger' })]),
      ([ql, qt, ml, mt, mcp]) => ql.data.entries_in_ledger > 0 && qt.status === 200 && qt.data.entries_in_ledger === 0
        && ml.data.income > 0 && mt.status === 200 && mt.data.income === 0 && mcp.data.result.structuredContent.income === 0);

    // Webhooks
    const testHook = await post('/api/v1/webhooks', { url: hookUrl('test'), events: '*' }, test);
    await checkAsync('S15 test/live: webhooks — cada clave solo lista, ve, cambia, prueba y borra los de su modo',
      Promise.all([get('/api/v1/webhooks', test), get('/api/v1/webhooks', live), get(`/api/v1/webhooks/${liveHook.data.id}`, test),
        patch(`/api/v1/webhooks/${liveHook.data.id}`, { enabled: false }, test), post(`/api/v1/webhooks/${liveHook.data.id}/test`, {}, test),
        del(`/api/v1/webhooks/${liveHook.data.id}`, test), get(`/api/v1/webhooks/${testHook.data.id}`, live)]),
      ([lt, ll, g, p, t, d, x]) => liveHook.data.livemode === true && testHook.status === 201 && testHook.data.livemode === false
        && lt.data.webhooks.length === 1 && lt.data.webhooks[0].id === testHook.data.id
        && ll.data.webhooks.every(w => w.livemode === true) && ll.data.webhooks.some(w => w.id === liveHook.data.id)
        && [g, p, t, d, x].every(r => r.status === 404) && W.getEndpoint(lid, liveHook.data.id).enabled === true);
    {
      const before = getDB().prepare('SELECT MAX(id) m FROM webhook_deliveries').get().m || 0;
      webhooks.emit(lid, 'job.failed', { job_id: 'job_real' });
      webhooks.emit(lid, 'job.failed', { job_id: 'job_test' }, { livemode: false });
      await webhooks.idle();
      const rows = getDB().prepare('SELECT endpoint_id, livemode, payload_json FROM webhook_deliveries WHERE id > ? AND license_id = ?').all(before, lid);
      const to = (ep) => rows.filter(r => r.endpoint_id === ep).map(r => JSON.parse(r.payload_json).data.job_id);
      check('S15 test/live: un evento real solo va al webhook real y uno de prueba solo al de prueba', () =>
        JSON.stringify(to(liveHook.data.id)) === '["job_real"]' && JSON.stringify(to(testHook.data.id)) === '["job_test"]');
    }
    await checkAsync('S15 panel: lista todos los webhooks con su modo',
      get('/api/dev/webhooks', tok), r => r.data.webhooks.some(w => w.id === testHook.data.id && w.livemode === false) && r.data.webhooks.some(w => w.id === liveHook.data.id && w.livemode === true));
    {
      const mc = await post('/api/admin/licenses', { email: 'mini15@nokfi.local', plan: 'mini', password: 'MiniQuince15!' }, 'admin');
      const mtok = (await post('/api/auth/login', { email: 'mini15@nokfi.local', license_key: mc.data.key, password: 'MiniQuince15!' })).data.token;
      const [pro, mini, miniLive] = await Promise.all([post('/api/dev/webhooks', { url: hookUrl('panel') }, tok), post('/api/dev/webhooks', { url: hookUrl('mini') }, mtok),
        post('/api/dev/webhooks', { url: hookUrl('mini'), mode: 'live' }, mtok)]);
      check('S15 panel: sin modo, Pro crea un webhook real y Mini uno de prueba; Mini real → 403 api_plan_required', () =>
        pro.status === 201 && pro.data.livemode === true && mini.status === 201 && mini.data.livemode === false && miniLive.status === 403 && miniLive.data.error === 'api_plan_required');
      await call('DELETE', `/api/dev/webhooks/${pro.data.id}`, { auth: tok });
    }

    // ── N2: 409 claro al marcar cobrada una factura de prueba ──
    {
      const t1 = await req('POST', '/api/v1/invoices', { auth: test, body: { customer: cust, lines }, headers: { 'Idempotency-Key': 'test-pagada' } });
      const p = await post(`/api/v1/invoices/${t1.data.id}/status`, { status: 'paid' }, test);
      const m = await rpc(test, 'set_invoice_status', { id: t1.data.id, status: 'unpaid' });
      const r = await post(`/api/v1/invoices/${t1.data.id}/status`, { status: 'rejected', reason: 'Prueba' }, test);
      check('S15 facturas de prueba: paid/unpaid → 409 test_invoice_not_in_ledger (no el engañoso status_conflict); rejected sí', () =>
        t1.status === 201 && p.status === 409 && p.data.error === 'test_invoice_not_in_ledger' && /prueba/i.test(p.data.message)
        && JSON.parse(m.data.result.content[0].text).error === 'test_invoice_not_in_ledger' && r.status === 200 && r.data.customer_status === 'rejected');
    }

    // ── Lista de bloqueo de webhooks: IPv6 y «localhost.» ──
    delete process.env.WEBHOOKS_ALLOW_PRIVATE;
    delete process.env.WEBHOOKS_ALLOW_HTTP;
    await checkAsync('S15 SSRF: localhost., ::/96 (IPv4 compatible), ff00::/8 y 2002::/16 → 400 invalid_url al registrar',
      Promise.all(['https://localhost./h', 'https://LOCALHOST../h', 'https://api.local./h', 'https://[::127.0.0.1]/h', 'https://[::a00:1]/h', 'https://[ff02::1]/h', 'https://[2002:7f00:1::]/h', 'https://[2002:c0a8:101::1]/h']
        .map(url => post('/api/v1/webhooks', { url }, live))),
      rs => rs.every(r => r.status === 400 && r.data.error === 'invalid_url'));
    check('S15 SSRF: isPrivateIp bloquea las nuevas redes IPv6 y sigue dejando las públicas', () =>
      ['::127.0.0.1', '::7f00:1', '::808:808', 'ff02::1', 'ff0e::1', '2002:7f00:1::', '2002:808:808::1'].every(webhooks.isPrivateIp)
      && !webhooks.isPrivateIp('2606:4700::1111') && !webhooks.isPrivateIp('8.8.8.8') && !webhooks.isPrivateIp('2001:4860:4860::8888'));

    // ── S2 y N2: límite por minuto (lotes MCP y Retry-After) ──
    process.env.API_RATE_PER_MINUTE = '30';
    {
      const k = await newKey('lote');
      const batch = Array.from({ length: 60 }, (_, i) => ({ jsonrpc: '2.0', id: i + 1, method: 'tools/call', params: { name: 'calculate_vat', arguments: { amount: 100 } } }));
      const big = await req('POST', '/api/mcp', { auth: k, body: batch });
      const small = await req('POST', '/api/mcp', { auth: k, body: batch.slice(0, 5) });
      check('S15 MCP: un lote JSON-RPC de 60 llamadas → 429 rate_limited con Retry-After (cada mensaje cuenta)', () =>
        big.status === 429 && big.data.error === 'rate_limited' && Number(big.headers['retry-after']) > 0);
      check('S15 MCP: un lote de 5 sí pasa y gasta 5 del minuto', () => small.status === 200 && Array.isArray(small.data) && small.data.length === 5);
      const k2 = await newKey('lote2');
      const b25 = await req('POST', '/api/mcp', { auth: k2, body: batch.slice(0, 25) });
      const b6 = await req('POST', '/api/mcp', { auth: k2, body: batch.slice(0, 6) });
      const one = await rpc(k2, 'calculate_vat', { amount: 1 });
      check('S15 MCP: 25 + 6 en el mismo minuto → el segundo lote 429 y no se ejecuta (cabe aún 1 llamada suelta)', () =>
        b25.status === 200 && b25.data.length === 25 && b6.status === 429 && one.status === 200);
    }
    {
      const k = await newKey('rafaga');
      let last = null;
      for (let i = 0; i < 31; i++) last = await get('/api/v1/usage', k);
      check('S15 429: la petición 31 del minuto → 429 rate_limited con Retry-After en segundos (1-60)', () =>
        last.status === 429 && last.data.error === 'rate_limited' && Number.isInteger(last.data.retry_after));
      const h = await req('GET', '/api/v1/usage', { auth: k });
      check('S15 429: la cabecera Retry-After está entre 1 y 60 s', () => h.status === 429 && Number(h.headers['retry-after']) >= 1 && Number(h.headers['retry-after']) <= 60);
    }
    process.env.API_RATE_PER_MINUTE = '1000';
    {
      const day = new Date().toISOString().slice(0, 10);
      const ins = getDB().prepare('INSERT OR IGNORE INTO ai_usage (license_id, day, slot) VALUES (?, ?, ?)');
      for (let s = 0; s < 60; s++) ins.run(lid, day, s);
      const [sync, asy] = await Promise.all([req('POST', '/api/v1/analyze', { auth: live, body: excelBody }), req('POST', '/api/v1/analyze?async=true', { auth: live, body: excelBody })]);
      const now = new Date();
      const toMidnight = Math.ceil((Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1) - now.getTime()) / 1000);
      check('S15 429: cuota diaria agotada → license_daily_limit_reached con Retry-After hasta el día siguiente (síncrono y asíncrono)', () =>
        [sync, asy].every(r => r.status === 429 && r.data.error === 'license_daily_limit_reached' && Math.abs(Number(r.headers['retry-after']) - toMidnight) <= 5));
      getDB().prepare('DELETE FROM ai_usage WHERE license_id = ?').run(lid);
    }
  } finally {
    global.fetch = saved.fetch;
    if (saved.GK === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = saved.GK;
    if (saved.RATE === undefined) delete process.env.API_RATE_PER_MINUTE; else process.env.API_RATE_PER_MINUTE = saved.RATE;
    delete process.env.WEBHOOKS_ALLOW_HTTP;
    delete process.env.WEBHOOKS_ALLOW_PRIVATE;
    await webhooks.idle();
    srv.close();
  }
};
