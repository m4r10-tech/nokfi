/**
 * services/invoicing/xml/common.js — sesión 11 (tanda 3): correspondencias
 * comunes a UBL y CII (EN 16931) desde el modelo interno de Nokfi.
 */

'use strict';

const M = require('../model');

/** Identificador de personalización. EN 16931 base mientras la AEAT no publique el de la SPFE. */
const CUSTOMIZATION_ID = process.env.EINVOICE_CUSTOMIZATION_ID || 'urn:cen.eu:en16931:2017';

// Categoría de IVA (UNTDID 5305) según la causa del 0 %.
const EXEMPTION_CATEGORY = { E1: 'E', E2: 'G', E3: 'E', E4: 'E', E5: 'K', E6: 'E', N1: 'O', N2: 'O', S2: 'AE' };
// Texto de la exención (BT-120), en castellano: va en el documento fiscal.
const EXEMPTION_TEXT = {
  E1: 'Exenta por el artículo 20 de la Ley 37/1992', E2: 'Exenta por el artículo 21 de la Ley 37/1992 (exportación)',
  E3: 'Exenta por el artículo 22 de la Ley 37/1992', E4: 'Exenta por los artículos 23 y 24 de la Ley 37/1992',
  E5: 'Entrega intracomunitaria exenta (artículo 25 de la Ley 37/1992)', E6: 'Operación exenta',
  N1: 'Operación no sujeta (artículos 7 y 14 de la Ley 37/1992)', N2: 'Operación no sujeta por reglas de localización',
  S2: 'Inversión del sujeto pasivo (artículo 84.Uno.2.º de la Ley 37/1992)'
};

const vatCategory = (rate, exemption) => (Number(rate) > 0 ? 'S' : EXEMPTION_CATEGORY[exemption] || 'E');

// Medio de pago (UNTDID 4461): SEPA transferencia 58, SEPA adeudo 59, tarjeta 48, efectivo 10, otro ZZZ.
const PAYMENT_MEANS = { transfer: '58', direct_debit: '59', card: '48', cash: '10', other: 'ZZZ' };

// Unidades (UN/ECE Rec. 20): las habituales; el resto, "unidad" (C62).
const UNITS = { h: 'HUR', hora: 'HUR', horas: 'HUR', hr: 'HUR', d: 'DAY', dia: 'DAY', 'día': 'DAY', dias: 'DAY', 'días': 'DAY', kg: 'KGM', g: 'GRM', l: 'LTR', m: 'MTR', m2: 'MTK', 'm²': 'MTK', km: 'KMT', mes: 'MON', meses: 'MON' };
const unitCode = (u) => UNITS[String(u || '').trim().toLowerCase()] || 'C62';

/** NIF con prefijo de país para el NIF-IVA (BT-31/BT-48). */
const vatId = (party) => (!party?.tax_id ? '' : /^[A-Z]{2}/.test(party.tax_id) ? party.tax_id : `${party.country || 'ES'}${party.tax_id}`);

/** Tipo de documento (UNTDID 1001) y signo: abonos en positivo como nota de crédito (381). */
function documentKind(inv) {
  if (!inv.kind.startsWith('R')) return { type: '380', credit: false, sign: 1 };
  if (inv.total < 0) return { type: '381', credit: true, sign: -1 };
  return { type: '384', credit: false, sign: 1 };
}

/** Importe bruto de la línea (cantidad × precio) y el descuento como "allowance". */
function lineParts(l) {
  const gross = M.r2(l.quantity * l.unit_price);
  return { gross, allowance: M.r2(gross - l.amount) };
}

module.exports = { CUSTOMIZATION_ID, EXEMPTION_TEXT, vatCategory, PAYMENT_MEANS, unitCode, vatId, documentKind, lineParts };
