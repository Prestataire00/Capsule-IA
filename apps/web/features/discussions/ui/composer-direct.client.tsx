'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Send } from 'lucide-react';
import { messageDirectSchema } from '../discussion.schema';

/** Écrire dans une conversation directe : tous les participants sont prévenus. */
export function ComposerDirect({
  conversationId,
  envoyer,
}: {
  conversationId: string;
  envoyer: (input: { conversationId: string; body: string }) => Promise<{ ok: true } | { ok: false; error: string }>;
}) {
  const router = useRouter();
  const [body, setBody] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const soumettre = () =>
    start(async () => {
      setErreur(null);
      const p = messageDirectSchema.safeParse({ conversationId, body });
      if (!p.success) return setErreur(p.error.issues[0]?.message ?? 'Message invalide.');
      const r = await envoyer(p.data);
      if (!r.ok) return setErreur(r.error);
      setBody('');
      router.refresh();
    });

  return (
    <div className="space-y-2">
      <label htmlFor={`direct-${conversationId}`} className="sr-only">
        Message
      </label>
      <textarea
        id={`direct-${conversationId}`}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) soumettre();
        }}
        rows={3}
        maxLength={4000}
        placeholder="Écrire un message"
        className="w-full rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3.5 py-2.5 text-[14px] resize-y focus:outline-none focus:ring-2 focus:ring-orange-500/30"
      />
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[12px] text-zinc-500 dark:text-zinc-400">
          Ctrl + Entrée pour envoyer. Chaque participant est prévenu.
          {erreur && <span className="text-red-600 dark:text-red-400"> · {erreur}</span>}
        </span>
        <button
          type="button"
          onClick={soumettre}
          disabled={pending || body.trim() === ''}
          className="ml-auto h-9 px-4 rounded-lg bg-orange-500 hover:bg-orange-600 text-white text-[13px] font-medium inline-flex items-center gap-1.5 shadow-sm disabled:opacity-50"
        >
          {pending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />} Envoyer
        </button>
      </div>
    </div>
  );
}
