'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff, Trash2, Loader2 } from 'lucide-react';
import { publierTravail, supprimerTravailFormateur } from './actions';

/** Publier, retirer, supprimer — les trois gestes sur un travail déjà créé. */
export function TravailActions({
  dossierId,
  travailId,
  titre,
  publie,
  rendus,
}: {
  dossierId: string;
  travailId: string;
  titre: string;
  publie: boolean;
  rendus: number;
}) {
  const router = useRouter();
  const [erreur, setErreur] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const agir = (action: () => Promise<{ ok: true } | { ok: false; error: string }>) => {
    setErreur(null);
    startTransition(async () => {
      const res = await action();
      if (!res.ok) return setErreur(res.error);
      router.refresh();
    });
  };

  return (
    <div className="flex items-center gap-1.5 flex-shrink-0">
      {erreur && <span className="text-[11px] text-red-600 dark:text-red-400 max-w-56 text-right">{erreur}</span>}
      <button
        type="button"
        onClick={() => agir(() => publierTravail({ dossierId, travailId, publier: !publie }))}
        disabled={pending}
        title={publie ? 'Retirer aux stagiaires' : 'Publier aux stagiaires'}
        className="h-8 px-2.5 rounded-md text-[12px] font-medium inline-flex items-center gap-1.5 border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition disabled:opacity-50"
      >
        {pending ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : publie ? (
          <EyeOff className="w-3.5 h-3.5" />
        ) : (
          <Eye className="w-3.5 h-3.5" />
        )}
        {publie ? 'Retirer' : 'Publier'}
      </button>
      <button
        type="button"
        onClick={() => {
          const avertissement =
            rendus > 0
              ? `« ${titre} » a déjà ${rendus} rendu${rendus > 1 ? 's' : ''}. Le supprimer les rendra inaccessibles. Continuer ?`
              : `Supprimer « ${titre} » ?`;
          if (!window.confirm(avertissement)) return;
          agir(() => supprimerTravailFormateur({ dossierId, travailId }));
        }}
        disabled={pending}
        title="Supprimer"
        aria-label={`Supprimer ${titre}`}
        className="w-8 h-8 rounded-md grid place-items-center text-zinc-500 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40 transition disabled:opacity-50"
      >
        <Trash2 className="w-4 h-4" />
      </button>
    </div>
  );
}
