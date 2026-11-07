/**
 * Pantallas de Nokfi a las que enlazan los informes y el asistente (sesión 8).
 * Misma lista que NOKFI_LINKS en backend/services/ai/financeContext.js: el
 * backend ya filtra, y aquí solo se pinta lo que esté en esta lista.
 */
export const TOOL_LINKS = {
  '/app/finanzas/cobros': 'finance.tabReceivables',
  '/app/finanzas/impuestos': 'finance.tabTaxes',
  '/app/finanzas/prevision': 'finance.tabForecast',
  '/app/finanzas/calendario': 'finance.tabCalendar',
  '/app/finanzas/libro': 'finance.tabLedger',
  '/app/finanzas/fugas': 'finance.tabLeaks',
  '/app/finanzas/sector': 'finance.tabBenchmark',
  '/app/calculadoras': 'nav.calculators',
  '/app/excel': 'nav.excel',
  '/app/configuracion': 'nav.settings'
};

export const toolLabelKey = (path) => TOOL_LINKS[path] || null;

const PATH_RE = /\/app\/(?:finanzas\/(?:cobros|impuestos|prevision|calendario|libro|fugas|sector)|calculadoras|excel|configuracion)\b/g;

/* S15b D7: a veces el modelo copia la marca de los datos («[enlace: cobros]»,
   «/enlace: cobros») en vez de la ruta: se convierte en la ruta para que salga
   el botón. Claves = NOKFI_LINKS del backend. */
const KEY_PATHS = {
  cobros: '/app/finanzas/cobros', impuestos: '/app/finanzas/impuestos', prevision: '/app/finanzas/prevision',
  calendario: '/app/finanzas/calendario', libro: '/app/finanzas/libro', fugas: '/app/finanzas/fugas',
  sector: '/app/finanzas/sector', calculadoras: '/app/calculadoras', excel: '/app/excel', configuracion: '/app/configuracion'
};
const MARK_RE = /[[(/]?[ \t]*(?:enlace|link|lien|collegamento|verknüpfung|odnośnik|łącze)[ \t]*:[ \t]*(cobros|impuestos|previsi[oó]n|calendario|libro|fugas|sector|calculadoras|excel|configuraci[oó]n)\b[ \t]*[\])]?/gi;
const keyMarksToPaths = (text) => String(text).replace(MARK_RE, (_m, k) =>
  KEY_PATHS[k.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')] || _m);

/**
 * Separa las rutas de Nokfi que el asistente pone en su respuesta (normalmente
 * en la última línea) y devuelve el texto limpio + los enlaces, sin repetir.
 */
export function extractToolLinks(raw) {
  const text = keyMarksToPaths(raw);
  const links = [...new Set(String(text).match(PATH_RE) || [])].filter(p => TOOL_LINKS[p]);
  if (!links.length) return { text, links };
  const clean = String(text)
    .split('\n')
    // Fuera las líneas que solo eran la ruta (con algún signo alrededor).
    .filter(line => { const rest = line.replace(PATH_RE, ''); return rest === line || rest.replace(/[\s\-–—:·.,()→>]/g, '') !== ''; })
    .join('\n')
    .replace(PATH_RE, '')
    .replace(/\(\s*\)/g, '')
    .replace(/ {2,}/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .trim();
  return { text: clean, links };
}
