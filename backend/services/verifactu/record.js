/**
 * services/verifactu/record.js — sesión 11 (tanda 4): registros de
 * facturación de VERI*FACTU (alta y anulación), su huella y su XML.
 * Puro: sin BD.
 *
 * Huella (especificaciones AEAT v0.1.2): SHA-256 en hexadecimal y mayúsculas
 * de "campo=valor&campo=valor…" en UTF-8, con los valores sin espacios a los
 * lados y el campo vacío si no hay valor (p. ej. "Huella=" en el primer
 * registro). Los campos y su orden:
 *   alta:      IDEmisorFactura, NumSerieFactura, FechaExpedicionFactura,
 *              TipoFactura, CuotaTotal, ImporteTotal, Huella (anterior),
 *              FechaHoraHusoGenRegistro
 *   anulación: IDEmisorFacturaAnulada, NumSerieFacturaAnulada,
 *              FechaExpedicionFacturaAnulada, Huella (anterior),
 *              FechaHoraHusoGenRegistro
 *
 * Diseño de registro: SuministroInformacion.xsd (IDVersion 1.0). Importes:
 * CuotaTotal = Σ cuotas de IVA + recargo; ImporteTotal = base + cuotas (la
 * retención de IRPF no se resta, validación 17 de la AEAT).
 */

'use strict';

const crypto = require('crypto');
const { el, render, amt } = require('../invoicing/xml/builder');

const NS = {
  sf: 'https://www2.agenciatributaria.gob.es/static_files/common/internet/dep/aplicaciones/es/aeat/tike/cont/ws/SuministroInformacion.xsd',
  sfLR: 'https://www2.agenciatributaria.gob.es/static_files/common/internet/dep/aplicaciones/es/aeat/tike/cont/ws/SuministroLR.xsd',
  soapenv: 'http://schemas.xmlsoap.org/soap/envelope/'
};

const EU = new Set(['AT', 'BE', 'BG', 'CY', 'CZ', 'DE', 'DK', 'EE', 'GR', 'EL', 'FI', 'FR', 'HR', 'HU', 'IE', 'IT', 'LT', 'LU', 'LV', 'MT', 'NL', 'PL', 'PT', 'RO', 'SE', 'SI', 'SK', 'XI']);

/* ── Huella ── */
function huella(pairs) {
  const s = pairs.map(([k, v]) => `${k}=${v === undefined || v === null ? '' : String(v).trim()}`).join('&');
  return crypto.createHash('sha256').update(s, 'utf8').digest('hex').toUpperCase();
}

const altaHash = (r) => huella([
  ['IDEmisorFactura', r.IDEmisorFactura], ['NumSerieFactura', r.NumSerieFactura], ['FechaExpedicionFactura', r.FechaExpedicionFactura],
  ['TipoFactura', r.TipoFactura], ['CuotaTotal', r.CuotaTotal], ['ImporteTotal', r.ImporteTotal],
  ['Huella', r.Anterior?.Huella], ['FechaHoraHusoGenRegistro', r.FechaHoraHusoGenRegistro]
]);

const anulacionHash = (r) => huella([
  ['IDEmisorFacturaAnulada', r.IDEmisorFactura], ['NumSerieFacturaAnulada', r.NumSerieFactura],
  ['FechaExpedicionFacturaAnulada', r.FechaExpedicionFactura],
  ['Huella', r.Anterior?.Huella], ['FechaHoraHusoGenRegistro', r.FechaHoraHusoGenRegistro]
]);

/* ── Fechas ── */
/** 2026-10-01 → 01-10-2026 */
const fecha = (iso) => `${iso.slice(8, 10)}-${iso.slice(5, 7)}-${iso.slice(0, 4)}`;

/** Fecha-hora con huso en hora peninsular: 2026-10-01T19:20:30+02:00 (sin milisegundos). */
function fechaHoraHuso(now = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
  }).formatToParts(now).map(p => [p.type, p.value]));
  const local = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  const off = Math.round((local - Math.floor(now.getTime() / 1000) * 1000) / 60000);
  const sign = off >= 0 ? '+' : '-';
  const hh = String(Math.floor(Math.abs(off) / 60)).padStart(2, '0');
  const mm = String(Math.abs(off) % 60).padStart(2, '0');
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}${sign}${hh}:${mm}`;
}

/* ── Datos del registro desde una factura ── */
const cut = (s, n) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, n);
const rate = (n) => String(Number(Number(n).toFixed(2)));

/** Destinatario: NIF español o IDOtro (NIF-IVA de la UE = 02; resto = 04, documento del país). */
function destinatario(c) {
  const name = cut(c.name, 120);
  if (!c.country || c.country === 'ES') return { NombreRazon: name, NIF: c.tax_id };
  const country = c.country === 'GR' ? 'EL' : c.country;
  if (EU.has(c.country)) {
    const id = /^[A-Z]{2}/.test(c.tax_id) ? c.tax_id : `${country}${c.tax_id}`;
    return { NombreRazon: name, IDOtro: { CodigoPais: c.country, IDType: '02', ID: id.slice(0, 20) } };
  }
  return { NombreRazon: name, IDOtro: { CodigoPais: c.country, IDType: '04', ID: c.tax_id.slice(0, 20) } };
}

/** Una línea del desglose por cada tipo (exenta, no sujeta, inversión del sujeto pasivo o sujeta). */
function desglose(inv) {
  return inv.taxes.map(g => {
    const d = { Impuesto: '01' };
    if (g.vat_rate === 0 && inv.exemption) {
      const ex = inv.exemption;
      if (/^E[1-6]$/.test(ex)) {
        // Exportaciones (arts. 21 y 22 LIVA): clave 02; la clave 01 no admite E2 ni E3.
        d.ClaveRegimen = ex === 'E2' || ex === 'E3' ? '02' : '01';
        d.OperacionExenta = ex;
        d.BaseImponibleOimporteNoSujeto = amt(g.base);
      } else if (ex === 'S2') {
        Object.assign(d, { ClaveRegimen: '01', CalificacionOperacion: 'S2', TipoImpositivo: '0', BaseImponibleOimporteNoSujeto: amt(g.base), CuotaRepercutida: '0.00' });
      } else {
        Object.assign(d, { ClaveRegimen: '01', CalificacionOperacion: ex, BaseImponibleOimporteNoSujeto: amt(g.base) });
      }
      return d;
    }
    Object.assign(d, { ClaveRegimen: '01', CalificacionOperacion: 'S1', TipoImpositivo: rate(g.vat_rate), BaseImponibleOimporteNoSujeto: amt(g.base), CuotaRepercutida: amt(g.vat_amount) });
    if (g.re_rate > 0) Object.assign(d, { TipoRecargoEquivalencia: rate(g.re_rate), CuotaRecargoEquivalencia: amt(g.re_amount) });
    return d;
  });
}

/** Encadenamiento: datos del registro anterior (o null si es el primero). */
const anterior = (prev) => (prev ? { IDEmisorFactura: prev.issuer_nif, NumSerieFactura: prev.number, FechaExpedicionFactura: fecha(prev.issue_date), Huella: prev.hash } : null);

/**
 * Registro de alta. inv: factura (con number, issuer, customer, taxes, lines…);
 * opts: { prev, original (si es rectificativa), now, subsanacion, rechazoPrevio }.
 */
function buildAlta(inv, { prev = null, original = null, now = new Date(), subsanacion = false, rechazoPrevio = false } = {}) {
  const r = {
    IDEmisorFactura: inv.issuer.tax_id,
    NumSerieFactura: inv.number,
    FechaExpedicionFactura: fecha(inv.issue_date),
    NombreRazonEmisor: cut(inv.issuer.name, 120),
    TipoFactura: inv.kind,
    DescripcionOperacion: cut(inv.lines.map(l => l.description).join('; '), 500) || `Factura ${inv.number}`,
    CuotaTotal: amt(inv.vat_amount + inv.re_amount),
    ImporteTotal: amt(inv.base + inv.vat_amount + inv.re_amount),
    Desglose: desglose(inv),
    Anterior: anterior(prev),
    FechaHoraHusoGenRegistro: fechaHoraHuso(now)
  };
  if (subsanacion) r.Subsanacion = 'S';
  if (subsanacion && rechazoPrevio) r.RechazoPrevio = 'X';
  if (inv.kind.startsWith('R')) {
    r.TipoRectificativa = 'I'; // por diferencias
    if (original) r.FacturasRectificadas = [{ IDEmisorFactura: original.issuer.tax_id, NumSerieFactura: original.number, FechaExpedicionFactura: fecha(original.issue_date) }];
  }
  if (inv.operation_date && inv.operation_date !== inv.issue_date) r.FechaOperacion = fecha(inv.operation_date);
  if (inv.kind !== 'F2' && inv.kind !== 'R5' && inv.customer?.tax_id) r.Destinatarios = [destinatario(inv.customer)];
  r.Huella = altaHash(r);
  return r;
}

/** Registro de anulación. opts: { prev, now }. */
function buildAnulacion(inv, { prev = null, now = new Date() } = {}) {
  const r = {
    IDEmisorFactura: inv.issuer.tax_id,
    NumSerieFactura: inv.number,
    FechaExpedicionFactura: fecha(inv.issue_date),
    Anterior: anterior(prev),
    FechaHoraHusoGenRegistro: fechaHoraHuso(now)
  };
  r.Huella = anulacionHash(r);
  return r;
}

/* ── XML ── */
const sf = (name, children) => el(`sf:${name}`, null, children);

function partyXml(name, p) {
  if (p.NIF) return sf(name, [sf('NombreRazon', p.NombreRazon), sf('NIF', p.NIF)]);
  return sf(name, [sf('NombreRazon', p.NombreRazon), sf('IDOtro', [sf('CodigoPais', p.IDOtro.CodigoPais), sf('IDType', p.IDOtro.IDType), sf('ID', p.IDOtro.ID)])]);
}

function sistemaXml(s) {
  return sf('SistemaInformatico', [
    sf('NombreRazon', s.NombreRazon), sf('NIF', s.NIF), sf('NombreSistemaInformatico', s.NombreSistemaInformatico),
    sf('IdSistemaInformatico', s.IdSistemaInformatico), sf('Version', s.Version), sf('NumeroInstalacion', s.NumeroInstalacion),
    sf('TipoUsoPosibleSoloVerifactu', s.TipoUsoPosibleSoloVerifactu), sf('TipoUsoPosibleMultiOT', s.TipoUsoPosibleMultiOT),
    sf('IndicadorMultiplesOT', s.IndicadorMultiplesOT)
  ]);
}

function encadenamientoXml(a) {
  return sf('Encadenamiento', a
    ? sf('RegistroAnterior', [sf('IDEmisorFactura', a.IDEmisorFactura), sf('NumSerieFactura', a.NumSerieFactura), sf('FechaExpedicionFactura', a.FechaExpedicionFactura), sf('Huella', a.Huella)])
    : sf('PrimerRegistro', 'S'));
}

const idFacturaXml = (list, name) => list.map(f => sf(name, [sf('IDEmisorFactura', f.IDEmisorFactura), sf('NumSerieFactura', f.NumSerieFactura), sf('FechaExpedicionFactura', f.FechaExpedicionFactura)]));

/** <sf:RegistroAlta> (orden de elementos del XSD). */
function altaXml(r, sistema) {
  return sf('RegistroAlta', [
    sf('IDVersion', '1.0'),
    sf('IDFactura', [sf('IDEmisorFactura', r.IDEmisorFactura), sf('NumSerieFactura', r.NumSerieFactura), sf('FechaExpedicionFactura', r.FechaExpedicionFactura)]),
    sf('NombreRazonEmisor', r.NombreRazonEmisor),
    r.Subsanacion ? sf('Subsanacion', r.Subsanacion) : null,
    r.RechazoPrevio ? sf('RechazoPrevio', r.RechazoPrevio) : null,
    sf('TipoFactura', r.TipoFactura),
    r.TipoRectificativa ? sf('TipoRectificativa', r.TipoRectificativa) : null,
    r.FacturasRectificadas ? sf('FacturasRectificadas', idFacturaXml(r.FacturasRectificadas, 'IDFacturaRectificada')) : null,
    r.FechaOperacion ? sf('FechaOperacion', r.FechaOperacion) : null,
    sf('DescripcionOperacion', r.DescripcionOperacion),
    r.Destinatarios ? sf('Destinatarios', r.Destinatarios.map(d => partyXml('IDDestinatario', d))) : null,
    sf('Desglose', r.Desglose.map(d => sf('DetalleDesglose', [
      sf('Impuesto', d.Impuesto), sf('ClaveRegimen', d.ClaveRegimen),
      d.CalificacionOperacion ? sf('CalificacionOperacion', d.CalificacionOperacion) : null,
      d.OperacionExenta ? sf('OperacionExenta', d.OperacionExenta) : null,
      d.TipoImpositivo !== undefined ? sf('TipoImpositivo', d.TipoImpositivo) : null,
      sf('BaseImponibleOimporteNoSujeto', d.BaseImponibleOimporteNoSujeto),
      d.CuotaRepercutida !== undefined ? sf('CuotaRepercutida', d.CuotaRepercutida) : null,
      d.TipoRecargoEquivalencia ? sf('TipoRecargoEquivalencia', d.TipoRecargoEquivalencia) : null,
      d.CuotaRecargoEquivalencia ? sf('CuotaRecargoEquivalencia', d.CuotaRecargoEquivalencia) : null
    ]))),
    sf('CuotaTotal', r.CuotaTotal),
    sf('ImporteTotal', r.ImporteTotal),
    encadenamientoXml(r.Anterior),
    sistemaXml(sistema),
    sf('FechaHoraHusoGenRegistro', r.FechaHoraHusoGenRegistro),
    sf('TipoHuella', '01'),
    sf('Huella', r.Huella)
  ]);
}

/** <sf:RegistroAnulacion>. */
function anulacionXml(r, sistema) {
  return sf('RegistroAnulacion', [
    sf('IDVersion', '1.0'),
    sf('IDFactura', [sf('IDEmisorFacturaAnulada', r.IDEmisorFactura), sf('NumSerieFacturaAnulada', r.NumSerieFactura), sf('FechaExpedicionFacturaAnulada', r.FechaExpedicionFactura)]),
    encadenamientoXml(r.Anterior),
    sistemaXml(sistema),
    sf('FechaHoraHusoGenRegistro', r.FechaHoraHusoGenRegistro),
    sf('TipoHuella', '01'),
    sf('Huella', r.Huella)
  ]);
}

/**
 * <sfLR:RegFactuSistemaFacturacion> con la cabecera y hasta 1000 registros.
 * records: [{ type: 'alta'|'anulacion', data }]; obligado: { name, nif }.
 */
function regFactuXml({ obligado, records, sistema, incidencia = false }) {
  return el('sfLR:RegFactuSistemaFacturacion', { 'xmlns:sfLR': NS.sfLR, 'xmlns:sf': NS.sf }, [
    el('sfLR:Cabecera', null, [
      sf('ObligadoEmision', [sf('NombreRazon', cut(obligado.name, 120)), sf('NIF', obligado.nif)]),
      incidencia ? sf('RemisionVoluntaria', sf('Incidencia', 'S')) : null
    ]),
    ...records.map(r => el('sfLR:RegistroFactura', null, r.type === 'alta' ? altaXml(r.data, sistema) : anulacionXml(r.data, sistema)))
  ]);
}

/** Petición SOAP 1.1 completa. */
function soapEnvelope(args) {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<soapenv:Envelope xmlns:soapenv="${NS.soapenv}">\n<soapenv:Header/>\n<soapenv:Body>\n${render(regFactuXml(args), 0)}</soapenv:Body>\n</soapenv:Envelope>\n`;
}

/** URL del QR de cotejo (4 parámetros, codificados en UTF-8). */
function qrUrl(base, { IDEmisorFactura, NumSerieFactura, FechaExpedicionFactura, ImporteTotal }) {
  const q = (v) => encodeURIComponent(v);
  return `${base}?nif=${q(IDEmisorFactura)}&numserie=${q(NumSerieFactura)}&fecha=${q(FechaExpedicionFactura)}&importe=${q(ImporteTotal)}`;
}

module.exports = {
  NS, huella, altaHash, anulacionHash, fecha, fechaHoraHuso, buildAlta, buildAnulacion,
  altaXml, anulacionXml, regFactuXml, soapEnvelope, qrUrl
};
