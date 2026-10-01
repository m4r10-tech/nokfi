/**
 * test/session11.tests.js — sesión 11 (factura electrónica B2B + VERI*FACTU).
 *
 * Tanda 1: lectura de facturas electrónicas por la API, el MCP y el
 * Playground, sin IA y sin gastar cuota.
 * Tanda 2: emisión de facturas (numeración, rectificativas, anulación, libro, PDF).
 */

'use strict';

module.exports = async function session11Tests({ post, put, get, call, check, checkAsync, getDB }) {
  await tanda1({ post, get, check, checkAsync });
  await tanda2({ post, put, get, call, check, checkAsync, getDB });
};

async function tanda1({ post, get, check, checkAsync }) {
  const F = require('./fixtures/einvoices');
  const saved = { fetch: global.fetch, GK: process.env.GEMINI_API_KEY };
  process.env.GEMINI_API_KEY = 'fake';
  let aiCalls = 0;
  global.fetch = async () => {
    aiCalls++;
    return { ok: true, status: 200, text: async () => '', json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify({ invoices: [
      { file_name: 'nota.txt', is_invoice: true, issuer_name: 'Bar Pepe', issuer_nif: 'B12345674', invoice_number: 'T-1', invoice_date: '2026-09-01', base: 10, vat_rate: 10, vat_amount: 1, irpf_amount: 0, total: 11 }
    ] }) }] } }] }) };
  };

  try {
    const c = await post('/api/admin/licenses', { email: 'api11@nokfi.local', plan: 'pro', password: 'ApiOnce11!' }, 'admin');
    const l = await post('/api/auth/login', { email: 'api11@nokfi.local', license_key: c.data.key, password: 'ApiOnce11!' });
    const tok = l.data.token;
    const live = (await post('/api/keys', { name: 's11' }, tok)).data.key;
    const test = (await post('/api/keys', { name: 's11t', mode: 'test' }, tok)).data.key;
    check('S11: cuenta Pro con clave real y de prueba', () => /^nk_live_/.test(live || '') && /^nk_test_/.test(test || ''));

    const used = async () => (await get('/api/v1/usage', live)).data.used_today;
    const before = await used();

    await checkAsync('S11 API: Facturae (base64), UBL (text) y Factur-X en PDF → lectura exacta sin IA',
      post('/api/v1/invoices/extract', { files: [
        { name: 'f.xml', mime: 'application/xml', data: F.b64(F.facturae) },
        { name: 'u.xml', text: F.ubl },
        { name: 'fx.pdf', mime: 'application/pdf', data: F.pdfWithAttachment('factur-x.xml', F.cii) }
      ] }, live),
      r => {
        if (r.status !== 200) return false;
        const [a, b, x] = r.data.invoices;
        return r.data.ai_used === false && r.data.invoices.length === 3 && aiCalls === 0
          && a.source_format === 'Facturae' && a.invoice_number === 'F2026-017' && a.total === 1060 && a.irpf_amount === 150 && a.checks.totals_ok && a.checks.nif_valid
          && b.source_format === 'UBL' && b.issuer_nif === 'B12345674' && b.recipient_nif === '12345678Z' && b.due_date === '2026-10-20' && b.warnings.length === 0
          && x.source_format === 'Factur-X' && x.file_name === 'fx.pdf' && x.base === 200 && x.vat_amount === 42 && x.check_ok === undefined;
      });
    await checkAsync('S11 API: leer facturas electrónicas no gasta cuota', used(), n => n === before);

    await checkAsync('S11 API: rectificativa UBL (CreditNote) en negativo y sin aviso de importes',
      post('/api/v1/invoices/extract', { files: [{ name: 'r.xml', text: F.ublCredit }] }, live),
      r => r.status === 200 && r.data.invoices[0].total === -12.1 && r.data.invoices[0].checks.totals_ok
        && !r.data.invoices[0].warnings.some(w => w.code === 'amounts_missing'));

    await checkAsync('S11 API: mezcla XML + texto → la IA solo lee el texto, 1 de cuota y el orden se respeta',
      post('/api/v1/invoices/extract', { files: [{ name: 'nota.txt', text: 'Ticket Bar Pepe 11 €' }, { name: 'c.xml', mime: 'text/xml', data: F.b64(F.cii) }] }, live),
      r => r.status === 200 && r.data.ai_used === true && aiCalls === 1 && r.data.invoices.length === 2
        && r.data.invoices[0].issuer_name === 'Bar Pepe' && r.data.invoices[1].source_format === 'Factur-X');
    await checkAsync('S11 API: la mezcla sí gasta 1 análisis', used(), n => n === before + 1);

    await checkAsync('S11 API: XML que no es factura → error unsupported_xml (sin IA)',
      post('/api/v1/invoices/extract', { files: [{ name: 'otro.xml', text: '<?xml version="1.0"?><pedido><id>1</id></pedido>' }] }, live),
      r => r.status === 400 && r.data.errors[0].error === 'unsupported_xml' && aiCalls === 1);
    await checkAsync('S11 API: XML mal formado o con entidades externas (XXE) → rechazado',
      post('/api/v1/invoices/extract', { files: [
        { name: 'roto.xml', text: '<Invoice><ID>1</Invoice>' },
        { name: 'xxe.xml', text: '<?xml version="1.0"?><!DOCTYPE x [<!ENTITY e SYSTEM "file:///etc/passwd">]><Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"><ID>&e;</ID></Invoice>' }
      ] }, live),
      r => r.status === 400 && r.data.errors.length === 2 && r.data.errors.every(e => e.error === 'unsupported_xml') && !JSON.stringify(r.data).includes('root:'));

    await checkAsync('S11 API: con clave de prueba el XML se lee de verdad (no son datos de ejemplo)',
      post('/api/v1/invoices/extract', { files: [{ name: 'u.xml', text: F.ubl }] }, test),
      r => r.status === 200 && r.data.test === true && r.data.ai_used === false && r.data.invoices[0].invoice_number === 'PS-2026-0042');

    await checkAsync('S11 API async: solo XML → 202 con trabajo',
      post('/api/v1/invoices/extract?async=true', { files: [{ name: 'u.xml', text: F.ubl }] }, live),
      r => r.status === 202 && !!r.data.id);

    await checkAsync('S11 MCP: extract_invoices lee XML sin IA',
      post('/api/mcp', { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'extract_invoices', arguments: { files: [{ name: 'f.xml', text: F.facturae }] } } }, live),
      r => {
        const body = JSON.parse(r.data?.result?.content?.[0]?.text || '{}');
        return r.status === 200 && body.ai_used === false && body.invoices?.[0]?.source_format === 'Facturae';
      });

    await checkAsync('S11 Playground: XML en modo real → uses_quota false',
      post('/api/dev/playground', { operation: 'invoices.extract', mode: 'live', input: { files: [{ name: 'u.xml', text: F.ubl }] } }, tok),
      r => r.status === 200 && r.data.status === 200 && r.data.uses_quota === false && r.data.body.ai_used === false);
  } finally {
    global.fetch = saved.fetch;
    if (saved.GK === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = saved.GK;
  }
}

async function tanda2({ post, put, get, call, check, checkAsync, getDB }) {
  const M = require('../services/invoicing/model');
  const patch = (path, body, auth) => call('PATCH', path, { body, auth });
  const del = (path, auth) => call('DELETE', path, { auth });

  // ── Modelo (puro) ──
  check('S11 facturas: IBAN con control mod 97', () => M.validIban('ES91 2100 0418 4502 0005 1332') && !M.validIban('ES9121000418450200051333'));
  check('S11 facturas: IVA por tipo sobre la suma de bases (EN 16931) y retención sobre la base total', () => {
    const L = M.normalizeLines([{ description: 'a', quantity: 3, unit_price: 0.335, vat_rate: 21 }, { description: 'b', quantity: 1, unit_price: 0.335, vat_rate: 21 }], { surcharge: false });
    const t = M.computeTotals(L.lines, 15);
    // líneas 1,01 + 0,34 = 1,35 → IVA 0,28 (no 0,21+0,07); IRPF 0,20
    return t.base === 1.35 && t.vat_amount === 0.28 && t.irpf_amount === 0.2 && t.total === 1.43;
  });
  check('S11 facturas: recargo de equivalencia según el tipo de IVA', () => {
    const L = M.normalizeLines([{ description: 'a', quantity: 1, unit_price: 100, vat_rate: 21 }, { description: 'b', quantity: 1, unit_price: 100, vat_rate: 10 }], { surcharge: true });
    const t = M.computeTotals(L.lines, 0);
    return t.re_amount === 6.6 && t.vat_amount === 31 && t.total === 237.6;
  });

  const c = await post('/api/admin/licenses', { email: 'fact11@nokfi.local', plan: 'pro', password: 'Factura11!' }, 'admin');
  const l = await post('/api/auth/login', { email: 'fact11@nokfi.local', license_key: c.data.key, password: 'Factura11!' });
  const tok = l.data.token;
  const lid = c.data.id;

  await checkAsync('S11 facturas: sin datos del emisor → 422 issuer_incomplete con los campos que faltan',
    post('/api/invoicing/invoices', { customer: { name: 'Ana', tax_id: '12345678Z' }, lines: [{ description: 'x', quantity: 1, unit_price: 10 }] }, tok),
    r => r.status === 422 && r.data.error === 'issuer_incomplete' && ['legal_name', 'tax_id', 'address', 'postal_code', 'city'].every(f => r.data.fields.includes(f)));
  await checkAsync('S11 facturas: IBAN no válido en los datos del emisor → 400',
    put('/api/invoicing/settings', { iban: 'ES0000000000000000000000' }, tok), r => r.status === 400 && r.data.field === 'iban');
  await checkAsync('S11 facturas: guardar datos del emisor → completos (missing vacío)',
    put('/api/invoicing/settings', { legal_name: 'Talleres Ruiz SL', tax_id: 'esb12345674', address: 'Calle Mayor 12', postal_code: '28013', city: 'Madrid', iban: 'ES91 2100 0418 4502 0005 1332', payment_terms_days: 15, email: 'hola@ruiz.es' }, tok),
    r => r.status === 200 && r.data.missing.length === 0 && r.data.profile.tax_id === 'B12345674' && r.data.profile.iban === 'ES9121000418450200051332');

  const today = M.todayMadrid();
  let f1 = null;
  await checkAsync('S11 facturas: emitir F1 → número F{año}-0001, totales, vencimiento por defecto y cliente guardado',
    post('/api/invoicing/invoices', { customer: { name: 'Ana López', tax_id: '12345678Z', email: 'ana@ejemplo.es', address: 'Av. Sol 5', postal_code: '41001', city: 'Sevilla' },
      irpf_rate: 15, lines: [{ description: 'Reparación', quantity: 3, unit: 'h', unit_price: 45, vat_rate: 21 }, { description: 'Manual', quantity: 2, unit_price: 15, vat_rate: 4 }] }, tok),
    r => { f1 = r.data; return r.status === 201 && r.data.number === `F${today.slice(0, 4)}-0001` && r.data.kind === 'F1' && r.data.base === 165 && r.data.vat_amount === 29.55
      && r.data.irpf_amount === 24.75 && r.data.total === 169.8 && r.data.due_date === M.addDays(today, 15) && r.data.iban === 'ES9121000418450200051332' && !!r.data.customer_id && r.data.lines.length === 2; });
  await checkAsync('S11 facturas: el cliente queda en la libreta', get('/api/invoicing/customers', tok),
    r => r.status === 200 && r.data.customers.length === 1 && r.data.customers[0].tax_id === '12345678Z');
  check('S11 facturas: la factura entra sola en el libro (ingreso pendiente de cobro, enlazado)', () => {
    const e = getDB().prepare('SELECT * FROM ledger_entries WHERE license_id = ? AND invoice_id = ?').get(lid, f1?.id);
    return !!e && e.type === 'income' && e.total === 169.8 && e.paid === 0 && e.invoice_number === f1.number && e.party_nif === '12345678Z';
  });
  let entryId = null;
  await checkAsync('S11 facturas: el apunte de una factura no se edita ni se borra (409 invoice_locked)…',
    get('/api/ledger', tok).then(async r => { entryId = r.data.entries.find(e => e.invoice_id === f1.id)?.id; return Promise.all([patch(`/api/ledger/${entryId}`, { total: 1 }, tok), del(`/api/ledger/${entryId}`, tok)]); }),
    ([a, b]) => a.status === 409 && a.data.error === 'invoice_locked' && b.status === 409);
  await checkAsync('S11 facturas: …pero sí se marca como cobrado', (async () => patch(`/api/ledger/${entryId}`, { paid: true }, tok))(),
    r => r.status === 200 && r.data.entry.paid === true);
  await checkAsync('S11 facturas: el detalle refleja el cobro y el evento de emisión', get(`/api/invoicing/invoices/${f1.id}`, tok),
    r => r.status === 200 && r.data.invoice.paid === true && r.data.events[0].type === 'issued');

  await checkAsync('S11 facturas: la segunda factura es la 0002 (correlativa)',
    post('/api/invoicing/invoices', { customer_id: f1.customer_id, lines: [{ description: 'Revisión', quantity: 1, unit_price: 50 }] }, tok),
    r => r.status === 201 && r.data.number === `F${today.slice(0, 4)}-0002` && r.data.vat_amount === 10.5);
  await checkAsync('S11 facturas: fecha anterior a la última de la serie → 400 issue_date_before_last (sin gastar número)',
    post('/api/invoicing/invoices', { customer_id: f1.customer_id, issue_date: `${today.slice(0, 4)}-01-01`, lines: [{ description: 'x', quantity: 1, unit_price: 5 }] }, tok),
    r => today.slice(5) === '01-01' || (r.status === 400 && r.data.field === 'issue_date_before_last'));
  await checkAsync('S11 facturas: fecha futura → 400', post('/api/invoicing/invoices', { customer_id: f1.customer_id, issue_date: '2099-01-01', lines: [{ description: 'x', quantity: 1, unit_price: 5 }] }, tok),
    r => r.status === 400 && r.data.field === 'issue_date_future');
  await checkAsync('S11 facturas: sin NIF y más de 400 € → 422 customer_tax_id_required',
    post('/api/invoicing/invoices', { customer: { name: 'Particular' }, lines: [{ description: 'x', quantity: 1, unit_price: 400 }] }, tok),
    r => r.status === 422 && r.data.error === 'customer_tax_id_required');
  let f2 = null;
  await checkAsync('S11 facturas: sin cliente y ≤ 400 € → simplificada F2',
    post('/api/invoicing/invoices', { lines: [{ description: 'Venta mostrador', quantity: 2, unit_price: 10, vat_rate: 10 }], payment_method: 'cash' }, tok),
    r => { f2 = r.data; return r.status === 201 && r.data.kind === 'F2' && r.data.customer === null && r.data.total === 22 && r.data.iban === ''; });
  await checkAsync('S11 facturas: línea al 0 % sin causa de exención → 400 exemption; con E1 → 201',
    Promise.all([
      post('/api/invoicing/invoices', { customer_id: f1.customer_id, lines: [{ description: 'Curso', quantity: 1, unit_price: 100, vat_rate: 0 }] }, tok),
      post('/api/invoicing/invoices', { customer_id: f1.customer_id, exemption: 'E1', lines: [{ description: 'Curso', quantity: 1, unit_price: 100, vat_rate: 0 }] }, tok)
    ]),
    ([a, b]) => a.status === 400 && a.data.field === 'exemption' && b.status === 201 && b.data.exemption === 'E1' && b.data.total === 100);
  await checkAsync('S11 facturas: NIF del cliente no válido → 400', post('/api/invoicing/invoices', { customer: { name: 'X', tax_id: '12345678A' }, lines: [{ description: 'x', quantity: 1, unit_price: 5 }] }, tok),
    r => r.status === 400 && r.data.field === 'customer_tax_id');
  await checkAsync('S11 facturas: tipo de IVA inventado → 400', post('/api/invoicing/invoices', { customer_id: f1.customer_id, lines: [{ description: 'x', quantity: 1, unit_price: 5, vat_rate: 18 }] }, tok),
    r => r.status === 400 && r.data.field === 'line_vat_rate');

  // ── Rectificativas ──
  let r1 = null;
  await checkAsync('S11 facturas: rectificativa sin motivo → 400', post('/api/invoicing/invoices', { rectifies_id: f1.id, lines: [{ description: 'Abono', quantity: -1, unit_price: 45, vat_rate: 21 }] }, tok),
    r => r.status === 400 && r.data.field === 'rectification_reason');
  await checkAsync('S11 facturas: rectificativa R1 en serie R, mismo cliente y en negativo',
    post('/api/invoicing/invoices', { rectifies_id: f1.id, rectification_reason: 'Una hora facturada de más', irpf_rate: 15, lines: [{ description: 'Abono 1 h', quantity: -1, unit: 'h', unit_price: 45, vat_rate: 21 }] }, tok),
    r => { r1 = r.data; return r.status === 201 && r.data.kind === 'R1' && r.data.number === `R${today.slice(0, 4)}-0001` && r.data.customer.tax_id === '12345678Z'
      && r.data.total === -47.7 && r.data.rectifies_number === f1.number; });
  await checkAsync('S11 facturas: rectificativa de una simplificada → R5', post('/api/invoicing/invoices', { rectifies_id: f2.id, rectification_reason: 'Devolución', lines: [{ description: 'Devolución', quantity: -1, unit_price: 10, vat_rate: 10 }] }, tok),
    r => r.status === 201 && r.data.kind === 'R5');
  await checkAsync('S11 facturas: la original muestra su rectificativa', get(`/api/invoicing/invoices/${f1.id}`, tok),
    r => r.data.invoice.rectified_by.some(x => x.id === r1.id) && r.data.events.some(e => e.type === 'rectified'));
  check('S11 facturas: la rectificativa va al libro en negativo y no queda como cobro pendiente', () => {
    const e = getDB().prepare('SELECT total, paid FROM ledger_entries WHERE invoice_id = ?').get(r1.id);
    return e && e.total === -47.7 && e.paid === 1;
  });

  // ── Anulación ──
  await checkAsync('S11 facturas: no se anula una factura con rectificativas (409)', post(`/api/invoicing/invoices/${f1.id}/cancel`, { reason: 'x' }, tok),
    r => r.status === 409 && r.data.error === 'has_rectifications');
  let f3 = null;
  await checkAsync('S11 facturas: anular → queda anulada (no se borra) y sale del libro',
    post('/api/invoicing/invoices', { customer_id: f1.customer_id, lines: [{ description: 'Error', quantity: 1, unit_price: 9 }] }, tok)
      .then(r => { f3 = r.data; return post(`/api/invoicing/invoices/${f3.id}/cancel`, { reason: 'Emitida por error' }, tok); }),
    r => r.status === 200 && r.data.status === 'cancelled' && r.data.cancel_reason === 'Emitida por error' && r.data.ledger_entry_id === null
      && !getDB().prepare('SELECT 1 FROM ledger_entries WHERE invoice_id = ?').get(f3.id));
  await checkAsync('S11 facturas: el número anulado no se reutiliza', post('/api/invoicing/invoices', { customer_id: f1.customer_id, lines: [{ description: 'Bien', quantity: 1, unit_price: 9 }] }, tok),
    r => r.status === 201 && r.data.seq === undefined && Number(r.data.number.slice(-4)) === Number(f3.number.slice(-4)) + 1);
  await checkAsync('S11 facturas: no se rectifica una anulada (409)', post('/api/invoicing/invoices', { rectifies_id: f3.id, rectification_reason: 'x', lines: [{ description: 'x', quantity: -1, unit_price: 9 }] }, tok),
    r => r.status === 409 && r.data.error === 'original_cancelled');

  // ── Listado, PDF, aislamiento y envío ──
  await checkAsync('S11 facturas: listado con búsqueda por cliente y por estado',
    Promise.all([get('/api/invoicing/invoices?q=ana', tok), get('/api/invoicing/invoices?status=cancelled', tok)]),
    ([a, b]) => a.status === 200 && a.data.invoices.length >= 3 && a.data.invoices.every(i => i.customer?.name === 'Ana López') && b.data.invoices.length === 1);
  await checkAsync('S11 facturas: PDF de la factura', get(`/api/invoicing/invoices/${f1.id}/pdf`, tok),
    r => r.status === 200 && typeof r.data === 'string' && r.data.startsWith('%PDF'));
  const other = await post('/api/admin/licenses', { email: 'otra11@nokfi.local', plan: 'pro', password: 'OtraOnce11!' }, 'admin');
  const otherTok = (await post('/api/auth/login', { email: 'otra11@nokfi.local', license_key: other.data.key, password: 'OtraOnce11!' })).data.token;
  await checkAsync('S11 facturas: otra cuenta no ve ni anula ni rectifica mis facturas (404)',
    Promise.all([get(`/api/invoicing/invoices/${f1.id}`, otherTok), get(`/api/invoicing/invoices/${f1.id}/pdf`, otherTok), post(`/api/invoicing/invoices/${f2.id}/cancel`, {}, otherTok),
      post('/api/invoicing/invoices', { rectifies_id: f1.id, rectification_reason: 'x', lines: [{ description: 'x', quantity: -1, unit_price: 1 }] }, otherTok)]),
    rs => rs.every(r => r.status === 404));
  await checkAsync('S11 facturas: enviar sin email del cliente → 400; anulada → 409',
    Promise.all([post(`/api/invoicing/invoices/${f2.id}/send`, {}, tok), post(`/api/invoicing/invoices/${f3.id}/send`, { to: 'a@b.es' }, tok)]),
    ([a, b]) => a.status === 400 && a.data.field === 'to' && b.status === 409);
  {
    const saved = { fetch: global.fetch, key: process.env.RESEND_API_KEY };
    let sent = null;
    process.env.RESEND_API_KEY = 're_test';
    global.fetch = async (url, o) => { sent = { url, body: JSON.parse(o.body) }; return { ok: true, status: 200, text: async () => '', json: async () => ({ id: 'x' }) }; };
    await checkAsync('S11 facturas: enviar por email → PDF adjunto, responde al emisor y queda el evento',
      post(`/api/invoicing/invoices/${f1.id}/send`, { message: 'Gracias por tu confianza.' }, tok),
      r => r.status === 200 && r.data.to === 'ana@ejemplo.es' && sent?.url.includes('resend') && sent.body.attachments?.[0]?.filename.endsWith('.pdf')
        && Buffer.from(sent.body.attachments[0].content, 'base64').toString('latin1').startsWith('%PDF') && sent.body.reply_to === 'hola@ruiz.es'
        && sent.body.subject.includes(f1.number) && sent.body.html.includes('Gracias por tu confianza.')
        && getDB().prepare("SELECT 1 FROM invoice_events WHERE invoice_id = ? AND type = 'emailed'").get(f1.id));
    global.fetch = saved.fetch;
    if (saved.key === undefined) delete process.env.RESEND_API_KEY; else process.env.RESEND_API_KEY = saved.key;
  }
  await checkAsync('S11 facturas: la exportación RGPD incluye facturas, clientes y datos del emisor', get('/api/me/export', tok),
    r => r.status === 200 && r.data.invoices.length >= 5 && r.data.invoices[0].lines?.length >= 1 && r.data.customers.length === 1 && r.data.billing_profile.legal_name === 'Talleres Ruiz SL');
  check('S11 facturas: borrar la cuenta borra en cascada facturas con rectificativas', () => {
    getDB().prepare('DELETE FROM licenses WHERE id = ?').run(lid);
    return !getDB().prepare('SELECT 1 FROM invoices WHERE license_id = ?').get(lid) && !getDB().prepare('SELECT 1 FROM invoice_lines il JOIN invoices i ON i.id = il.invoice_id WHERE i.license_id = ?').get(lid);
  });
}
