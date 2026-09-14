// ARCHETYPE: shared (bouton « Supprimer » d'une ligne ou d'une fiche)
'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, RotateCcw, Trash2 } from 'lucide-react';
import { supprimerEntite, restaurerEntite } from '@/features/corbeille/actions';

const ERREURS: Record<string, string> = {
  unauthenticated: 'Session expirée — reconnectez-vous.',
  forbidden: 'Votre rôle ne permet pas cette suppression.',
  not_found: 'Introuvable.',
  entite_inconnue: 'Type d’élément inconnu.',
  suppression_impossible: 'La suppression a échoué.',
  restauration_impossible: 'La restauration a échoué.',
};

/**
 * Suppression réversible : l'élément part à la corbeille (`/corbeille`), d'où il
 * peut revenir. `liens` annonce ce qui y est rattaché avant de confirmer.
 */
export function DeleteEntityButton({
  entite,
  id,
  nom,
  article,
  liens,
  variant = 'icon',
  redirigerVers,
}: {
  entite: string;
  id: string;
  nom: string;
  /** « Supprimer cette demande ? » */
  article: string;
  liens?: string | null;
  variant?: 'icon' | 'button';
  redirigerVers?: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [erreur, setErreur] = useState<string | null>(null);

  const supprimer = () => {
    const message =
      `Supprimer ${article} « ${nom} » ?\n\n` +
      (liens ? `${liens}\n\n` : '') +
      'Rien n’est effacé : l’élément part à la corbeille et vous pourrez le restaurer.';
    if (!window.confirm(message)) return;
    setErreur(null);
    start(async () => {
      const r = await supprimerEntite(entite, id);
      if (!r.ok) {
        setErreur(ERREURS[r.error] ?? 'La suppression a échoué.');
        return;
      }
      if (redirigerVers) router.push(redirigerVers);
      router.refresh();
    });
  };

  if (variant === 'button') {
    return (
      <span className="inline-flex flex-col items-end gap-1">
        <button
          type="button"
          onClick={supprimer}
          disabled={pending}
          className="text-[13px] font-semibold px-3 h-9 rounded-lg border border-rose-200/80 dark:border-rose-900/60 bg-white/70 dark:bg-zinc-900/60 text-rose-700 dark:text-rose-300 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition inline-flex items-center gap-1.5 disabled:opacity-50"
        >
          {pending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />} Supprimer
        </button>
        {erreur && <span role="alert" className="text-[12px] font-semibold text-rose-600 dark:text-rose-400">{erreur}</span>}
      </span>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={supprimer}
        disabled={pending}
        aria-label={`Supprimer — ${nom}`}
        title="Supprimer"
        className="w-8 h-8 rounded-md grid place-items-center text-zinc-500 dark:text-zinc-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/40 dark:hover:text-rose-300 transition disabled:opacity-50"
      >
        {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
      </button>
      {erreur && (
        <span role="alert" className="text-[11px] font-semibold text-rose-600 dark:text-rose-400">
          {erreur}
        </span>
      )}
    </>
  );
}

/** Corbeille : remet l'élément en service. */
export function RestoreEntityButton({ entite, id, nom }: { entite: string; id: string; nom: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [erreur, setErreur] = useState<string | null>(null);

  return (
    <span className="inline-flex items-center gap-2">
      {erreur && <span role="alert" className="text-[11px] font-semibold text-rose-600 dark:text-rose-400">{erreur}</span>}
      <button
        type="button"
        disabled={pending}
        aria-label={`Restaurer — ${nom}`}
        onClick={() => {
          setErreur(null);
          start(async () => {
            const r = await restaurerEntite(entite, id);
            if (!r.ok) {
              setErreur(ERREURS[r.error] ?? 'La restauration a échoué.');
              return;
            }
            router.refresh();
          });
        }}
        className="text-[12px] font-semibold px-2.5 h-8 rounded-md border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:border-emerald-300 dark:hover:border-emerald-800 hover:text-emerald-700 dark:hover:text-emerald-300 transition inline-flex items-center gap-1.5 disabled:opacity-50"
      >
        {pending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />} Restaurer
      </button>
    </span>
  );
}
