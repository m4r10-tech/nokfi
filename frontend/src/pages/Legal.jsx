import { useLang } from '../context/LangContext';
import LegalDoc from '../components/LegalDoc';
import { TERMS } from '../legal/terms';
import { DPA } from '../legal/dpa';

/**
 * /terminos y /encargo-tratamiento. Textos legales en castellano (prevalece) e
 * inglés; en fr/it/de/pl se muestra el inglés con un aviso.
 */
const DOCS = { terms: TERMS, dpa: DPA };

export default function Legal({ kind }) {
  const { t, lang } = useLang();
  const set = DOCS[kind];
  const doc = set[lang] || set.en;
  return <LegalDoc doc={doc} metaDesc={doc.intro.slice(0, 155)} fallbackNote={set[lang] ? null : t('legal.englishOnly')} />;
}
