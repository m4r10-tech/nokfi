/**
 * test/session9.tests.js — sesión 9 (API, Bloque 2): trabajos asíncronos,
 * webhooks firmados (HMAC, reintentos, SSRF), Idempotency-Key, eventos,
 * herramientas fiscales sin IA, claves nk_test_ y panel de Desarrolladores.
 *
 * Los webhooks se envían a un receptor HTTP local (127.0.0.1): para eso se
 * activan WEBHOOKS_ALLOW_HTTP y WEBHOOKS_ALLOW_PRIVATE solo en este bloque.
 */

'use strict';

const http = require('http');

module.exports = async function session9Tests({ post, put, get, call, check, checkAsync, getDB }) {
  const patch = (path, body, auth) => call('PATCH', path, { body, auth });
  const del = (path, auth) => call('DELETE', path, { auth });

  /** Petición con cabeceras propias (Idempotency-Key, Prefer…). */
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

  const webhooks = require('../services/webhooks');
  const jobs = require('../services/jobs');
  const W = require('../db/webhooks');

  // ── Receptor local de webhooks ──
  const received = [];
  let respondWith = 200;
  const srv = http.createServer((rq, rs) => {
    let b = '';
    rq.on('data', d => { b += d; });
    rq.on('end', () => {
      let json = null; try { json = JSON.parse(b); } catch { /* nada */ }
      received.push({ headers: rq.headers, body: b, json });
      rs.statusCode = respondWith; rs.end('ok');
    });
  });
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  const hookUrl = `http://127.0.0.1:${srv.address().port}/hook`;
  const byType = (t) => received.filter(x => x.json?.type === t);

  // ── IA simulada (Gemini, como el resto de la suite) ──
  const saved = { fetch: global.fetch, GK: process.env.GEMINI_API_KEY };
  process.env.API_RATE_PER_MINUTE = '1000'; // esta suite hace muchas llamadas por clave
  process.env.GEMINI_API_KEY = 'fake';
  let aiFails = false;
  const aiReply = { summary: 'Informe S9', priorities: [{ title: 'Cobrar', detail: 'd', severity: 'high' }], action_plan: [{ title: 'Llamar' }] };
  global.fetch = async () => aiFails
    ? { ok: false, status: 500, text: async () => 'boom', json: async () => ({}) }
    : { ok: true, status: 200, text: async () => '', json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(aiReply) }] } }] }) };
  const excelBody = { type: 'excel', data: { module: 'ventas', files: [{ name: 'v.csv', rows: [{ fecha: '2026-09-01', importe: 100 }] }] } };

  try {
    // ── Cuentas: Pro y Mini ──
    let tok = null, lid = null, miniTok = null, miniLid = null;
    for (const [email, plan, pass] of [['api9@nokfi.local', 'pro', 'ApiNueve9!'], ['mini9@nokfi.local', 'mini', 'MiniNueve9!']]) {
      const c = await post('/api/admin/licenses', { email, plan, password: pass }, 'admin');
      const l = await post('/api/auth/login', { email, license_key: c.data.key, password: pass });
      if (plan === 'pro') { tok = l.data.token; lid = c.data.id; } else { miniTok = l.data.token; miniLid = c.data.id; }
    }
    check('S9: cuentas de prueba Pro y Mini con sesión', () => !!tok && !!miniTok);

    // ── 2.4 Claves de prueba nk_test_ ──
    let live = null, test = null, liveId = null, testId = null, miniTest = null;
    await checkAsync('S9 test: Pro crea clave real y de prueba (nk_test_)',
      Promise.all([post('/api/keys', { name: 'prod', client: 'Clínica Sol' }, tok), post('/api/keys', { name: 'pruebas', mode: 'test' }, tok)]),
      ([a, b]) => { live = a.data.key; liveId = a.data.id; test = b.data.key; testId = b.data.id; return a.status === 201 && b.status === 201 && /^nk_live_/.test(live) && /^nk_test_/.test(test) && b.data.mode === 'test'; });
    await checkAsync('S9 test: Mini no puede crear claves reales (403) pero sí de prueba (201)',
      Promise.all([post('/api/keys', { name: 'x' }, miniTok), post('/api/keys', { name: 't', mode: 'test' }, miniTok)]),
      ([a, b]) => { miniTest = b.data.key; return a.status === 403 && a.data.error === 'api_plan_required' && b.status === 201 && /^nk_test_/.test(miniTest); });
    await checkAsync('S9 test: GET /api/keys muestra el modo y el cliente (sin la clave)',
      get('/api/keys', tok), r => r.data.test_available === true && r.data.keys.find(k => k.id === testId)?.mode === 'test'
        && r.data.keys.find(k => k.id === liveId)?.client === 'Clínica Sol' && !JSON.stringify(r.data).includes(test));

    const usedBefore = (await get('/api/v1/usage', live)).data.used_today;
    await checkAsync('S9 test: analyze con clave de prueba → informe de ejemplo (test: true), cabecera Nokfi-Mode',
      req('POST', '/api/v1/analyze', { body: excelBody, auth: test }),
      r => r.status === 200 && r.data.test === true && r.data.id === null && r.data.report.summary.startsWith('Datos de ejemplo')
        && r.data.report.priorities.length > 0 && r.headers['nokfi-mode'] === 'test');
    await checkAsync('S9 test: la clave de prueba no gasta cuota',
      get('/api/v1/usage', test), r => r.data.mode === 'test' && r.data.used_today === usedBefore);
    await checkAsync('S9 test: la entrada se valida igual que en real (400 invalid_input)',
      post('/api/v1/analyze', { type: 'excel', data: { module: 'nope' } }, test), r => r.status === 400 && r.data.error === 'invalid_input');
    await checkAsync('S9 test: facturas de ejemplo con los checks reales',
      post('/api/v1/invoices/extract', { files: [{ name: 'a.txt', text: 'factura' }, { name: 'b.txt', text: 'otra' }] }, test),
      r => r.status === 200 && r.data.test === true && r.data.invoices.length === 2
        && r.data.invoices.every(i => i.checks && i.checks.nif_valid && i.checks.totals_ok && Array.isArray(i.warnings)));
    await checkAsync('S9 test: la clave de prueba vale en Mini (analyze)',
      post('/api/v1/analyze', excelBody, miniTest), r => r.status === 200 && r.data.test === true);
    check('S9 test: los análisis de prueba no se guardan en el historial', () =>
      !getDB().prepare("SELECT 1 FROM analyses WHERE license_id IN (?, ?) AND title = 'Análisis Excel'").get(lid, miniLid));

    // ── 2.3 Herramientas fiscales sin IA ──
    await checkAsync('S9 tax: NIF/CIF válido con tipo de entidad y NIF-IVA',
      get('/api/v1/tax/nif?value=es-b12345674', live),
      r => r.status === 200 && r.data.valid && r.data.type === 'cif' && r.data.entity.includes('limitada') && r.data.vat_number === 'ESB12345674');
    await checkAsync('S9 tax: NIF con letra mala → valid false, reason check_digit; basura → format',
      Promise.all([post('/api/v1/tax/nif', { value: '12345678A' }, live), get('/api/v1/tax/nif?value=hola', live)]),
      ([a, b]) => a.data.valid === false && a.data.reason === 'check_digit' && a.data.type === 'nif' && b.data.reason === 'format');
    await checkAsync('S9 tax: IVA con IVA incluido (1.210,00 → base 1000) y recargo de equivalencia 5,2 %',
      Promise.all([post('/api/v1/tax/vat', { amount: '1.210,00', includes_vat: true }, live), post('/api/v1/tax/vat', { amount: 100, equivalence_surcharge: true }, live)]),
      ([a, b]) => a.data.base === 1000 && a.data.vat_amount === 210 && b.data.surcharge_amount === 5.2 && b.data.total === 126.2);
    await checkAsync('S9 tax: tipo de IVA no válido → 400',
      post('/api/v1/tax/vat', { amount: 100, rate: 18 }, live), r => r.status === 400 && r.data.error === 'invalid_input');
    await checkAsync('S9 tax: retención profesional 15 % (1000 → total factura 1060) y nuevo profesional 7 %',
      Promise.all([post('/api/v1/tax/withholding', { base: 1000 }, live), post('/api/v1/tax/withholding', { base: 1000, type: 'new_professional' }, live)]),
      ([a, b]) => a.data.withholding_amount === 150 && a.data.total_invoice === 1060 && b.data.withholding_rate === 7 && b.data.total_invoice === 1140);
    await checkAsync('S9 tax: modelo 130 con cifras propias (20 % del rendimiento − pagos − retenciones)',
      post('/api/v1/tax/model-130', { year: 2026, quarter: 2, income: 30000, expenses: 10000, previous_payments: 1500, withholdings: 500 }, live),
      r => r.status === 200 && r.data.gross === 4000 && r.data.result === 2000 && r.data.due_date === '2026-07-20');
    await checkAsync('S9 tax: modelo 130 desde el libro (vacío → 0) y sin cifras → 400 explicativo',
      Promise.all([post('/api/v1/tax/model-130', { source: 'ledger', year: 2026, quarter: 3 }, live), post('/api/v1/tax/model-130', {}, live)]),
      ([a, b]) => a.status === 200 && a.data.source === 'ledger' && a.data.result === 0 && b.status === 400 && b.data.message.includes('ledger'));
    await checkAsync('S9 tax: resumen del trimestre y calendario fiscal',
      Promise.all([get('/api/v1/tax/quarter?year=2026&quarter=3', live), get('/api/v1/tax/calendar?legal_form=sociedad&limit=3', live), get('/api/v1/tax/calendar?year=2026', live)]),
      ([q, c, y]) => q.status === 200 && q.data.vat && q.data.due_date === '2026-10-20' && c.data.deadlines.length === 3
        && c.data.deadlines.every(d => !d.models.includes('130') && d.days_left >= 0) && y.data.deadlines.length >= 10);
    await checkAsync('S9 tax: las herramientas sin IA no gastan cuota',
      get('/api/v1/usage', live), r => r.data.used_today === usedBefore);

    // ── Webhooks: alta y SSRF ──
    check('S9 SSRF: direcciones privadas, loopback, link-local y mapeadas se bloquean', () =>
      ['127.0.0.1', '10.1.2.3', '192.168.1.1', '172.20.0.1', '169.254.169.254', '::1', '::ffff:127.0.0.1', 'fd00::1', '0.0.0.0'].every(webhooks.isPrivateIp)
      && webhooks.isPrivateIp('::ffff:7f00:1') && !webhooks.isPrivateIp('8.8.8.8') && !webhooks.isPrivateIp('::ffff:8.8.8.8') && !webhooks.isPrivateIp('2606:4700::1111'));
    await checkAsync('S9 SSRF: sin permiso, una URL http o de red privada se rechaza al darla de alta',
      Promise.all([post('/api/v1/webhooks', { url: hookUrl }, live), post('/api/v1/webhooks', { url: 'https://localhost/x' }, live),
        post('/api/v1/webhooks', { url: 'https://192.168.1.10/x' }, live), post('/api/v1/webhooks', { url: 'https://u:p@example.com/x' }, live)]),
      rs => rs.every(r => r.status === 400 && r.data.error === 'invalid_url'));
    {
      const r = await webhooks.attempt(0);
      check('S9 SSRF: attempt de un envío inexistente no hace nada', () => r === null);
    }
    process.env.WEBHOOKS_ALLOW_HTTP = '1';
    process.env.WEBHOOKS_ALLOW_PRIVATE = '1';
    let ep = null, secret = null;
    await checkAsync('S9 hooks: eventos desconocidos → 400 invalid_events',
      post('/api/v1/webhooks', { url: hookUrl, events: ['analysis.completed', 'nope'] }, live), r => r.status === 400 && r.data.error === 'invalid_events');
    await checkAsync('S9 hooks: POST /api/v1/webhooks → 201 con secreto whsec_ (solo al crear)',
      post('/api/v1/webhooks', { url: hookUrl, events: '*', description: 'n8n' }, live),
      r => { ep = r.data.id; secret = r.data.secret; return r.status === 201 && /^whsec_/.test(secret) && r.data.events[0] === '*'; });
    await checkAsync('S9 hooks: la lista no enseña el secreto',
      get('/api/v1/webhooks', live), r => r.status === 200 && r.data.webhooks.length === 1 && !JSON.stringify(r.data).includes(secret) && r.data.event_types.includes('fiscal.deadline'));
    await checkAsync('S9 hooks: "Enviar prueba" → ping firmado entregado',
      post(`/api/v1/webhooks/${ep}/test`, {}, live), r => r.status === 200 && r.data.ok === true && r.data.status === 200);
    {
      const ping = byType('ping')[0];
      check('S9 hooks: firma HMAC válida (t=…,v1=…) y cabeceras Nokfi-Event / Nokfi-Event-Id', () =>
        ping && webhooks.verifySignature(secret, ping.headers['nokfi-signature'], ping.body)
        && !webhooks.verifySignature('whsec_otro', ping.headers['nokfi-signature'], ping.body)
        && !webhooks.verifySignature(secret, ping.headers['nokfi-signature'], ping.body + ' ')
        && ping.headers['nokfi-event'] === 'ping' && ping.headers['nokfi-event-id'] === ping.json.id && ping.json.livemode === false);
      check('S9 hooks: una firma de hace más de 5 minutos no vale (anti-repetición)', () =>
        !webhooks.verifySignature(secret, ping.headers['nokfi-signature'], ping.body, 300, Math.floor(Date.now() / 1000) + 600));
    }

    // ── 2.1 Trabajos asíncronos ──
    received.length = 0;
    let jobId = null;
    await checkAsync('S9 async: ?async=true → 202 con job_id, estado queued y cabecera Location',
      req('POST', '/api/v1/analyze?async=true', { body: excelBody, auth: live }),
      r => { jobId = r.data.id; return r.status === 202 && /^job_/.test(jobId) && r.data.status === 'queued' && r.headers.location === `/api/v1/jobs/${jobId}`; });
    await jobs.waitFor(jobId);
    await webhooks.idle();
    await checkAsync('S9 async: GET /api/v1/jobs/:id → succeeded con el mismo resultado que en síncrono',
      get(`/api/v1/jobs/${jobId}`, live),
      r => r.status === 200 && r.data.status === 'succeeded' && r.data.result.report.summary === 'Informe S9' && Number.isInteger(r.data.result.id) && r.data.error === null);
    check('S9 eventos: job.completed y analysis.completed llegan firmados y con livemode true', () => {
      const jc = byType('job.completed')[0], ac = byType('analysis.completed')[0];
      return jc && ac && jc.json.data.job_id === jobId && jc.json.data.result.report.summary === 'Informe S9'
        && ac.json.data.source === 'api' && ac.json.data.report.summary === 'Informe S9' && ac.json.livemode === true
        && webhooks.verifySignature(secret, jc.headers['nokfi-signature'], jc.body);
    });
    await checkAsync('S9 async: Prefer: respond-async también vale; errores de entrada → 400 al momento (sin trabajo)',
      Promise.all([
        req('POST', '/api/v1/invoices/extract', { body: { files: [{ name: 'f.txt', text: 'factura' }] }, auth: test, headers: { Prefer: 'respond-async' } }),
        req('POST', '/api/v1/invoices/extract?async=true', { body: { files: [] }, auth: live })
      ]),
      ([a, b]) => a.status === 202 && a.data.livemode === false && b.status === 400 && b.data.error === 'invalid_input');
    received.length = 0;
    aiFails = true;
    const failRes = await req('POST', '/api/v1/analyze?async=true', { body: excelBody, auth: live });
    await jobs.waitFor(failRes.data.id);
    await webhooks.idle();
    aiFails = false;
    await checkAsync('S9 async: si la IA falla, el trabajo queda failed con código y llega job.failed',
      get(`/api/v1/jobs/${failRes.data.id}`, live),
      r => r.data.status === 'failed' && r.data.error.code === 'ai_provider_error' && byType('job.failed')[0]?.json.data.error.code === 'ai_provider_error');
    await checkAsync('S9 async: GET /api/v1/jobs lista sin el resultado; un id ajeno → 404',
      Promise.all([get('/api/v1/jobs', live), get(`/api/v1/jobs/${jobId}`, miniTest)]),
      ([a, b]) => a.data.jobs.length >= 2 && a.data.jobs.every(j => !('result' in j)) && b.status === 404);

    // ── Idempotency-Key ──
    const used0 = (await get('/api/v1/usage', live)).data.used_today;
    const idem = { 'Idempotency-Key': 'pedido-123' };
    const first = await req('POST', '/api/v1/analyze', { body: excelBody, auth: live, headers: idem });
    const again = await req('POST', '/api/v1/analyze', { body: excelBody, auth: live, headers: idem });
    check('S9 idem: el reintento devuelve la misma respuesta (Idempotent-Replayed) sin ejecutar otra vez', () =>
      first.status === 200 && again.status === 200 && again.data.id === first.data.id && again.headers['idempotent-replayed'] === 'true' && !first.headers['idempotent-replayed']);
    await checkAsync('S9 idem: y no gasta cuota dos veces',
      get('/api/v1/usage', live), r => r.data.used_today === used0 + 1);
    await checkAsync('S9 idem: misma clave con otro cuerpo → 422 idempotency_key_reused',
      req('POST', '/api/v1/analyze', { body: { ...excelBody, title: 'otro' }, auth: live, headers: idem }), r => r.status === 422 && r.data.error === 'idempotency_key_reused');
    {
      const a = await req('POST', '/api/v1/analyze?async=true', { body: excelBody, auth: live, headers: { 'Idempotency-Key': 'async-1' } });
      const b = await req('POST', '/api/v1/analyze?async=true', { body: excelBody, auth: live, headers: { 'Idempotency-Key': 'async-1' } });
      await jobs.waitFor(a.data.id);
      check('S9 idem: en asíncrono devuelve el mismo job_id', () => a.status === 202 && b.status === 202 && a.data.id === b.data.id);
    }
    aiFails = true;
    const e1 = await req('POST', '/api/v1/analyze', { body: excelBody, auth: live, headers: { 'Idempotency-Key': 'falla-1' } });
    aiFails = false;
    const e2 = await req('POST', '/api/v1/analyze', { body: excelBody, auth: live, headers: { 'Idempotency-Key': 'falla-1' } });
    check('S9 idem: un 5xx no se guarda: el reintento con la misma clave se ejecuta de verdad', () => e1.status === 502 && e2.status === 200 && !e2.headers['idempotent-replayed']);
    await checkAsync('S9 idem: clave de más de 255 caracteres → 400; prueba y real no comparten claves',
      Promise.all([
        req('POST', '/api/v1/analyze', { body: excelBody, auth: live, headers: { 'Idempotency-Key': 'x'.repeat(256) } }),
        req('POST', '/api/v1/analyze', { body: excelBody, auth: test, headers: idem })
      ]),
      ([a, b]) => a.status === 400 && a.data.error === 'invalid_idempotency_key' && b.status === 200 && b.data.test === true);
    await webhooks.idle();

    // ── Reintentos, reenvío y desactivación ──
    received.length = 0;
    respondWith = 500;
    webhooks.emit(lid, 'job.failed', { job_id: 'job_x', kind: 'analyze', status: 'failed', error: { code: 'x', message: '' } });
    await webhooks.idle();
    const pend = getDB().prepare("SELECT * FROM webhook_deliveries WHERE license_id = ? AND event_type = 'job.failed' ORDER BY id DESC LIMIT 1").get(lid);
    check('S9 reintentos: un 500 deja el envío pendiente con el siguiente intento en ~1 min', () =>
      pend.status === 'pending' && pend.attempts === 1 && pend.last_status === 500 && pend.last_error === 'http_500'
      && getDB().prepare("SELECT (julianday(next_attempt_at) - julianday('now')) * 86400 s FROM webhook_deliveries WHERE id = ?").get(pend.id).s > 30);
    respondWith = 200;
    getDB().prepare("UPDATE webhook_deliveries SET next_attempt_at = datetime('now', '-1 second') WHERE id = ?").run(pend.id);
    await webhooks.processDue();
    check('S9 reintentos: el programador lo reintenta y queda entregado (2 intentos)', () => {
      const d = getDB().prepare('SELECT * FROM webhook_deliveries WHERE id = ?').get(pend.id);
      return d.status === 'delivered' && d.attempts === 2 && received.length === 2 && received[0].json.id === received[1].json.id;
    });
    await checkAsync('S9 panel: registro de envíos y reenvío (mismo id de evento)',
      get(`/api/dev/deliveries?endpoint_id=${ep}`, tok).then(async r => ({ list: r, resent: await post(`/api/dev/deliveries/${pend.id}/resend`, {}, tok) })),
      ({ list, resent }) => list.status === 200 && list.data.deliveries.some(d => d.id === pend.id && d.resendable) && resent.status === 200 && resent.data.ok === true
        && received[received.length - 1].json.id === received[0].json.id);
    respondWith = 500;
    getDB().prepare('UPDATE webhook_endpoints SET failure_streak = 19 WHERE id = ?').run(ep);
    webhooks.emit(lid, 'job.failed', { job_id: 'job_y' });
    await webhooks.idle();
    getDB().prepare("UPDATE webhook_deliveries SET attempts = ?, next_attempt_at = datetime('now', '-1 second') WHERE license_id = ? AND status = 'pending'").run(webhooks.MAX_ATTEMPTS - 1, lid);
    await webhooks.processDue();
    await checkAsync('S9 reintentos: tras el último intento queda failed y a los 20 fallos seguidos el endpoint se desactiva',
      get(`/api/v1/webhooks/${ep}`, live), r => r.data.enabled === false && r.data.disabled_reason === 'too_many_failures'
        && getDB().prepare("SELECT COUNT(*) c FROM webhook_deliveries WHERE license_id = ? AND status = 'failed' AND event_type = 'job.failed'").get(lid).c >= 1);
    respondWith = 200;
    await checkAsync('S9 hooks: reactivarlo pone a cero la racha',
      patch(`/api/v1/webhooks/${ep}`, { enabled: true, events: ['quota.threshold', 'fiscal.deadline', 'analysis.completed'] }, live),
      r => r.status === 200 && r.data.enabled && r.data.events.length === 3 && getDB().prepare('SELECT failure_streak f FROM webhook_endpoints WHERE id = ?').get(ep).f === 0);

    // ── Eventos: quota.threshold y fiscal.deadline ──
    received.length = 0;
    {
      const day = new Date().toISOString().slice(0, 10);
      const used = getDB().prepare('SELECT COUNT(*) c FROM ai_usage WHERE license_id = ? AND day = ?').get(lid, day).c;
      // Relleno hasta 39 usados (slots fuera del rango del plan: solo cuentan).
      const ins = getDB().prepare('INSERT INTO ai_usage (license_id, day, slot) VALUES (?, ?, ?)');
      for (let s = 0; s < 39 - used; s++) ins.run(lid, day, 100 + s);
    }
    await post('/api/v1/analyze', excelBody, live); // 40/50 = 80 %
    await post('/api/v1/analyze', excelBody, live); // 41/50: no repite
    await webhooks.idle();
    check('S9 eventos: quota.threshold al 80 % una sola vez al día', () => {
      const q = byType('quota.threshold');
      return q.length === 1 && q[0].json.data.threshold === 80 && q[0].json.data.used_today === 40 && q[0].json.data.daily_quota === 50;
    });
    received.length = 0;
    const n1 = webhooks.runFiscalEvents(new Date('2026-10-15T09:00:00Z'));
    const n2 = webhooks.runFiscalEvents(new Date('2026-10-15T10:00:00Z'));
    await webhooks.idle();
    check('S9 eventos: fiscal.deadline 7 días antes del 3T (una vez, aunque se repita la pasada)', () => {
      const f = byType('fiscal.deadline');
      return n1 >= 1 && n2 === 0 && f.length === n1 && f.some(e => e.json.data.key === '2026-3T' && e.json.data.days_left === 5 && e.json.data.models.includes('303'));
    });

    // ── Mini: solo eventos de prueba ──
    {
      const m = await post('/api/v1/webhooks', { url: hookUrl, events: ['fiscal.deadline'] }, miniTest);
      received.length = 0;
      webhooks.runFiscalEvents(new Date('2026-10-19T09:00:00Z'));
      await webhooks.idle();
      check('S9 planes: un webhook de una cuenta Mini (clave de prueba) no recibe eventos reales', () =>
        m.status === 201 && !received.some(x => x.json?.type === 'fiscal.deadline' && getDB().prepare('SELECT 1 FROM webhook_deliveries WHERE endpoint_id = ? AND event_id = ?').get(m.data.id, x.json.id)));
    }

    // ── Envío bloqueado a red privada si no hay permiso (comprobación al conectar) ──
    delete process.env.WEBHOOKS_ALLOW_PRIVATE;
    const blockedTest = await post(`/api/v1/webhooks/${ep}/test`, {}, live);
    process.env.WEBHOOKS_ALLOW_PRIVATE = '1';
    check('S9 SSRF: aunque la URL ya esté guardada, al enviar a una IP privada se bloquea', () => blockedTest.data.ok === false && blockedTest.data.error === 'blocked_address');

    // ── 2.5 Panel: webhooks, registro, clientes, Playground ──
    await checkAsync('S9 panel: GET /api/dev/webhooks con estadísticas de 7 días y secreto aparte',
      Promise.all([get('/api/dev/webhooks', tok), get(`/api/dev/webhooks/${ep}/secret`, tok)]),
      ([a, b]) => a.status === 200 && a.data.live_events === true && a.data.webhooks[0].last_7_days.deliveries > 0 && b.data.secret === secret);
    {
      const rot = await post(`/api/dev/webhooks/${ep}/rotate-secret`, {}, tok);
      check('S9 panel: rotar el secreto da uno nuevo', () => rot.status === 200 && /^whsec_/.test(rot.data.secret) && rot.data.secret !== secret);
    }
    await checkAsync('S9 panel: registro de llamadas con filtros (error, prueba) y paginación',
      Promise.all([get('/api/dev/calls?result=error&limit=5', tok), get('/api/dev/calls?mode=test', tok), get('/api/dev/calls?limit=3', tok)]),
      ([e, t, p]) => e.data.calls.every(c => c.status >= 400) && e.data.calls.length > 0 && t.data.calls.every(c => c.livemode === false) && t.data.calls.length > 0
        && p.data.calls.length === 3 && p.data.next_before === p.data.calls[2].id);
    await patch(`/api/keys/${testId}`, { client: 'Clínica Sol' }, tok);
    await checkAsync('S9 panel: clientes agrupa las claves con su uso',
      get('/api/dev/clients', tok), r => {
        const c = r.data.clients.find(x => x.client === 'Clínica Sol');
        return r.status === 200 && c && c.keys.length === 2 && c.calls_30d > 10 && c.calls_today > 10;
      });
    await checkAsync('S9 Playground: modo prueba (IVA y análisis) sin clave y queda en el registro como Playground',
      Promise.all([post('/api/dev/playground', { operation: 'tax.vat', mode: 'test', input: { amount: 100 } }, tok),
        post('/api/dev/playground', { operation: 'analyze', mode: 'test', input: excelBody }, miniTok)]),
      ([a, b]) => a.data.status === 200 && a.data.body.total === 121 && a.data.request.path === '/api/v1/tax/vat'
        && b.data.status === 200 && b.data.body.test === true && b.data.uses_quota === false
        && !!getDB().prepare("SELECT 1 FROM api_calls WHERE license_id = ? AND key_id IS NULL AND path = '/api/v1/tax/vat'").get(lid));
    await checkAsync('S9 Playground: modo real en Mini → 403; operación desconocida → 400',
      Promise.all([post('/api/dev/playground', { operation: 'tax.vat', mode: 'live', input: { amount: 1 } }, miniTok), post('/api/dev/playground', { operation: 'nope' }, tok)]),
      ([a, b]) => a.status === 403 && a.data.error === 'api_plan_required' && b.status === 400);

    // ── MCP: herramientas fiscales y modo prueba ──
    {
      const rpc = (method, params, key) => post('/api/mcp', { jsonrpc: '2.0', id: 1, method, params }, key);
      await checkAsync('S9 MCP: 15 herramientas, validate_tax_id y analyze con clave de prueba',
        Promise.all([rpc('tools/list', {}, live), rpc('tools/call', { name: 'validate_tax_id', arguments: { value: 'B12345674' } }, live),
          rpc('tools/call', { name: 'analyze', arguments: excelBody }, test)]),
        ([l, v, a]) => l.data.result.tools.length === 15 && v.data.result.structuredContent.valid === true
          && a.data.result.structuredContent.test === true);
    }

    // ── Caducidad (24 h) y borrado del endpoint ──
    getDB().prepare("UPDATE webhook_deliveries SET created_at = datetime('now', '-2 days') WHERE license_id = ?").run(lid);
    getDB().prepare("UPDATE api_jobs SET created_at = datetime('now', '-2 days') WHERE license_id = ?").run(lid);
    W.purgeWebhookData();
    check('S9 datos: a las 24 h se borran los cuerpos de los envíos y los resultados de los trabajos', () =>
      !getDB().prepare("SELECT 1 FROM webhook_deliveries WHERE license_id = ? AND payload_json IS NOT NULL AND status != 'pending'").get(lid)
      && !getDB().prepare('SELECT 1 FROM api_jobs WHERE license_id = ? AND result_json IS NOT NULL').get(lid));
    await checkAsync('S9 datos: un trabajo caducado dice result_expired',
      get(`/api/v1/jobs/${jobId}`, live), r => r.data.status === 'succeeded' && r.data.result === null && r.data.result_expired === true);
    await checkAsync('S9 hooks: DELETE /api/v1/webhooks/:id y sus envíos se borran en cascada',
      del(`/api/v1/webhooks/${ep}`, live), r => r.status === 200 && !getDB().prepare('SELECT 1 FROM webhook_deliveries WHERE endpoint_id = ?').get(ep));
  } finally {
    global.fetch = saved.fetch;
    if (saved.GK === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = saved.GK;
    delete process.env.WEBHOOKS_ALLOW_HTTP;
    delete process.env.WEBHOOKS_ALLOW_PRIVATE;
    delete process.env.API_RATE_PER_MINUTE;
    await webhooks.idle();
    srv.close();
  }
};
