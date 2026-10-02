/**
 * test/session11b.tests.js — sesión 11b.
 *
 * Tanda 4: VERI*FACTU. Huella con los ejemplos oficiales de la AEAT, registros
 * validados con el XSD oficial (test/xsd/verifactu-1.0), cadena encadenada,
 * inmutabilidad, QR de cotejo y cola de envío contra un servicio SOAP
 * simulado (respuestas Correcto / AceptadoConErrores / Incorrecto / duplicado
 * y SoapFault).
 * Tanda 5: emisión por la API v1 y el MCP (paridad con la app), claves de
 * prueba (TEST-…, sin libro ni VERI*FACTU), Idempotency-Key obligatoria y
 * webhooks invoice.* / verifactu.*.
 */

'use strict';

module.exports = async function session11bTests({ post, put, get, call, check, checkAsync, getDB }) {
  await tanda4({ post, put, get, call, check, checkAsync, getDB });
  await tanda5({ post, put, get, call, check, checkAsync, getDB });
};

const SF = 'https://www2.agenciatributaria.gob.es/static_files/common/internet/dep/aplicaciones/es/aeat/tike/cont/ws/SuministroInformacion.xsd';
const SFR = 'https://www2.agenciatributaria.gob.es/static_files/common/internet/dep/aplicaciones/es/aeat/tike/cont/ws/RespuestaSuministro.xsd';

/** Servicio SOAP simulado: decide el resultado de cada registro con `decide({ type, number })`. */
function mockAeat() {
  const http = require('http');
  const state = { requests: [], decide: () => ({ estado: 'Correcto' }), fault: null, espera: 60 };
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      state.requests.push(body);
      if (state.fault) {
        res.writeHead(500, { 'Content-Type': 'text/xml' });
        return res.end(`<env:Envelope xmlns:env="http://schemas.xmlsoap.org/soap/envelope/"><env:Body><env:Fault><faultcode>env:Client</faultcode><faultstring>${state.fault}</faultstring></env:Fault></env:Body></env:Envelope>`);
      }
      const regs = body.split('<sfLR:RegistroFactura>').slice(1).map(chunk => ({
        type: chunk.includes('<sf:RegistroAlta>') ? 'alta' : 'anulacion',
        nif: chunk.match(/<sf:IDEmisorFactura(?:Anulada)?>([^<]+)</)[1],
        number: chunk.match(/<sf:NumSerieFactura(?:Anulada)?>([^<]+)</)[1],
        date: chunk.match(/<sf:FechaExpedicionFactura(?:Anulada)?>([^<]+)</)[1]
      }));
      const lines = regs.map(r => {
        const d = state.decide(r);
        return `<tikR:RespuestaLinea><tikR:IDFactura><tik:IDEmisorFactura>${r.nif}</tik:IDEmisorFactura><tik:NumSerieFactura>${r.number}</tik:NumSerieFactura><tik:FechaExpedicionFactura>${r.date}</tik:FechaExpedicionFactura></tikR:IDFactura>`
          + `<tikR:Operacion><tik:TipoOperacion>${r.type === 'alta' ? 'Alta' : 'Anulacion'}</tik:TipoOperacion></tikR:Operacion><tikR:EstadoRegistro>${d.estado}</tikR:EstadoRegistro>`
          + (d.codigo ? `<tikR:CodigoErrorRegistro>${d.codigo}</tikR:CodigoErrorRegistro><tikR:DescripcionErrorRegistro>${d.descripcion || ''}</tikR:DescripcionErrorRegistro>` : '')
          + '</tikR:RespuestaLinea>';
      }).join('');
      res.writeHead(200, { 'Content-Type': 'text/xml; charset=utf-8' });
      res.end(`<?xml version="1.0" encoding="UTF-8"?><env:Envelope xmlns:env="http://schemas.xmlsoap.org/soap/envelope/"><env:Body>`
        + `<tikR:RespuestaRegFactuSistemaFacturacion xmlns:tikR="${SFR}" xmlns:tik="${SF}"><tikR:CSV>A-TEST-CSV</tikR:CSV>`
        + `<tikR:Cabecera><tik:ObligadoEmision><tik:NombreRazon>x</tik:NombreRazon><tik:NIF>${regs[0]?.nif}</tik:NIF></tik:ObligadoEmision></tikR:Cabecera>`
        + `<tikR:TiempoEsperaEnvio>${state.espera}</tikR:TiempoEsperaEnvio><tikR:EstadoEnvio>Correcto</tikR:EstadoEnvio>${lines}</tikR:RespuestaRegFactuSistemaFacturacion></env:Body></env:Envelope>`);
    });
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ server, state, url: `http://127.0.0.1:${server.address().port}/` })));
}

async function tanda4({ post, put, get, check, checkAsync, getDB }) {
  const path = require('path');
  const { spawnSync } = require('child_process');
  const R = require('../services/verifactu/record');
  const C = require('../services/verifactu/config');
  const VF = require('../services/verifactu');
  const V = require('../db/verifactu');
  const S = require('../services/invoicing');
  const { render } = require('../services/invoicing/xml/builder');

  // ── Huella: los tres ejemplos de las especificaciones de la AEAT (v0.1.2) ──
  const a1 = { IDEmisorFactura: '89890001K', NumSerieFactura: '12345678/G33', FechaExpedicionFactura: '01-01-2024', TipoFactura: 'F1', CuotaTotal: '12.35', ImporteTotal: '123.45', Anterior: null, FechaHoraHusoGenRegistro: '2024-01-01T19:20:30+01:00' };
  const h1 = R.altaHash(a1);
  const h2 = R.altaHash({ ...a1, NumSerieFactura: '12345679/G34', Anterior: { Huella: h1 }, FechaHoraHusoGenRegistro: '2024-01-01T19:20:35+01:00' });
  check('S11 VERI*FACTU: huella del primer registro = ejemplo oficial 1', () => h1 === '3C464DAF61ACB827C65FDA19F352A4E3BDC2C640E9E9FC4CC058073F38F12F60');
  check('S11 VERI*FACTU: huella encadenada = ejemplo oficial 2', () => h2 === 'F7B94CFD8924EDFF273501B01EE5153E4CE8F259766F88CF6ACB8935802A2B97');
  check('S11 VERI*FACTU: huella de anulación = ejemplo oficial 3', () => R.anulacionHash({ IDEmisorFactura: '89890001K', NumSerieFactura: '12345679/G34', FechaExpedicionFactura: '01-01-2024', Anterior: { Huella: h2 }, FechaHoraHusoGenRegistro: '2024-01-01T19:20:40+01:00' })
    === '177547C0D57AC74748561D054A9CEC14B4C4EA23D1BEFD6F2E69E3A388F90C68');
  check('S11 VERI*FACTU: fecha-hora con huso peninsular (invierno +01:00, verano +02:00)', () =>
    R.fechaHoraHuso(new Date('2026-01-15T10:00:00.700Z')) === '2026-01-15T11:00:00+01:00' && R.fechaHoraHuso(new Date('2026-07-15T22:30:05Z')) === '2026-07-16T00:30:05+02:00');
  check('S11 VERI*FACTU: URL del QR con los parámetros codificados (ejemplo oficial)', () =>
    R.qrUrl('https://prewww2.aeat.es/wlpl/TIKE-CONT/ValidarQR', { IDEmisorFactura: '89890001K', NumSerieFactura: '12345678&G33', FechaExpedicionFactura: '01-01-2024', ImporteTotal: '241.4' })
      === 'https://prewww2.aeat.es/wlpl/TIKE-CONT/ValidarQR?nif=89890001K&numserie=12345678%26G33&fecha=01-01-2024&importe=241.4');
  check('S11 VERI*FACTU: sin configurar → entorno off y sin envío; prod exige el segundo interruptor', () => {
    const saved = { e: process.env.VERIFACTU_ENV, p: process.env.VERIFACTU_PROD_ENABLED };
    delete process.env.VERIFACTU_ENV;
    const off = C.env() === 'off' && C.sendReady().reason === 'disabled' && !C.licenseEnabled(1);
    process.env.VERIFACTU_ENV = 'prod';
    delete process.env.VERIFACTU_PROD_ENABLED;
    const prodLocked = C.env() === 'off';
    if (saved.e === undefined) delete process.env.VERIFACTU_ENV; else process.env.VERIFACTU_ENV = saved.e;
    if (saved.p !== undefined) process.env.VERIFACTU_PROD_ENABLED = saved.p;
    return off && prodLocked;
  });

  // ── Cuenta con varias facturas ──
  const c = await post('/api/admin/licenses', { email: 'vf11@nokfi.local', plan: 'pro', password: 'Verifactu11!' }, 'admin');
  const tok = (await post('/api/auth/login', { email: 'vf11@nokfi.local', license_key: c.data.key, password: 'Verifactu11!' })).data.token;
  const lid = c.data.id;
  await put('/api/invoicing/settings', { legal_name: 'Ferretería Norte SL', tax_id: 'B12345674', address: 'Calle Real 3', postal_code: '28013', city: 'Madrid' }, tok);
  const cust = { name: 'Ana López Pérez', tax_id: '12345678Z', address: 'Av. Sol 5', postal_code: '41001', city: 'Sevilla' };
  const issue = (body) => post('/api/invoicing/invoices', body, tok).then(r => r.data);

  await checkAsync('S11 VERI*FACTU: fecha de operación posterior a la de expedición → 400 (la AEAT la rechaza)',
    post('/api/invoicing/invoices', { customer: cust, operation_date: '2099-01-01', lines: [{ description: 'x', quantity: 1, unit_price: 10 }] }, tok),
    r => r.status === 400 && r.data.field === 'operation_date');

  await checkAsync('S11 VERI*FACTU: emitir con IVA del 5 % → 400 (ya no existe; la AEAT lo rechaza)',
    post('/api/invoicing/invoices', { customer: cust, lines: [{ description: 'x', quantity: 1, unit_price: 10, vat_rate: 5 }] }, tok),
    r => r.status === 400 && r.data.field === 'line_vat_rate');

  const f1 = await issue({ customer: cust, irpf_rate: 15, lines: [{ description: 'Consultoría', quantity: 2, unit_price: 100, vat_rate: 21 }, { description: 'Libro', quantity: 1, unit_price: 20, vat_rate: 4 }] });
  const f2 = await issue({ payment_method: 'cash', lines: [{ description: 'Mostrador', quantity: 1, unit_price: 10, vat_rate: 21 }] });
  const re = await issue({ customer: cust, equivalence_surcharge: true, lines: [{ description: 'Género', quantity: 10, unit_price: 10, vat_rate: 21 }] });
  const e5 = await issue({ customer: { name: 'Dupont SARL', tax_id: '40303265045', address: '1 rue de Paris', postal_code: '75001', city: 'Paris', country: 'FR' }, exemption: 'E5', lines: [{ description: 'Entrega UE', quantity: 1, unit_price: 500, vat_rate: 0 }] });
  const s2 = await issue({ customer: cust, exemption: 'S2', lines: [{ description: 'Obra', quantity: 1, unit_price: 300, vat_rate: 0 }] });
  const r1 = await issue({ rectifies_id: f1.id, rectification_reason: 'Precio', lines: [{ description: 'Abono', quantity: -1, unit_price: 20, vat_rate: 21 }] });
  const toCancel = await issue({ customer: cust, lines: [{ description: 'Error', quantity: 1, unit_price: 50, vat_rate: 21 }] });
  await post(`/api/invoicing/invoices/${toCancel.id}/cancel`, { reason: 'emitida por error' }, tok);
  check('S11 VERI*FACTU: facturas de prueba emitidas', () => [f1, f2, re, e5, s2, r1, toCancel].every(i => i?.id));

  const recs = getDB().prepare('SELECT * FROM verifactu_records WHERE license_id = ? ORDER BY id').all(lid);
  const data = (inv, type = 'alta') => JSON.parse(recs.find(r => r.invoice_id === inv.id && r.type === type).data_json);
  check('S11 VERI*FACTU: un registro de alta por factura y uno de anulación al anular, en orden', () =>
    recs.length === 8 && recs.filter(r => r.type === 'alta').length === 7 && recs[7].type === 'anulacion' && recs[7].invoice_id === toCancel.id && recs.every(r => r.status === 'pending'));
  check('S11 VERI*FACTU: cadena — el primero sin anterior y cada uno con la huella del previo', () =>
    !data(f1).Anterior && recs.slice(1).every((r, i) => r.prev_id === recs[i].id && JSON.parse(r.data_json).Anterior.Huella === recs[i].hash && JSON.parse(r.data_json).Anterior.NumSerieFactura === recs[i].number));
  await checkAsync('S11 VERI*FACTU: GET /verifactu/chain recalcula todas las huellas → ok', get('/api/invoicing/verifactu/chain', tok), r => r.status === 200 && r.data.ok && r.data.count === 8);
  check('S11 VERI*FACTU: importes — ImporteTotal = base + cuotas (sin restar IRPF) y desglose por tipo', () => {
    const d = data(f1);
    return d.TipoFactura === 'F1' && d.ImporteTotal === '262.80' && d.CuotaTotal === '42.80' && d.Desglose.length === 2
      && d.Desglose[0].TipoImpositivo === '21' && d.Desglose[0].CuotaRepercutida === '42.00' && d.Desglose[1].TipoImpositivo === '4'
      && d.Destinatarios[0].NIF === '12345678Z' && d.FechaExpedicionFactura === `${f1.issue_date.slice(8)}-${f1.issue_date.slice(5, 7)}-${f1.issue_date.slice(0, 4)}`;
  });
  check('S11 VERI*FACTU: simplificada F2 sin destinatarios', () => data(f2).TipoFactura === 'F2' && !data(f2).Destinatarios);
  check('S11 VERI*FACTU: recargo de equivalencia 5,2 % en el desglose y en la cuota total', () => {
    const d = data(re);
    return d.Desglose[0].TipoRecargoEquivalencia === '5.2' && d.Desglose[0].CuotaRecargoEquivalencia === '5.20' && d.CuotaTotal === '26.20' && d.ImporteTotal === '126.20';
  });
  check('S11 VERI*FACTU: entrega intracomunitaria E5 → OperacionExenta y destinatario por NIF-IVA (IDOtro 02)', () => {
    const d = data(e5);
    return d.Desglose[0].OperacionExenta === 'E5' && d.Desglose[0].TipoImpositivo === undefined && d.Destinatarios[0].IDOtro.IDType === '02' && d.Destinatarios[0].IDOtro.ID === 'FR40303265045';
  });
  check('S11 VERI*FACTU: inversión del sujeto pasivo S2 → tipo 0 y cuota 0', () => {
    const d = data(s2).Desglose[0];
    return d.CalificacionOperacion === 'S2' && d.TipoImpositivo === '0' && d.CuotaRepercutida === '0.00';
  });
  check('S11 VERI*FACTU: rectificativa por diferencias (I) con la factura rectificada', () => {
    const d = data(r1);
    return d.TipoFactura === 'R1' && d.TipoRectificativa === 'I' && d.FacturasRectificadas[0].NumSerieFactura === f1.number && d.ImporteTotal === '-24.20';
  });

  // ── XSD oficial ──
  const hasXmllint = spawnSync('xmllint', ['--version']).status === 0;
  const xsd = path.join(__dirname, 'xsd/verifactu-1.0/SuministroLR.xsd');
  const xsdOk = (xml) => {
    if (!hasXmllint) return true;
    const r = spawnSync('xmllint', ['--noout', '--schema', xsd, '-'], { input: xml });
    if (r.status !== 0) console.log(String(r.stderr).split('\n').slice(0, 4).join('\n'));
    return r.status === 0;
  };
  const sistema = { ...C.system(lid), NIF: 'B87654321' };
  check('S11 VERI*FACTU: los 8 registros (altas de cada tipo y anulación) validan con el XSD oficial de la AEAT', () =>
    xsdOk(`<?xml version="1.0" encoding="UTF-8"?>\n${render(R.regFactuXml({ obligado: { name: 'Ferretería Norte SL', nif: 'B12345674' }, sistema, records: recs.map(r => ({ type: r.type, data: JSON.parse(r.data_json) })) }))}`));

  // ── Inmutabilidad ──
  const throwsWith = (fn, msg) => { try { fn(); return false; } catch (e) { return String(e.message).includes(msg); } };
  check('S11 VERI*FACTU: no se pueden cambiar importes ni datos de una factura emitida, ni sus líneas', () =>
    throwsWith(() => getDB().prepare('UPDATE invoices SET total = 1 WHERE id = ?').run(f1.id), 'invoice_immutable')
    && throwsWith(() => getDB().prepare('UPDATE invoices SET customer_json = ? WHERE id = ?').run('{}', f1.id), 'invoice_immutable')
    && throwsWith(() => getDB().prepare('UPDATE invoice_lines SET amount = 1 WHERE invoice_id = ?').run(f1.id), 'invoice_immutable'));
  check('S11 VERI*FACTU: no se pueden borrar facturas ni registros, ni tocar una huella', () =>
    throwsWith(() => getDB().prepare('DELETE FROM invoices WHERE id = ?').run(f2.id), 'invoice_immutable')
    && throwsWith(() => getDB().prepare('DELETE FROM verifactu_records WHERE invoice_id = ?').run(f2.id), 'record_immutable')
    && throwsWith(() => getDB().prepare("UPDATE verifactu_records SET hash = 'X' WHERE invoice_id = ?").run(f2.id), 'record_immutable'));

  // ── Estado con el envío desactivado ──
  await checkAsync('S11 VERI*FACTU: GET /verifactu sin configurar → off, no envía, 8 pendientes',
    get('/api/invoicing/verifactu', tok), r => r.status === 200 && r.data.env === 'off' && !r.data.sending && r.data.reason === 'disabled' && r.data.summary.pending === 8 && r.data.records.length === 8);
  await checkAsync('S11 VERI*FACTU: sin envío activo el PDF no lleva QR', S.pdfOptions({ id: lid }, f1), o => Object.keys(o).length === 1 && !o.qr);
  await checkAsync('S11 VERI*FACTU: el detalle de la factura incluye sus registros', get(`/api/invoicing/invoices/${toCancel.id}`, tok),
    r => r.status === 200 && r.data.verifactu.length === 2 && r.data.verifactu[1].type === 'anulacion' && !('data_json' in r.data.verifactu[0]));

  // ── Envío contra el servicio simulado ──
  const mock = await mockAeat();
  const saved = ['VERIFACTU_ENV', 'VERIFACTU_LICENSES', 'VERIFACTU_PRODUCER_NIF', 'VERIFACTU_ENDPOINT'].map(k => [k, process.env[k]]);
  Object.assign(process.env, { VERIFACTU_ENV: 'test', VERIFACTU_LICENSES: String(lid), VERIFACTU_ENDPOINT: mock.url });
  delete process.env.VERIFACTU_PRODUCER_NIF;
  try {
    await checkAsync('S11 VERI*FACTU: sin NIF del productor no se envía nada', VF.processDue(), r => r.skipped && mock.state.requests.length === 0);
    process.env.VERIFACTU_PRODUCER_NIF = 'B87654321';

    const opts = await S.pdfOptions({ id: lid }, f1);
    check('S11 VERI*FACTU: con envío activo el PDF lleva el QR de preproducción y la leyenda', () =>
      Buffer.isBuffer(opts.qr) && opts.qrLegend === 'VERI*FACTU' && opts.qrUrl.startsWith('https://prewww2.aeat.es/wlpl/TIKE-CONT/ValidarQR?nif=B12345674&numserie=')
      && opts.qrUrl.endsWith('&importe=262.80'));
    await checkAsync('S11 VERI*FACTU: PDF con QR', get(`/api/invoicing/invoices/${f1.id}/pdf`, tok), r => r.status === 200);

    // Respuesta: f2 rechazada, re aceptada con errores, e5 duplicada; el resto correctas.
    mock.state.decide = ({ number, type }) => number === f2.number ? { estado: 'Incorrecto', codigo: '1100', descripcion: 'Valor o tipo incorrecto' }
      : number === re.number ? { estado: 'AceptadoConErrores', codigo: '2000', descripcion: 'El cálculo de la huella no es correcto' }
      : number === e5.number && type === 'alta' ? { estado: 'Incorrecto', codigo: '3000', descripcion: 'Registro de facturación duplicado.' }
      : { estado: 'Correcto' };
    mock.state.espera = 90;
    const t0 = Math.floor(Date.now() / 1000);
    const out = await VF.processDue();
    const after = getDB().prepare('SELECT * FROM verifactu_records WHERE license_id = ? ORDER BY id').all(lid);
    const st = (inv, type = 'alta') => after.find(r => r.invoice_id === inv.id && r.type === type);
    check('S11 VERI*FACTU: un único envío con los 8 registros en orden de cadena', () =>
      mock.state.requests.length === 1 && out.results[0].sent === 8 && mock.state.requests[0].indexOf(f1.number) < mock.state.requests[0].indexOf(f2.number));
    check('S11 VERI*FACTU: la petición SOAP lleva un RegFactuSistemaFacturacion válido según el XSD oficial', () => {
      const body = mock.state.requests[0];
      const inner = body.slice(body.indexOf('<sfLR:RegFactuSistemaFacturacion'), body.indexOf('</soapenv:Body>'));
      return body.includes('<soapenv:Envelope') && xsdOk(`<?xml version="1.0" encoding="UTF-8"?>\n${inner}`) && !body.includes('<sf:Incidencia>');
    });
    check('S11 VERI*FACTU: estados por registro (aceptado, con errores, rechazado, duplicado = aceptado)', () =>
      st(f1).status === 'accepted' && st(f1).csv === 'A-TEST-CSV' && st(f1).env === 'test' && st(f2).status === 'rejected' && st(f2).error_code === '1100'
      && st(re).status === 'accepted_errors' && st(e5).status === 'accepted' && st(toCancel, 'anulacion').status === 'accepted');
    check('S11 VERI*FACTU: queda el evento en el historial de la factura', () =>
      !!getDB().prepare("SELECT 1 FROM invoice_events WHERE invoice_id = ? AND type = 'verifactu_rejected' AND detail LIKE '%1100%'").get(f2.id)
      && !!getDB().prepare("SELECT 1 FROM invoice_events WHERE invoice_id = ? AND type = 'verifactu_accepted'").get(f1.id));
    check('S11 VERI*FACTU: se respeta el TiempoEsperaEnvio de la AEAT', () => {
      const f = getDB().prepare('SELECT next_send_at FROM verifactu_flow WHERE license_id = ?').get(lid);
      return f.next_send_at >= t0 + 90 && f.next_send_at <= t0 + 92;
    });
    await checkAsync('S11 VERI*FACTU: GET /verifactu?filter=errors → los dos que hay que subsanar', get('/api/invoicing/verifactu?filter=errors', tok),
      r => r.status === 200 && r.data.env === 'test' && r.data.sending && r.data.records.length === 2 && r.data.summary.errors === 2 && r.data.summary.accepted === 6);

    // Subsanación del rechazado.
    const bad = st(f2);
    const fix = await post(`/api/invoicing/verifactu/records/${bad.id}/resubmit`, {}, tok);
    check('S11 VERI*FACTU: subsanar → nuevo registro al final de la cadena con Subsanacion=S y RechazoPrevio=X', () => {
      const d = fix.data.record && JSON.parse(fix.data.record.data_json);
      return fix.status === 201 && d.Subsanacion === 'S' && d.RechazoPrevio === 'X' && d.Anterior.Huella === after[after.length - 1].hash
        && getDB().prepare('SELECT fixed_by FROM verifactu_records WHERE id = ?').get(bad.id).fixed_by === fix.data.record.id;
    });
    await checkAsync('S11 VERI*FACTU: no se subsana dos veces el mismo registro (409)', post(`/api/invoicing/verifactu/records/${bad.id}/resubmit`, {}, tok), r => r.status === 409);
    await checkAsync('S11 VERI*FACTU: no se subsana un registro aceptado (409)', post(`/api/invoicing/verifactu/records/${st(f1).id}/resubmit`, {}, tok), r => r.status === 409);

    // Fallo de transporte: SoapFault → sigue pendiente, reintento con espera e Incidencia en el siguiente.
    getDB().prepare('UPDATE verifactu_flow SET next_send_at = 0 WHERE license_id = ?').run(lid);
    mock.state.fault = 'Certificado no válido';
    await VF.processDue();
    const pend = getDB().prepare('SELECT * FROM verifactu_records WHERE id = ?').get(fix.data.record.id);
    check('S11 VERI*FACTU: SoapFault → sigue pendiente, se apunta el error y se reintenta más tarde', () =>
      pend.status === 'pending' && pend.attempts === 1 && pend.next_attempt_at > Date.now() / 1000 && pend.last_error.includes('Certificado no válido'));
    mock.state.fault = null;
    mock.state.decide = () => ({ estado: 'Correcto' });
    await checkAsync('S11 VERI*FACTU: "Reintentar" vuelve a poner en cola los pendientes', post('/api/invoicing/verifactu/retry', {}, tok), r => r.status === 200 && r.data.queued === 1);
    await VF.processDue();
    check('S11 VERI*FACTU: el reenvío tras un fallo va marcado como Incidencia y se acepta', () =>
      mock.state.requests.length === 3 && mock.state.requests[2].includes('<sf:Incidencia>S</sf:Incidencia>')
      && getDB().prepare('SELECT status FROM verifactu_records WHERE id = ?').get(fix.data.record.id).status === 'accepted');
    await checkAsync('S11 VERI*FACTU: la cadena sigue íntegra tras envíos y subsanaciones', get('/api/invoicing/verifactu/chain', tok), r => r.data.ok && r.data.count === 9);
    check('S11 VERI*FACTU: otra cuenta sin habilitar no envía nada', () =>
      !getDB().prepare("SELECT 1 FROM verifactu_records WHERE license_id <> ? AND status <> 'pending'").get(lid));
  } finally {
    for (const [k, v] of saved) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
    mock.server.close();
  }
}

/** Petición con cabeceras propias (Idempotency-Key). */
function req(method, path, { body, auth, headers = {} } = {}) {
  const http = require('http');
  return new Promise((resolve, reject) => {
    const data = body === undefined ? undefined : JSON.stringify(body);
    const h = { 'Content-Type': 'application/json', ...headers };
    if (data) h['Content-Length'] = Buffer.byteLength(data);
    if (auth) h.Authorization = `Bearer ${auth}`;
    const r = http.request(`http://localhost:${process.env.PORT}${path}`, { method, headers: h }, (res) => {
      const chunks = [];
      res.on('data', d => chunks.push(d));
      res.on('end', () => {
        const buf = Buffer.concat(chunks);
        let j; try { j = JSON.parse(buf.toString('utf8')); } catch { j = buf; }
        resolve({ status: res.statusCode, data: j, headers: res.headers });
      });
    });
    r.on('error', reject);
    if (data) r.write(data);
    r.end();
  });
}

async function tanda5({ post, put, get, check, checkAsync, getDB }) {
  const c = await post('/api/admin/licenses', { email: 'api11@nokfi.local', plan: 'pro', password: 'ApiFact11!' }, 'admin');
  const tok = (await post('/api/auth/login', { email: 'api11@nokfi.local', license_key: c.data.key, password: 'ApiFact11!' })).data.token;
  const lid = c.data.id;
  await put('/api/invoicing/settings', { legal_name: 'Estudio Creativo SL', tax_id: 'B12345674', address: 'Calle Luna 7', postal_code: '28004', city: 'Madrid', iban: 'ES9121000418450200051332' }, tok);
  const live = (await post('/api/keys', { name: 'n8n' }, tok)).data.key;
  const test = (await post('/api/keys', { name: 'pruebas', mode: 'test' }, tok)).data.key;
  const cust = { name: 'Bodegas Sur SA', tax_id: 'A58818501', email: 'pagos@bodegassur.es', address: 'Ctra. Jerez 4', postal_code: '11401', city: 'Jerez' };
  const lines = [{ description: 'Diseño de etiqueta', quantity: 1, unit_price: 800, vat_rate: 21 }];
  const issue = (key, body, idem) => req('POST', '/api/v1/invoices', { body, auth: key, headers: idem ? { 'Idempotency-Key': idem } : {} });

  // ── Webhooks: receptor local ──
  const W = require('../db/webhooks');
  process.env.WEBHOOKS_ALLOW_HTTP = '1';
  process.env.WEBHOOKS_ALLOW_PRIVATE = '1';
  const http = require('http');
  const srv = http.createServer((rq, rs) => { rq.resume(); rq.on('end', () => { rs.writeHead(200); rs.end('ok'); }); });
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  const hook = await req('POST', '/api/v1/webhooks', { body: { url: `http://127.0.0.1:${srv.address().port}/h`, events: ['invoice.issued', 'invoice.cancelled', 'invoice.paid', 'invoice.rejected', 'verifactu.accepted', 'verifactu.rejected'] }, auth: live });
  check('S11 API: webhook suscrito a los eventos de facturas y VERI*FACTU', () => hook.status === 201 && W.EVENT_TYPES.includes('invoice.issued') && W.EVENT_TYPES.includes('verifactu.rejected'));
  const events = (type) => getDB().prepare('SELECT payload_json FROM webhook_deliveries WHERE license_id = ? AND event_type = ? ORDER BY id').all(lid, type).map(r => JSON.parse(r.payload_json));

  try {
    await checkAsync('S11 API: emitir sin Idempotency-Key → 400 idempotency_key_required (y no se emite nada)', issue(live, { customer: cust, lines }),
      r => r.status === 400 && r.data.error === 'idempotency_key_required' && !getDB().prepare('SELECT 1 FROM invoices WHERE license_id = ?').get(lid));
    const a = await issue(live, { customer: cust, lines, irpf_rate: 15 }, 'pedido-1001');
    check('S11 API: POST /api/v1/invoices → 201, F1 numerada, al libro y con registro VERI*FACTU', () =>
      a.status === 201 && a.data.kind === 'F1' && a.data.number === `F${a.data.issue_date.slice(0, 4)}-0001` && a.data.total === 848 && a.data.source === 'api' && a.data.livemode
      && !!a.data.ledger_entry_id && !!getDB().prepare("SELECT 1 FROM verifactu_records WHERE invoice_id = ? AND type = 'alta'").get(a.data.id));
    const again = await issue(live, { customer: cust, lines, irpf_rate: 15 }, 'pedido-1001');
    check('S11 API: reintento con la misma Idempotency-Key → la misma factura, sin duplicar', () =>
      again.status === 201 && again.data.id === a.data.id && again.headers['idempotent-replayed'] === 'true' && getDB().prepare('SELECT COUNT(*) n FROM invoices WHERE license_id = ?').get(lid).n === 1);
    await checkAsync('S11 API: misma clave con otra factura → 422', issue(live, { customer: cust, lines: [{ ...lines[0], unit_price: 1 }] }, 'pedido-1001'), r => r.status === 422);
    check('S11 API: webhook invoice.issued con el resumen de la factura', () => {
      const e = events('invoice.issued')[0];
      return e && e.livemode === true && e.data.id === a.data.id && e.data.number === a.data.number && e.data.total === 848 && e.data.customer.tax_id === 'A58818501';
    });
    await checkAsync('S11 API: errores de validación con el mismo formato que la app (400 field)', issue(live, { customer: cust, lines: [{ description: '', unit_price: 1 }] }, 'k-bad'),
      r => r.status === 400 && r.data.error === 'invalid_input' && r.data.field === 'line_description');

    await checkAsync('S11 API: GET /api/v1/invoices lista las reales', req('GET', '/api/v1/invoices', { auth: live }), r => r.status === 200 && r.data.invoices.length === 1 && r.data.invoices[0].id === a.data.id);
    await checkAsync('S11 API: GET /api/v1/invoices/:id con líneas, eventos y VERI*FACTU', req('GET', `/api/v1/invoices/${a.data.id}`, { auth: live }),
      r => r.status === 200 && r.data.lines.length === 1 && r.data.events[0].type === 'issued' && r.data.verifactu[0].type === 'alta' && /^[0-9A-F]{64}$/.test(r.data.verifactu[0].hash));
    await checkAsync('S11 API: PDF y UBL de la factura', Promise.all([req('GET', `/api/v1/invoices/${a.data.id}/pdf`, { auth: live }), req('GET', `/api/v1/invoices/${a.data.id}/xml?format=ubl`, { auth: live })]),
      ([p, x]) => p.status === 200 && p.headers['content-type'] === 'application/pdf' && Buffer.isBuffer(p.data) && p.data.slice(0, 4).toString() === '%PDF'
        && x.status === 200 && String(x.data).includes(a.data.number));

    const r1 = await req('POST', `/api/v1/invoices/${a.data.id}/rectify`, { auth: live, headers: { 'Idempotency-Key': 'abono-1' }, body: { rectification_reason: 'Descuento pactado', lines: [{ description: 'Descuento', quantity: -1, unit_price: 100, vat_rate: 21 }] } });
    check('S11 API: rectificativa por la API → R1 en la serie R con el cliente de la original', () =>
      r1.status === 201 && r1.data.kind === 'R1' && r1.data.rectifies_id === a.data.id && r1.data.number.startsWith('R') && r1.data.customer.tax_id === 'A58818501');
    await checkAsync('S11 API: rectificar sin Idempotency-Key → 400', req('POST', `/api/v1/invoices/${a.data.id}/rectify`, { auth: live, body: { rectification_reason: 'x', lines } }), r => r.status === 400);

    const paid = await req('POST', `/api/v1/invoices/${a.data.id}/status`, { auth: live, body: { status: 'paid', date: a.data.issue_date } });
    check('S11 API: marcar cobrada → paid y webhook invoice.paid', () => paid.status === 200 && paid.data.paid === true && events('invoice.paid')[0]?.data.id === a.data.id);

    const b = await issue(live, { customer_id: a.data.customer_id, lines: [{ description: 'Error', quantity: 1, unit_price: 10, vat_rate: 21 }] }, 'pedido-1002');
    const cancelled = await req('POST', `/api/v1/invoices/${b.data.id}/cancel`, { auth: live, body: { reason: 'Duplicada' } });
    check('S11 API: anular → anulada, registro de anulación y webhook invoice.cancelled', () =>
      cancelled.status === 200 && cancelled.data.status === 'cancelled' && !!getDB().prepare("SELECT 1 FROM verifactu_records WHERE invoice_id = ? AND type = 'anulacion'").get(b.data.id)
      && events('invoice.cancelled')[0]?.data.cancel_reason === 'Duplicada');

    await checkAsync('S11 API: GET/POST /api/v1/customers', Promise.all([req('GET', '/api/v1/customers', { auth: live }), req('POST', '/api/v1/customers', { auth: live, body: { name: 'Nuevo Cliente SL', tax_id: 'B12345674' } })]),
      ([l, n]) => l.status === 200 && l.data.customers.some(x => x.tax_id === 'A58818501') && n.status === 201 && n.data.id > 0);

    // ── Claves de prueba ──
    const t1 = await issue(test, { customer: { ...cust, name: 'Cliente de prueba' }, lines }, 'test-1');
    check('S11 API: con nk_test_ → factura TEST- con numeración propia, sin libro, sin VERI*FACTU ni cliente guardado', () =>
      t1.status === 201 && t1.data.number === `TEST-F${t1.data.issue_date.slice(0, 4)}-0001` && t1.data.livemode === false && !t1.data.ledger_entry_id
      && !getDB().prepare('SELECT 1 FROM verifactu_records WHERE invoice_id = ?').get(t1.data.id)
      && !getDB().prepare("SELECT 1 FROM customers WHERE license_id = ? AND name = 'Cliente de prueba'").get(lid));
    const nextLive = await issue(live, { customer_id: a.data.customer_id, lines }, 'pedido-1003');
    check('S11 API: la serie real sigue sin huecos tras las de prueba (F…-0003)', () => nextLive.data.number === `F${nextLive.data.issue_date.slice(0, 4)}-0003`);
    await checkAsync('S11 API: cada modo solo ve sus facturas (404 cruzado y listados separados)',
      Promise.all([req('GET', `/api/v1/invoices/${t1.data.id}`, { auth: live }), req('GET', `/api/v1/invoices/${a.data.id}`, { auth: test }), req('GET', '/api/v1/invoices', { auth: test }),
        get(`/api/invoicing/invoices/${t1.data.id}`, tok), get('/api/invoicing/invoices', tok), req('POST', `/api/v1/invoices/${a.data.id}/cancel`, { auth: test, body: {} })]),
      ([x, y, l, app, appList, cx]) => x.status === 404 && y.status === 404 && l.data.invoices.length === 1 && l.data.invoices[0].id === t1.data.id
        && app.status === 404 && !appList.data.invoices.some(i => i.id === t1.data.id) && cx.status === 404);
    await checkAsync('S11 API: el PDF de prueba se genera (marca PRUEBA)', req('GET', `/api/v1/invoices/${t1.data.id}/pdf`, { auth: test }), r => r.status === 200 && Buffer.isBuffer(r.data));
    check('S11 API: los webhooks de una factura de prueba van marcados como test', () => events('invoice.issued').some(e => e.livemode === false && e.data.id === t1.data.id));
    await checkAsync('S11 API: crear cliente con nk_test_ valida pero no guarda', req('POST', '/api/v1/customers', { auth: test, body: { name: 'Solo Prueba SL', tax_id: '12345678Z' } }),
      r => r.status === 200 && r.data.id === null && !getDB().prepare("SELECT 1 FROM customers WHERE license_id = ? AND name = 'Solo Prueba SL'").get(lid));

    // ── Playground ──
    await checkAsync('S11 Playground: emitir factura en modo real → 400 test_only; en prueba → factura TEST-',
      Promise.all([post('/api/dev/playground', { operation: 'invoices.issue', mode: 'live', input: { customer: cust, lines } }, tok),
        post('/api/dev/playground', { operation: 'invoices.issue', mode: 'test', input: { customer: cust, lines } }, tok)]),
      ([l, t]) => l.status === 400 && l.data.error === 'test_only' && t.status === 200 && t.data.status === 201 && t.data.body.number.startsWith('TEST-') && t.data.body.livemode === false);

    // ── MCP ──
    const rpc = (key, name, args) => req('POST', '/api/mcp', { auth: key, body: { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } } }).then(r => r.data.result);
    await checkAsync('S11 MCP: issue_invoice sin idempotency_key → isError', rpc(live, 'issue_invoice', { customer: cust, lines }), r => r.isError && JSON.parse(r.content[0].text).error === 'idempotency_key_required');
    const m1 = await rpc(live, 'issue_invoice', { idempotency_key: 'mcp-1', customer_id: a.data.customer_id, lines });
    const m2 = await rpc(live, 'issue_invoice', { idempotency_key: 'mcp-1', customer_id: a.data.customer_id, lines });
    check('S11 MCP: issue_invoice emite (source mcp) y el reintento devuelve la misma factura', () =>
      !m1.isError && m1.structuredContent.source === 'mcp' && m1.structuredContent.kind === 'F1' && m2.structuredContent.id === m1.structuredContent.id
      && getDB().prepare("SELECT COUNT(*) n FROM invoices WHERE license_id = ? AND source = 'mcp'").get(lid).n === 1);
    await checkAsync('S11 MCP: get_invoice, list_invoices y set_invoice_status', Promise.all([
      rpc(live, 'get_invoice', { id: m1.structuredContent.id }), rpc(live, 'list_invoices', { q: m1.structuredContent.number }),
      rpc(live, 'set_invoice_status', { id: m1.structuredContent.id, status: 'rejected', reason: 'Importe incorrecto' })]),
      ([g, l, s]) => g.structuredContent.verifactu.length === 1 && l.structuredContent.invoices.length === 1 && s.structuredContent.customer_status === 'rejected'
        && events('invoice.rejected')[0]?.data.reason === 'Importe incorrecto');
    const mr = await rpc(live, 'issue_invoice', { idempotency_key: 'mcp-r1', rectifies_id: a.data.id, rectification_reason: 'Otro ajuste', lines: [{ description: 'Ajuste', quantity: -1, unit_price: 50, vat_rate: 21 }] });
    check('S11 MCP: issue_invoice con rectifies_id → rectificativa', () => !mr.isError && mr.structuredContent.kind === 'R1' && mr.structuredContent.rectifies_id === a.data.id);
    await checkAsync('S11 MCP: cancel_invoice (y no se anula una con rectificativas)', Promise.all([rpc(live, 'cancel_invoice', { id: nextLive.data.id, reason: 'x' }), rpc(live, 'cancel_invoice', { id: a.data.id })]),
      ([ok, ko]) => ok.structuredContent.status === 'cancelled' && ko.isError && JSON.parse(ko.content[0].text).error === 'has_rectifications');
    await checkAsync('S11 MCP: con nk_test_ issue_invoice crea una factura de prueba', rpc(test, 'issue_invoice', { idempotency_key: 'mcp-1', customer: cust, lines }),
      r => !r.isError && r.structuredContent.livemode === false && r.structuredContent.number.startsWith('TEST-'));

    // ── Webhook de VERI*FACTU ──
    const VF = require('../services/verifactu');
    const mock = await new Promise((resolve) => {
      const s = http.createServer((rq, rs) => {
        let body = ''; rq.on('data', d => { body += d; });
        rq.on('end', () => {
          const regs = body.split('<sfLR:RegistroFactura>').slice(1).map(ch => ({ alta: ch.includes('<sf:RegistroAlta>'), n: ch.match(/<sf:NumSerieFactura(?:Anulada)?>([^<]+)</)[1] }));
          rs.writeHead(200, { 'Content-Type': 'text/xml' });
          rs.end(`<e:Envelope xmlns:e="http://schemas.xmlsoap.org/soap/envelope/"><e:Body><r:RespuestaRegFactuSistemaFacturacion xmlns:r="${SFR}" xmlns:t="${SF}"><r:TiempoEsperaEnvio>60</r:TiempoEsperaEnvio><r:EstadoEnvio>ParcialmenteCorrecto</r:EstadoEnvio>`
            + regs.map((g, i) => `<r:RespuestaLinea><r:IDFactura><t:NumSerieFactura>${g.n}</t:NumSerieFactura></r:IDFactura><r:Operacion><t:TipoOperacion>${g.alta ? 'Alta' : 'Anulacion'}</t:TipoOperacion></r:Operacion><r:EstadoRegistro>${i === 0 ? 'Incorrecto' : 'Correcto'}</r:EstadoRegistro>${i === 0 ? '<r:CodigoErrorRegistro>4102</r:CodigoErrorRegistro><r:DescripcionErrorRegistro>NIF no identificado</r:DescripcionErrorRegistro>' : ''}</r:RespuestaLinea>`).join('')
            + '</r:RespuestaRegFactuSistemaFacturacion></e:Body></e:Envelope>');
        });
      });
      s.listen(0, '127.0.0.1', () => resolve(s));
    });
    const saved = ['VERIFACTU_ENV', 'VERIFACTU_LICENSES', 'VERIFACTU_PRODUCER_NIF', 'VERIFACTU_ENDPOINT'].map(k => [k, process.env[k]]);
    Object.assign(process.env, { VERIFACTU_ENV: 'test', VERIFACTU_LICENSES: String(lid), VERIFACTU_PRODUCER_NIF: 'B87654321', VERIFACTU_ENDPOINT: `http://127.0.0.1:${mock.address().port}/` });
    try {
      await VF.processDue();
      check('S11 API: webhooks verifactu.rejected (con el código) y verifactu.accepted tras el envío', () => {
        const rej = events('verifactu.rejected');
        const acc = events('verifactu.accepted');
        return rej.length === 1 && rej[0].data.error_code === '4102' && rej[0].data.number === a.data.number && rej[0].data.env === 'test' && acc.length >= 3;
      });
    } finally {
      for (const [k, v] of saved) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
      mock.close();
    }
  } finally {
    delete process.env.WEBHOOKS_ALLOW_HTTP;
    delete process.env.WEBHOOKS_ALLOW_PRIVATE;
    await require('../services/webhooks').idle?.();
    srv.close();
  }
}
