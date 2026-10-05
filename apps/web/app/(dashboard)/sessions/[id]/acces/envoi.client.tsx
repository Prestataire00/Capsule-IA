'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Mail } from 'lucide-react';
import { envoyerLiensEntrepriseSeance } from './actions';

/** Envoyer à chaque référent de la séance le lien de son espace entreprise. */
export function EnvoiReferents({ sessionId, dossierIds, libelle }: { sessionId: string; dossierIds: string[]; libelle: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; texte: string } | null>(null);
  return (
    <span className="inline-flex items-center gap-3 flex-wrap">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            setMessage(null);
            const r = await envoyerLiensEntrepriseSeance({ sessionId, dossierIds });
            setMessage(r.ok ? { ok: true, texte: r.message } : { ok: false, texte: r.error });
            router.refresh();
          })
        }
        className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-lg border border-zinc-200 dark:border-zinc-700 text-[13px] font-medium text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-800 disabled:opacity-50"
      >
        {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />} {libelle}
      </button>
      {message && (
        <span className={`text-[12px] ${message.ok ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
          {message.texte}
        </span>
      )}
    </span>
  );
}
