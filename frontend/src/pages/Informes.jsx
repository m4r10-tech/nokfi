import HistoryBrowser from '../components/HistoryBrowser';
import { useLang } from '../context/LangContext';

/**
 * Informes (sección 14 del proyecto).
 *
 * Antes era un empty-state con la LIMITACIÓN CONOCIDA de que el backend no
 * persistía análisis para exportar "más tarde". Con la deuda G2 resuelta, esta
 * página reutiliza el mismo historial (components/HistoryBrowser) que
 * Historial: cada análisis guardado se puede abrir y re-exportar a PDF. La
 * lógica compartida evita duplicar la lista+detalle; aquí solo cambia el
 * propósito de navegación.
 */
export default function Informes() {
  const { t } = useLang();
  return <HistoryBrowser title={t('nav.reports')} t={t} />;
}
