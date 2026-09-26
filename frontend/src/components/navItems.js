import { LayoutDashboard, ClipboardList, FileSpreadsheet, History, Calculator, Settings, Wallet, LifeBuoy } from 'lucide-react';

/**
 * Navegación de la app privada — fuente única para la Sidebar (escritorio) y
 * la BottomNav (móvil). `mobile: 'bar'` va fijo en la barra inferior; el resto
 * vive en la hoja "Más". Historial e Informes se FUSIONARON (sesión 3, Tanda
 * N): eran la misma pantalla; /app/informes redirige a /app/historial.
 */
// Sesión 4: "Finanzas" (libro, impuestos, cobros, fugas, previsión y
// calendario) entra en la barra; Historial pasa a la hoja "Más" junto a
// Calculadoras, Ayuda (§4.2) y Configuración.
export const NAV_ITEMS = [
  { to: '/app/home', icon: LayoutDashboard, key: 'nav.home', mobile: 'bar' },
  { to: '/app/finanzas', icon: Wallet, key: 'nav.finance', mobile: 'bar' },
  { to: '/app/cuestionario', icon: ClipboardList, key: 'nav.questionnaire', shortKey: 'nav.questionnaireShort', mobile: 'bar' },
  { to: '/app/excel', icon: FileSpreadsheet, key: 'nav.excel', shortKey: 'nav.excelShort', mobile: 'bar' },
  { to: '/app/historial', icon: History, key: 'nav.history', mobile: 'more' },
  { to: '/app/calculadoras', icon: Calculator, key: 'nav.calculators', mobile: 'more' },
  { to: '/app/ayuda', icon: LifeBuoy, key: 'nav.help', mobile: 'more' },
  { to: '/app/configuracion', icon: Settings, key: 'nav.settings', mobile: 'more' }
];

/**
 * Sección padre de una ruta (flecha de volver, Tanda N). Los subapartados
 * vuelven a su hub; las secciones de primer nivel, al panel de inicio.
 */
export function parentOf(pathname) {
  const p = pathname.replace(/\/+$/, '');
  if (p === '/app/home' || p === '/app') return null;
  if (p.startsWith('/app/excel/')) return { to: '/app/excel', key: 'nav.excel' };
  if (p.startsWith('/app/historial/')) return { to: '/app/historial', key: 'nav.history' };
  return { to: '/app/home', key: 'nav.home' };
}
