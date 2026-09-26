import { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { MessageCircle, X, Send, Loader2, Sparkles, Trash2 } from 'lucide-react';
import { chatApi } from '../middleware/api';
import { apiErrorMessage } from '../middleware/errors';
import { useLang } from './LangContext';

/**
 * C5 — Asistente integrado (sesión 4). Botón flotante en toda la app privada y
 * "Preguntar al asistente" desde cualquier informe (lleva el contexto del
 * análisis). Ilimitado para el usuario (no gasta cuota), con modelos gratuitos
 * en el backend. La conversación vive solo en memoria de esta pestaña.
 *
 * Privacidad (DECIDIDO): aviso en letra pequeña pero legible y SIEMPRE visible
 * bajo la caja de texto, con enlace a /privacidad.
 */
const ChatContext = createContext(null);

export function ChatProvider({ children }) {
  const [open, setOpen] = useState(false);
  const [analysis, setAnalysis] = useState(null); // { id, title } | null
  const [messages, setMessages] = useState([]);

  const openChat = useCallback(({ analysisId, title } = {}) => {
    if (analysisId && analysisId !== analysis?.id) {
      setAnalysis({ id: analysisId, title });
      setMessages([]);
    }
    setOpen(true);
  }, [analysis]);

  return (
    <ChatContext.Provider value={{ openChat }}>
      {children}
      {!open && <Launcher onClick={() => setOpen(true)} />}
      {open && (
        <ChatPanel analysis={analysis} messages={messages} setMessages={setMessages}
          onClose={() => setOpen(false)} onClearContext={() => { setAnalysis(null); setMessages([]); }} />
      )}
    </ChatContext.Provider>
  );
}

export function useChat() {
  return useContext(ChatContext);
}

function Launcher({ onClick }) {
  const { t } = useLang();
  return (
    <button onClick={onClick} aria-label={t('chat.open')} title={t('chat.open')}
      className="chat-launcher fixed z-40 right-4 md:right-6 w-12 h-12 rounded-full grid place-items-center anim-scale"
      style={{ background: 'var(--accent)', color: 'var(--on-accent)', boxShadow: 'var(--shadow-lg)' }}>
      <MessageCircle size={21} />
    </button>
  );
}

function ChatPanel({ analysis, messages, setMessages, onClose, onClearContext }) {
  const { t, lang } = useLang();
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);
  const listRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => { inputRef.current?.focus(); }, []);
  useEffect(() => { listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' }); }, [messages, sending]);
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const send = async (e) => {
    e?.preventDefault();
    const q = text.trim();
    if (!q || sending) return;
    const next = [...messages, { role: 'user', content: q }];
    setMessages(next);
    setText('');
    setError(null);
    setSending(true);
    const res = await chatApi.send(next, { analysisId: analysis?.id, lang });
    setSending(false);
    if (res.ok && res.data.reply) setMessages([...next, { role: 'assistant', content: res.data.reply }]);
    else setError(apiErrorMessage(t, res));
  };

  const suggestions = analysis ? t('chat.suggestionsReport') : t('chat.suggestions');

  return (
    <div className="fixed z-50 inset-0 md:inset-auto md:right-6 md:bottom-6 md:w-[400px] md:h-[600px] md:max-h-[calc(100dvh-48px)] flex flex-col md:rounded-2xl overflow-hidden anim-scale"
      role="dialog" aria-modal="false" aria-label={t('chat.title')}
      style={{ background: 'var(--surface-1)', border: '1px solid var(--border-strong)', boxShadow: 'var(--shadow-lg)' }}>
      <header className="flex items-center gap-3 px-4 h-14 shrink-0" style={{ borderBottom: '1px solid var(--border)', paddingTop: 'env(safe-area-inset-top)', boxSizing: 'content-box' }}>
        <span className="w-8 h-8 rounded-lg grid place-items-center" style={{ background: 'var(--accent-soft)', color: 'var(--accent-text)' }}><Sparkles size={16} /></span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{t('chat.title')}</p>
          <p className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>{analysis ? `${t('chat.aboutReport')} ${analysis.title || ''}` : t('chat.subtitle')}</p>
        </div>
        {analysis && <button onClick={onClearContext} className="btn btn-ghost btn-sm !px-2" title={t('chat.clearContext')} aria-label={t('chat.clearContext')}><Trash2 size={15} /></button>}
        <button onClick={onClose} className="btn btn-ghost btn-sm !px-2" aria-label={t('common.close')}><X size={18} /></button>
      </header>

      <div ref={listRef} className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-3" aria-live="polite">
        {messages.length === 0 && (
          <div className="flex flex-col gap-2">
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{t('chat.empty')}</p>
            {Array.isArray(suggestions) && suggestions.map((s, i) => (
              <button key={i} onClick={() => setText(s)} className="text-left text-sm rounded-xl px-3 py-2 nav-item" style={{ border: '1px solid var(--border)' }}>{s}</button>
            ))}
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`max-w-[88%] rounded-2xl px-3.5 py-2.5 text-sm whitespace-pre-wrap leading-relaxed ${m.role === 'user' ? 'self-end' : 'self-start'}`}
            style={m.role === 'user' ? { background: 'var(--accent)', color: 'var(--on-accent)' } : { background: 'var(--surface-2)', color: 'var(--text-primary)' }}>
            {m.content}
          </div>
        ))}
        {sending && <div className="self-start rounded-2xl px-3.5 py-2.5" style={{ background: 'var(--surface-2)' }}><Loader2 size={15} className="animate-spin" style={{ color: 'var(--text-muted)' }} /></div>}
        {error && <p role="alert" className="text-sm rounded-lg px-3 py-2" style={{ background: 'var(--negative-soft)', color: 'var(--negative)' }}>{error}</p>}
      </div>

      <form onSubmit={send} className="shrink-0 px-3 pt-3 safe-bottom" style={{ borderTop: '1px solid var(--border)' }}>
        <div className="flex items-end gap-2">
          <textarea ref={inputRef} value={text} onChange={(e) => setText(e.target.value)} rows={1} maxLength={2000}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
            placeholder={t('chat.placeholder')} aria-label={t('chat.placeholder')} className="input resize-none !min-h-[44px] max-h-32" />
          <button type="submit" disabled={!text.trim() || sending} className="btn btn-primary !px-3 !min-h-[44px]" aria-label={t('chat.send')}><Send size={16} /></button>
        </div>
        {/* Aviso de privacidad: pequeño pero legible y siempre visible (RGPD). */}
        <p className="text-[11px] leading-snug py-2" style={{ color: 'var(--text-secondary)' }}>
          {t('chat.privacyNote')} · <Link to="/privacidad" className="underline">{t('chat.privacyMore')}</Link>
        </p>
      </form>
    </div>
  );
}
