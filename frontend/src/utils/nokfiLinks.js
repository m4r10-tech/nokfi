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

/**
 * Separa las rutas de Nokfi que el asistente pone en su respuesta (normalmente
 * en la última línea) y devuelve el texto limpio + los enlaces, sin repetir.
 */
export function extractToolLinks(text) {
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
