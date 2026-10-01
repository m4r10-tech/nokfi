/**
 * test/session11.tests.js — sesión 11 (factura electrónica B2B + VERI*FACTU).
 *
 * Tanda 1: lectura de facturas electrónicas por la API, el MCP y el
 * Playground, sin IA y sin gastar cuota.
 */

'use strict';

module.exports = async function session11Tests({ post, get, check, checkAsync }) {
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
};
