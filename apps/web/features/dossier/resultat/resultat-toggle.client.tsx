'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Check, X } from 'lucide-react';
import type { Resultat } from './resultat';
import { enregistrerResultat } from './resultat-actions';

/** Réussite / Échec, coché sur l'apprenant ; un second clic retire le choix. */
export function ResultatToggle({
  dossierId,
  learnerId,
  sessionId,
  initial,
  modifiable,
}: {
  dossierId: string;
  learnerId: string;
  sessionId?: string;
  initial: Resultat | null;
  modifiable: boolean;
}) {
  const router = useRouter();
  const [valeur, setValeur] = useState<Resultat | null>(initial);
  const [erreur, setErreur] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const choisir = (r: Resultat) => {
    const suivant = valeur === r ? null : r;
    const avant = valeur;
    setValeur(suivant);
    setErreur(null);
    start(async () => {
      const res = await enregistrerResultat({ dossierId, learnerId, resultat: suivant, sessionId });
      if (!res.ok) {
        setValeur(avant);
        setErreur(res.error);
      } else router.refresh();
    });
  };

  const bouton = (r: Resultat) => {
    const actif = valeur === r;
    const ton =
      r === 'reussite'
        ? actif
          ? 'bg-emerald-600 text-white border-emerald-600'
          : 'text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/30'
        : actif
          ? 'bg-red-600 text-white border-red-600'
          : 'text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30';
    return (
      <button
        type="button"
        role="radio"
        aria-checked={actif}
        disabled={!modifiable || pending}
        onClick={() => choisir(r)}
        className={`inline-flex items-center gap-1 h-6 px-2 text-[11px] font-medium border-l first:border-l-0 border-zinc-200 dark:border-zinc-700 transition disabled:cursor-default ${ton}`}
      >
        {r === 'reussite' ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}
        {r === 'reussite' ? 'Réussite' : 'Échec'}
      </button>
    );
  };

  return (
    <span className="inline-flex flex-col items-end gap-0.5">
      <span role="radiogroup" aria-label="Résultat de la formation" className="inline-flex rounded-md border border-zinc-200 dark:border-zinc-700 overflow-hidden bg-white dark:bg-zinc-900">
        {bouton('reussite')}
        {bouton('echec')}
      </span>
      {erreur && <span className="text-[11px] text-red-600 dark:text-red-400">{erreur}</span>}
    </span>
  );
}
