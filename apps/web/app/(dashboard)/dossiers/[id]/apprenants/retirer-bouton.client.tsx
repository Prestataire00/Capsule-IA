'use client';

import { useTransition, useState } from 'react';
import { useRouter } from 'next/navigation';
import { UserMinus, Loader2 } from 'lucide-react';
import { retirerApprenant } from './actions';

/** Retire l'apprenant des séances du dossier. Sa fiche CRM, elle, reste. */
export function RetirerBouton({ dossierId, learnerId, nom }: { dossierId: string; learnerId: string; nom: string }) {
  const router = useRouter();
  const [erreur, setErreur] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <span className="inline-flex items-center gap-2">
      {erreur && <span className="text-[11px] text-red-600 dark:text-red-400">{erreur}</span>}
      <button
        type="button"
        onClick={() => {
          if (!window.confirm(`Retirer ${nom} de cette formation ? Sa fiche reste dans vos apprenants.`)) return;
          setErreur(null);
          startTransition(async () => {
            const res = await retirerApprenant({ dossierId, learnerId });
            if (!res.ok) return setErreur(res.error);
            router.refresh();
          });
        }}
        disabled={pending}
        title="Retirer de la formation"
        aria-label={`Retirer ${nom} de la formation`}
        className="w-8 h-8 rounded-md grid place-items-center text-zinc-500 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40 transition disabled:opacity-50"
      >
        {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserMinus className="w-4 h-4" />}
      </button>
    </span>
  );
}
