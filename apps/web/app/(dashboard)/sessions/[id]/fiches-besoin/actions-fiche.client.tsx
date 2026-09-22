'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Pencil, Send } from 'lucide-react';
import { FormulaireFicheBesoin } from '@/features/questionnaire/ui/formulaire-fiche-besoin.client';
import type { ReponsesFicheBesoin } from '@/features/questionnaire/fiche-besoin';
import { renvoyerFicheBesoin, saisirFicheBesoinApprenant } from './actions';

/**
 * Les deux gestes possibles sur la fiche d'un stagiaire : la lui renvoyer, ou
 * la remplir pour lui — typiquement au téléphone, au moment où le besoin se
 * dit. L'écran ne savait qu'afficher les réponses reçues.
 */
export function ActionsFiche({
  learnerId,
  dossierId,
  sessionId,
  reponses,
  dejaRepondu,
}: {
  learnerId: string;
  dossierId: string;
  sessionId: string;
  reponses: ReponsesFicheBesoin | null;
  dejaRepondu: boolean;
}) {
  const router = useRouter();
  const [saisie, setSaisie] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, demarrer] = useTransition();

  const renvoyer = () => {
    setMessage(null);
    setErreur(null);
    demarrer(async () => {
      const r = await renvoyerFicheBesoin(learnerId, sessionId);
      if (r.ok) {
        setMessage(r.message);
        router.refresh();
      } else setErreur(r.error);
    });
  };

  if (saisie) {
    return (
      <div className="mt-3 rounded-xl border border-zinc-200/80 dark:border-zinc-800 bg-zinc-50/70 dark:bg-zinc-950/30 p-4">
        <FormulaireFicheBesoin
          valeurs={reponses}
          enregistrer={async (v) => {
            const r = await saisirFicheBesoinApprenant(learnerId, dossierId, sessionId, v);
            if (r.ok) router.refresh();
            return r.ok ? { ok: true as const } : { ok: false as const, error: r.error };
          }}
          libelleBouton="Enregistrer la fiche besoin"
          messageSucces="Fiche besoin enregistrée."
        />
        <button
          type="button"
          onClick={() => setSaisie(false)}
          className="mt-3 text-[12px] text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
        >
          Fermer
        </button>
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={renvoyer}
          disabled={envoi}
          className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg border border-zinc-200 dark:border-zinc-700 text-[12px] font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 disabled:opacity-50"
        >
          {envoi ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
          {dejaRepondu ? 'Renvoyer' : 'Envoyer'}
        </button>
        <button
          type="button"
          onClick={() => setSaisie(true)}
          className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg border border-zinc-200 dark:border-zinc-700 text-[12px] font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800"
        >
          <Pencil className="w-3.5 h-3.5" /> {dejaRepondu ? 'Modifier' : 'Remplir'}
        </button>
      </div>
      {message && <p className="text-[12px] text-emerald-700 dark:text-emerald-400 mt-1.5">{message}</p>}
      {erreur && <p className="text-[12px] text-red-600 dark:text-red-400 mt-1.5">{erreur}</p>}
    </div>
  );
}
