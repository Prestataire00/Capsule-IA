'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Send } from 'lucide-react';
import { MESSAGE_MAX_LENGTH } from '@/features/trainer-space/session-messages';

/**
 * Zone d'écriture du fil. L'envoi est fourni par l'appelant : le formateur,
 * l'organisme et l'apprenant n'empruntent pas la même porte (garde de séance,
 * rôle, jeton), mais écrivent dans la même conversation.
 */
export function MessageComposer({
  envoyer,
  placeholder = 'Écrire un message…',
}: {
  envoyer: (body: string) => Promise<{ ok: true } | { ok: false; error: string }>;
  placeholder?: string;
}) {
  const router = useRouter();
  const [body, setBody] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const soumettre = () => {
    const texte = body.trim();
    if (texte.length === 0) return;
    setErreur(null);
    startTransition(async () => {
      const res = await envoyer(texte);
      if (!res.ok) {
        setErreur(res.error);
        return;
      }
      setBody('');
      router.refresh();
    });
  };

  return (
    <div className="rounded-xl border border-zinc-200/70 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-3 space-y-2">
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={(e) => {
          // Entrée envoie, Maj+Entrée va à la ligne : réflexe de messagerie.
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            soumettre();
          }
        }}
        rows={3}
        maxLength={MESSAGE_MAX_LENGTH}
        placeholder={placeholder}
        className="w-full resize-y rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-[13px] leading-relaxed text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400"
      />
      <div className="flex items-center justify-between gap-3">
        <p className="text-[11px] text-zinc-400">Entrée pour envoyer · Maj+Entrée pour aller à la ligne</p>
        <button
          type="button"
          onClick={soumettre}
          disabled={pending || body.trim().length === 0}
          className="h-9 px-4 rounded-lg bg-orange-500 hover:bg-orange-600 text-white text-[13px] font-medium inline-flex items-center gap-1.5 disabled:opacity-50"
        >
          {pending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
          Envoyer
        </button>
      </div>
      {erreur && <p className="text-[12px] text-red-600 dark:text-red-400">{erreur}</p>}
    </div>
  );
}
