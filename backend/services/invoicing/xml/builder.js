/**
 * services/invoicing/xml/builder.js — sesión 11 (tanda 3): constructor de XML
 * mínimo para los generadores de factura electrónica. Nodos como arrays:
 *   el('cbc:ID', { schemeID: 'X' }, 'F2026-0001')
 *   el('cac:Party', null, [el(...), el(...)])
 * Los hijos null/undefined/false se omiten (campos opcionales).
 */

'use strict';

const esc = (s) => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  // Caracteres de control no válidos en XML 1.0.
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');

/** Marca para un elemento obligatorio que va vacío (<x/>): el resto de vacíos se omiten. */
const EMPTY = Symbol('empty');

function el(name, attrs, children) {
  return { name, attrs: attrs || null, children };
}

function render(node, depth = 0) {
  if (node === null || node === undefined || node === false) return '';
  if (Array.isArray(node)) return node.map(n => render(n, depth)).join('');
  const pad = '  '.repeat(depth);
  const attrs = node.attrs ? Object.entries(node.attrs).filter(([, v]) => v !== undefined && v !== null && v !== '').map(([k, v]) => ` ${k}="${esc(v)}"`).join('') : '';
  const kids = node.children;
  if (kids === EMPTY) return `${pad}<${node.name}${attrs}/>\n`;
  if (kids === undefined || kids === null || kids === '' || (Array.isArray(kids) && !kids.some(k => k !== null && k !== undefined && k !== false))) {
    // Un elemento sin contenido solo se escribe si tiene atributos.
    return attrs ? `${pad}<${node.name}${attrs}/>\n` : '';
  }
  if (!Array.isArray(kids) && typeof kids !== 'object') return `${pad}<${node.name}${attrs}>${esc(kids)}</${node.name}>\n`;
  return `${pad}<${node.name}${attrs}>\n${render(kids, depth + 1)}${pad}</${node.name}>\n`;
}

const doc = (root) => `<?xml version="1.0" encoding="UTF-8"?>\n${render(root)}`;

/** Importes con 2 decimales y punto (también −0,00 → 0.00). */
const amt = (n) => (Math.round((Number(n) + Number.EPSILON) * 100) / 100 || 0).toFixed(2);
/** Precios/cantidades sin ceros sobrantes (hasta `max` decimales). */
const dec = (n, max = 4) => String(Number((Number(n) || 0).toFixed(max)));

module.exports = { el, render, doc, amt, dec, esc, EMPTY };
