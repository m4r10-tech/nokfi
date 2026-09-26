import { MessageCircle } from 'lucide-react';
import { useChat } from '../context/ChatContext';
import { useLang } from '../context/LangContext';

/** C5 — "Preguntar sobre este informe": abre el asistente con el análisis como contexto. */
export default function AskAssistant({ analysisId, title }) {
  const chat = useChat();
  const { t } = useLang();
  if (!chat || !analysisId) return null;
  return (
    <button onClick={() => chat.openChat({ analysisId, title })} className="btn btn-secondary btn-sm">
      <MessageCircle size={14} /> {t('chat.askReport')}
    </button>
  );
}
