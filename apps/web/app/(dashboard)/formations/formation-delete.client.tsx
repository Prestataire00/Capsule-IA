'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, RotateCcw, Trash2 } from 'lucide-react';
import { deleteFormation, restoreFormation } from '@/features/formations/actions';

const ERREURS: Record<string, string> = {
  unauthenticated: 'Session expirée — reconnectez-vous.',
  forbidden_not_admin: 'Votre rôle ne permet pas de supprimer une formation.',
  not_found: 'Formation introuvable.',
  db_delete_failed: 'La suppression a échoué.',
  db_restore_failed: 'La restauration a échoué.',
};

/** Ce que la suppression touche, annoncé avant de la faire. */
function confirmation(title: string, dossiers: number, sessions: number): string {
  const liens = [
    dossiers > 0 ? `${dossiers} dossier${dossiers > 1 ? 's' : ''}` : null,
    sessions > 0 ? `${sessions} session${sessions > 1 ? 's' : ''}` : null,
  ].filter(Boolean);

  return liens.length === 0
    ? `Supprimer « ${title} » ? Elle partira à la corbeille : vous pourrez la restaurer.`
    : `« ${title} » est utilisée par ${liens.join(' et ')}.\n\n` +
        'Elle part à la corbeille et quitte le catalogue : les dossiers et sessions déjà ' +
        'montés gardent leur intitulé et leur historique. Vous pourrez la restaurer.';
}

export function FormationDeleteButton({
  formationId,
  title,
  dossiers,
  sessions,
  variant = 'icon',
}: {
  formationId: string;
  title: string;
  dossiers: number;
  sessions: number;
  variant?: 'icon' | 'button';
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [erreur, setErreur] = useState<string | null>(null);

  const supprimer = () => {
    if (!window.confirm(confirmation(title, dossiers, sessions))) return;
    setErreur(null);
    start(async () => {
      const r = await deleteFormation(formationId);
      if (!r.ok) {
        setErreur(ERREURS[r.error] ?? 'La suppression a échoué.');
        return;
      }
      if (variant === 'button') router.push('/formations');
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
        aria-label={`Supprimer la formation — ${title}`}
        title="Supprimer la formation"
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

/** Corbeille : remise au catalogue, en brouillon. */
export function FormationRestoreButton({ formationId, title }: { formationId: string; title: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [erreur, setErreur] = useState<string | null>(null);

  return (
    <span className="inline-flex items-center gap-2">
      {erreur && <span role="alert" className="text-[11px] font-semibold text-rose-600 dark:text-rose-400">{erreur}</span>}
      <button
        type="button"
        disabled={pending}
        aria-label={`Restaurer la formation — ${title}`}
        onClick={() => {
          setErreur(null);
          start(async () => {
            const r = await restoreFormation(formationId);
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
