import { useLang } from '../context/LangContext';
import LegalDoc from '../components/LegalDoc';

/**
 * /privacidad — Política de privacidad (página pública, indexable).
 *
 * El contenido (i18n: privacy.*) describe SOLO lo que la aplicación hace de
 * verdad: qué guarda la BD, que los Excel/PDF se leen en el navegador (nunca se
 * suben), qué terceros intervienen y que no hay cookies de seguimiento. No
 * afirmar nada aquí que el código no haga — si la app cambia, actualizar las claves.
 */
export default function Privacidad() {
  const { t } = useLang();
  const doc = { title: t('privacy.title'), updated: t('privacy.updated'), intro: t('privacy.intro'), sections: t('privacy.sections') };
  return <LegalDoc doc={doc} metaDesc={t('meta.privacyDesc')} />;
}
