'use strict';

/**
 * utils/names.js — espejo de frontend/src/utils/names.js (sesión 10).
 *
 * Nombres de empresa leídos de facturas: muchas los imprimen en MAYÚSCULAS
 * ("NEUMÁTICOS DEL SUR, S.L."). Si el nombre viene TODO en mayúsculas se pasa
 * a formato título ("Neumáticos del Sur, S.L."); si trae minúsculas, se deja
 * tal cual (lo escribió alguien a propósito).
 */
const KEEP_UPPER = new Set(['SL', 'SLU', 'SLL', 'SLP', 'SA', 'SAU', 'SC', 'CB', 'SCOOP', 'SCP', 'UTE', 'SAT', 'II', 'III', 'IV', 'VI', 'VII', 'VIII', 'IX', 'XI', 'XII']);
const SMALL = new Set(['de', 'del', 'la', 'las', 'los', 'el', 'y', 'e', 'en', 'para', 'por', 'a', 'al', 'con', 'i', "d'"]);

const cap = (w) => w.charAt(0).toLocaleUpperCase('es') + w.slice(1);

function word(raw, first) {
  const m = raw.match(/^([^\p{L}\p{N}]*)(.*?)([^\p{L}\p{N}.]*)$/u);
  const [, pre, core, post] = m || ['', '', raw, ''];
  if (!core) return raw;
  if (KEEP_UPPER.has(core.replace(/\./g, ''))) return raw;
  const lower = core.toLocaleLowerCase('es');
  if (!first && SMALL.has(lower)) return pre + lower + post;
  // Siglas con puntos ("J.M.") o cortas sin vocales ("SL", "JMC") se respetan.
  if (/^(\p{L}\.)+$/u.test(core) || (core.length <= 4 && !/[AEIOUÁÉÍÓÚ]/.test(core))) return raw;
  return pre + lower.split('-').map(cap).join('-') + post;
}

function nameCase(s) {
  if (!s || typeof s !== 'string') return s;
  if (s !== s.toLocaleUpperCase('es') || !/\p{Lu}{3}/u.test(s)) return s;
  // Una sola palabra ("BBVA", "AXA", "MAPFRE"): no se distingue una sigla de un nombre.
  if (!/\s/.test(s.trim())) return s;
  return s.split(/(\s+)/).map((w, i) => (/^\s+$/.test(w) ? w : word(w, i === 0))).join('');
}

module.exports = { nameCase };
