'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Loader2, Pencil, X } from 'lucide-react';
import { ModalityMultiSelect } from '@/features/dossier/ui/modality-multi-select';
import type { Modality } from '@/features/dossier/modality-set';
import { modifierModaliteDossier } from './modalite-actions';

const LIBELLES: Record<Modality, string> = { presentiel: 'Présentiel', distanciel: 'Distanciel', hybride: 'Hybride' };

/** La modalité du dossier, modifiable là où elle se lit. */
export function ModaliteModifiable({ dossierId, modalites, peutModifier }: { dossierId: string; modalites: Modality[]; peutModifier: boolean }) {
  const router = useRouter();
  const [ouvert, setOuvert] = useState(false);
  const [choix, setChoix] = useState<Modality[]>(modalites);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, demarrer] = useTransition();

  const pastilles = (
    <span className="inline-flex flex-wrap items-center gap-1">
      {modalites.map((m) => (
        <span key={m} className="inline-flex items-center h-6 px-2.5 rounded-full text-[12px] font-medium bg-purple-100 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300">
          {LIBELLES[m]}
        </span>
      ))}
    </span>
  );

  if (!ouvert) {
    return (
      <span className="inline-flex items-center gap-1.5">
        {pastilles}
        {peutModifier && (
          <button
            type="button"
            onClick={() => {
              setChoix(modalites);
              setOuvert(true);
            }}
            aria-label="Modifier la modalité du dossier"
            title="Modifier la modalité"
            className="text-purple-700/60 dark:text-purple-300/60 hover:text-purple-800 dark:hover:text-purple-200 transition"
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>
        )}
      </span>
    );
  }

  const enregistrer = () => {
    setErreur(null);
    if (choix.length === 0) return setErreur('Choisissez au moins une modalité.');
    demarrer(async () => {
      const r = await modifierModaliteDossier({ dossierId, modalites: choix });
      if (r.ok) {
        setOuvert(false);
        router.refresh();
      } else setErreur(r.error);
    });
  };

  return (
    <span className="flex flex-col gap-2">
      <ModalityMultiSelect value={choix} onChange={setChoix} />
      <span className="inline-flex items-center gap-1.5">
        <button
          type="button"
          onClick={enregistrer}
          disabled={enCours}
          className="inline-flex items-center gap-1 h-7 px-2.5 rounded-md bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-[12px] font-medium disabled:opacity-50"
        >
          {enCours ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} Enregistrer
        </button>
        <button type="button" onClick={() => setOuvert(false)} className="inline-flex items-center gap-1 h-7 px-2 rounded-md text-[12px] text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200">
          <X className="w-3.5 h-3.5" /> Annuler
        </button>
      </span>
      <span className="text-[11px] text-zinc-500 dark:text-zinc-400">La première choisie est la principale. Les séances gardent la leur.</span>
      {erreur && (
        <span role="alert" className="text-[11px] font-semibold text-rose-600 dark:text-rose-400">
          {erreur}
        </span>
      )}
    </span>
  );
}
