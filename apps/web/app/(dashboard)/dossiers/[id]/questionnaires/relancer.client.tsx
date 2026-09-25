'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Send } from 'lucide-react';
import { relancerQuestionnaire } from './actions';

/**
 * Relancer un questionnaire resté sans réponse.
 *
 * Il fallait retrouver le bloc d'envoi correspondant en haut de page, y
 * resélectionner le bon destinataire, et deviner que le geste était idempotent.
 * La relance se fait ici, sur la ligne de celui qui n'a pas répondu — c'est là
 * qu'on s'en aperçoit.
 *
 * L'e-mail repart de lui-même et se présente comme un rappel : un second
 * message identique au premier laisse croire à un envoi en double, et se classe
 * en indésirable aussi vite.
 */
export function Relancer({ assignmentId, dossierId }: { assignmentId: string; dossierId: string }) {
  const router = useRouter();
  const [enCours, demarrer] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  return (
    <span className="inline-flex flex-col items-end gap-0.5">
      <button
        type="button"
        disabled={enCours}
        onClick={() => {
          setMessage(null);
          demarrer(async () => {
            const r = await relancerQuestionnaire({ assignmentId, dossierId });
            setMessage(r.ok ? r.message : r.error);
            if (r.ok) router.refresh();
          });
        }}
        className="h-8 px-2.5 rounded-lg border border-zinc-200 dark:border-zinc-700 text-[12px] font-semibold text-zinc-700 dark:text-zinc-300 inline-flex items-center gap-1.5 hover:bg-zinc-50 dark:hover:bg-zinc-800 disabled:opacity-50"
      >
        {enCours ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
        Relancer
      </button>
      {message && (
        <span className="text-[11px] text-zinc-500 dark:text-zinc-400 text-right max-w-[260px]">{message}</span>
      )}
    </span>
  );
}
