// ARCHETYPE: shared (assistant IA contextuel)
'use client';

import { useEffect, useRef, useState } from 'react';
import { useAction } from 'next-safe-action/hooks';
import { Sparkles, X, Send, ArrowRight, Bot, User as UserIcon } from 'lucide-react';
import { initialSuggestions } from './mock-responses';
import { askAssistant } from './actions';
import { cn } from '@/shared/lib/cn';

type Msg = { role: 'user' | 'assistant'; content: string; suggestions?: string[] };

export function AiAssistant() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Msg[]>([
    {
      role: 'assistant',
      content:
        "Bonjour Ismaël 👋 Je suis votre assistant. Je connais vos dossiers, votre Qualiopi et votre activité. Que puis-je vous aider à faire aujourd'hui ?",
      suggestions: initialSuggestions,
    },
  ]);
  const [typing, setTyping] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Scroll auto vers le bas quand un nouveau message arrive
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, typing]);

  // Focus input à l'ouverture
  useEffect(() => {
    if (open) {
      const t = setTimeout(() => inputRef.current?.focus(), 200);
      return () => clearTimeout(t);
    }
  }, [open]);

  // Cmd+J pour ouvrir/fermer
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'j') {
        e.preventDefault();
        setOpen((v) => !v);
      }
      if (e.key === 'Escape' && open) setOpen(false);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open]);

  const { executeAsync } = useAction(askAssistant);

  const send = async (text?: string) => {
    const content = (text ?? input).trim();
    if (!content || typing) return;
    setInput('');
    const nextMessages: Msg[] = [...messages, { role: 'user', content }];
    setMessages(nextMessages);
    setTyping(true);

    // Historique envoyé à l'API : commence obligatoirement par un tour "user".
    const payload = nextMessages.map((m) => ({ role: m.role, content: m.content }));
    while (payload.length && payload[0]!.role === 'assistant') payload.shift();

    try {
      const res = await executeAsync({ messages: payload });
      const out = res?.data;
      if (out?.ok) {
        setMessages((m) => [...m, { role: 'assistant', content: out.reply }]);
      } else {
        setMessages((m) => [
          ...m,
          {
            role: 'assistant',
            content:
              out?.error === 'ai_unavailable'
                ? "L'assistant n'est pas configuré (clé API IA manquante). Contactez votre administrateur."
                : "Désolé, je n'ai pas pu répondre pour le moment. Réessayez dans un instant.",
          },
        ]);
      }
    } finally {
      setTyping(false);
    }
  };

  return (
    <>
      {/* Bouton flottant */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Ouvrir l'assistant IA"
        className={cn(
          'fixed bottom-6 right-6 z-30 group',
          'bg-violet-600 hover:bg-violet-700 text-white',
          'rounded-full shadow-lg shadow-violet-600/30 hover:shadow-xl hover:shadow-violet-600/40',
          'h-14 px-5 flex items-center gap-2.5 transition-all hover:scale-105',
          open && 'opacity-0 pointer-events-none',
        )}
      >
        <Sparkles className="w-4 h-4" />
        <span className="text-[13px] font-medium">Assistant IA</span>
        <kbd className="hidden md:inline-flex items-center font-mono text-[10px] bg-violet-700 dark:bg-violet-800 px-1.5 py-0.5 rounded ml-1">
          ⌘J
        </kbd>
      </button>

      {/* Backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-zinc-900/20 dark:bg-zinc-950/60 backdrop-blur-[2px] animate-in fade-in duration-200"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Panel slide-in droite */}
      <aside
        className={cn(
          'fixed top-0 right-0 bottom-0 z-50 w-[420px] max-w-full',
          'bg-white dark:bg-zinc-950 border-l border-zinc-200/60 dark:border-zinc-800',
          'shadow-2xl flex flex-col',
          'transition-transform duration-300 ease-out',
          open ? 'translate-x-0' : 'translate-x-full',
        )}
        aria-hidden={!open}
      >
        {/* Header */}
        <header className="flex items-center justify-between px-5 py-4 border-b border-zinc-200/60 dark:border-zinc-800">
          <div className="flex items-center gap-2.5">
            <span className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500 to-rose-500 text-white flex items-center justify-center shadow-sm">
              <Sparkles className="w-4 h-4" />
            </span>
            <div>
              <p className="text-[14px] font-semibold text-zinc-900 dark:text-zinc-100 leading-tight">
                Assistant IA
              </p>
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400 inline-flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                en ligne · prêt à aider
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Fermer l'assistant"
            className="w-8 h-8 rounded-lg flex items-center justify-center text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-900 hover:text-zinc-900 dark:hover:text-zinc-100 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </header>

        {/* Messages */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-5 space-y-5 scrollbar-thin">
          {messages.map((m, i) => (
            <Message key={i} message={m} onSuggestion={send} />
          ))}
          {typing && <TypingDots />}
        </div>

        {/* Input */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
          className="border-t border-zinc-200/60 dark:border-zinc-800 px-3 py-3"
        >
          <div className="flex items-center gap-2 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-xl px-3 py-2 focus-within:border-violet-300 dark:focus-within:border-violet-800 transition">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Posez une question…"
              className="flex-1 bg-transparent text-[13px] focus:outline-none placeholder:text-zinc-400"
              disabled={typing}
            />
            <button
              type="submit"
              disabled={!input.trim() || typing}
              aria-label="Envoyer"
              className={cn(
                'w-8 h-8 rounded-lg flex items-center justify-center transition shadow-sm',
                input.trim() && !typing
                  ? 'bg-violet-600 hover:bg-violet-700 text-white'
                  : 'bg-zinc-200 dark:bg-zinc-800 text-zinc-400 dark:text-zinc-600',
              )}
            >
              <Send className="w-3.5 h-3.5" />
            </button>
          </div>
          <p className="text-[10px] text-zinc-400 dark:text-zinc-500 mt-1.5 px-1">
            Propulsé par Claude · réponses basées sur vos données réelles
          </p>
        </form>
      </aside>
    </>
  );
}

function Message({ message, onSuggestion }: { message: Msg; onSuggestion: (s: string) => void }) {
  const isUser = message.role === 'user';
  return (
    <div className={cn('flex gap-2.5 animate-in fade-in slide-in-from-bottom-2 duration-300', isUser && 'flex-row-reverse')}>
      <span
        className={cn(
          'w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0',
          isUser
            ? 'bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300'
            : 'bg-gradient-to-br from-violet-500 to-rose-500 text-white shadow-sm',
        )}
      >
        {isUser ? <UserIcon className="w-3.5 h-3.5" /> : <Bot className="w-3.5 h-3.5" />}
      </span>
      <div className={cn('flex flex-col gap-2 min-w-0', isUser ? 'items-end' : 'items-start')}>
        <div
          className={cn(
            'rounded-2xl px-4 py-2.5 text-[13px] leading-relaxed max-w-[320px]',
            isUser
              ? 'bg-violet-600 text-white rounded-tr-sm'
              : 'bg-zinc-100 dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 rounded-tl-sm',
          )}
        >
          <FormattedContent text={message.content} />
        </div>
        {message.suggestions && message.suggestions.length > 0 && (
          <ul className="space-y-1.5 mt-1">
            {message.suggestions.map((s) => (
              <li key={s}>
                <button
                  type="button"
                  onClick={() => onSuggestion(s)}
                  className="group text-left text-[12px] bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 hover:border-violet-300 dark:hover:border-violet-800 hover:bg-violet-50/40 dark:hover:bg-violet-950/20 rounded-lg px-3 py-1.5 transition flex items-center gap-2 max-w-[320px]"
                >
                  <Sparkles className="w-3 h-3 text-violet-500 flex-shrink-0" />
                  <span className="text-zinc-700 dark:text-zinc-300 truncate">{s}</span>
                  <ArrowRight className="w-3 h-3 text-zinc-300 dark:text-zinc-600 group-hover:text-violet-500 group-hover:translate-x-0.5 transition flex-shrink-0 ml-auto" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function FormattedContent({ text }: { text: string }) {
  // Support minimal markdown : ** pour gras, • pour liste, retours à la ligne
  const lines = text.split('\n');
  return (
    <div className="space-y-1">
      {lines.map((line, i) => {
        if (!line.trim()) return <div key={i} className="h-2" />;
        const isBullet = line.trim().startsWith('•') || line.trim().startsWith('•');
        // Replace **text** with <strong>
        const parts = line.split(/(\*\*[^*]+\*\*)/g);
        return (
          <div key={i} className={cn(isBullet && 'pl-1')}>
            {parts.map((p, j) => {
              if (p.startsWith('**') && p.endsWith('**')) {
                return (
                  <strong key={j} className="font-semibold">
                    {p.slice(2, -2)}
                  </strong>
                );
              }
              return <span key={j}>{p}</span>;
            })}
          </div>
        );
      })}
    </div>
  );
}

function TypingDots() {
  return (
    <div className="flex gap-2.5 animate-in fade-in duration-200">
      <span className="w-7 h-7 rounded-full bg-gradient-to-br from-violet-500 to-rose-500 text-white flex items-center justify-center flex-shrink-0 shadow-sm">
        <Bot className="w-3.5 h-3.5" />
      </span>
      <div className="bg-zinc-100 dark:bg-zinc-900 rounded-2xl rounded-tl-sm px-4 py-3 inline-flex items-center gap-1">
        <span className="w-1.5 h-1.5 rounded-full bg-zinc-400 animate-bounce" style={{ animationDelay: '0ms' }} />
        <span className="w-1.5 h-1.5 rounded-full bg-zinc-400 animate-bounce" style={{ animationDelay: '150ms' }} />
        <span className="w-1.5 h-1.5 rounded-full bg-zinc-400 animate-bounce" style={{ animationDelay: '300ms' }} />
      </div>
    </div>
  );
}
