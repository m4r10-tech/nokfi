import HistoryBrowser from '../components/HistoryBrowser';
import { useLang } from '../context/LangContext';

/**
 * Historial de análisis (sección 14 del proyecto).
 *
 * Antes era un empty-state permanente (LIMITACIÓN CONOCIDA: el backend no
 * persistía el historial). Con la deuda G2 resuelta, los análisis se guardan
 * al generarse (routes/proxy.js → createAnalysis) y esta página los lista y
 * abre. La lógica de lista+detalle+export vive en components/HistoryBrowser
 * (compartida con Informes); esta página solo fija el título.
 */
export default function Historial() {
  const { t } = useLang();
  return <HistoryBrowser title={t('history.title')} t={t} />;
}
