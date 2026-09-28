'use client';

import { useRouter } from 'next/navigation';
import { useAction } from 'next-safe-action/hooks';
import { Trash2 } from 'lucide-react';
import { deleteQuestionnaireTemplate } from './actions';

/** Supprimer un questionnaire de l'organisme (les modèles livrés ne se suppriment pas). */
export function SupprimerModele({ id, titre, seances }: { id: string; titre: string; seances: number }) {
  const router = useRouter();
  const { execute, status } = useAction(deleteQuestionnaireTemplate, { onSettled: () => router.refresh() });
  return (
    <button
      type="button"
      disabled={status === 'executing'}
      onClick={() => {
        const avertissement = seances > 0 ? `\n\nIl est coché dans ${seances} séance${seances > 1 ? 's' : ''} : il n’y partira plus.` : '';
        if (confirm(`Supprimer le questionnaire « ${titre} » ?${avertissement}`)) execute({ templateId: id });
      }}
      title="Supprimer"
      aria-label={`Supprimer ${titre}`}
      className="h-8 w-8 rounded-lg grid place-items-center text-zinc-500 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40 dark:hover:text-red-400 disabled:opacity-50"
    >
      <Trash2 className="w-3.5 h-3.5" />
    </button>
  );
}
