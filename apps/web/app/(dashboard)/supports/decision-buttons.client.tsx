'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Check, X, Loader2 } from 'lucide-react';
import { decideSupportValidation } from './actions';

/**
 * Valider ou refuser. Le refus ouvre d'abord la saisie du motif : un formateur
 * qui reçoit « refusé » sans explication redéposera la même chose.
 */
export function DecisionButtons({ resourceId }: { resourceId: string }) {
  const router = useRouter();
  const [refusEnCours, setRefusEnCours] = useState(false);
  const [motif, setMotif] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const decider = (decision: 'valide' | 'refuse', reason?: string) => {
    setErreur(null);
    startTransition(async () => {
      const res = await decideSupportValidation({ resourceId, decision, reason });
      if (!res.ok) {
        setErreur(res.error);
        return;
      }
      setRefusEnCours(false);
      setMotif('');
      router.refresh();
    });
  };

  if (refusEnCours) {
    return (
      <div className="w-full space-y-2">
        <textarea
          value={motif}
          onChange={(e) => setMotif(e.target.value)}
          rows={2}
          maxLength={1000}
          autoFocus
          placeholder="Motif du refus (ex. diaporama d’un autre organisme, programme non conforme…)"
          className="w-full resize-y rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-[13px] text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400"
        />
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => decider('refuse', motif.trim())}
            disabled={pending || motif.trim().length === 0}
            className="h-8 px-3 rounded-md text-[12px] font-medium inline-flex items-center gap-1.5 bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
          >
            {pending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <X className="w-3.5 h-3.5" />}
            Confirmer le refus
          </button>
          <button
            type="button"
            onClick={() => {
              setRefusEnCours(false);
              setErreur(null);
            }}
            className="h-8 px-3 rounded-md text-[12px] text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            Annuler
          </button>
        </div>
        {erreur && <p className="text-[12px] text-red-600 dark:text-red-400">{erreur}</p>}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 flex-shrink-0">
      <button
        type="button"
        onClick={() => decider('valide')}
        disabled={pending}
        className="h-8 px-3 rounded-md text-[12px] font-medium inline-flex items-center gap-1.5 bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
      >
        {pending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
        Valider
      </button>
      <button
        type="button"
        onClick={() => setRefusEnCours(true)}
        disabled={pending}
        className="h-8 px-3 rounded-md text-[12px] font-medium inline-flex items-center gap-1.5 border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-950/40 disabled:opacity-50"
      >
        <X className="w-3.5 h-3.5" /> Refuser
      </button>
      {erreur && <p className="text-[12px] text-red-600 dark:text-red-400">{erreur}</p>}
    </div>
  );
}
