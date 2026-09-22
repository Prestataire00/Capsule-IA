'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { UserRound, AlertTriangle } from 'lucide-react';
import { definirTitulaireStagiaire } from './actions';

/**
 * Le titulaire du dossier suit-il lui-même la formation ?
 *
 * Il en est toujours le référent — destinataire de la convention, des devis et
 * des factures. La case ne dit que s'il faut aussi le compter parmi les
 * stagiaires : sur les émargements, dans les effectifs et au BPF.
 */
export function TitulaireStagiaire({
  dossierId,
  nom,
  suitLaFormation,
  peutModifier,
}: {
  dossierId: string;
  nom: string;
  suitLaFormation: boolean;
  peutModifier: boolean;
}) {
  const router = useRouter();
  const [enCours, demarrer] = useTransition();
  const [erreur, setErreur] = useState<string | null>(null);

  const basculer = (valeur: boolean) => {
    setErreur(null);
    demarrer(async () => {
      const r = await definirTitulaireStagiaire({ dossierId, suitLaFormation: valeur });
      if (!r.ok) setErreur(r.error);
      else router.refresh();
    });
  };

  return (
    <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-4 py-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <span className="flex items-start gap-2.5 min-w-0">
          <span className="w-8 h-8 rounded-lg grid place-items-center shrink-0 bg-purple-100 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300">
            <UserRound className="w-4 h-4" />
          </span>
          <span className="min-w-0">
            <span className="block text-[13px] font-semibold text-zinc-900 dark:text-zinc-100">{nom}</span>
            <span className="block text-[12px] text-zinc-500 dark:text-zinc-400">
              Titulaire et référent du dossier — destinataire de la convention, des devis et des factures.
            </span>
          </span>
        </span>

        <label className="inline-flex items-center gap-2 text-[12px] text-zinc-700 dark:text-zinc-200 shrink-0">
          <input
            type="checkbox"
            checked={suitLaFormation}
            disabled={!peutModifier || enCours}
            onChange={(e) => basculer(e.target.checked)}
            className="w-4 h-4 accent-orange-500 disabled:opacity-50"
          />
          Suit aussi la formation
        </label>
      </div>

      {!suitLaFormation && (
        <p className="text-[11px] text-zinc-400 mt-2">
          Il n&apos;est pas compté parmi les stagiaires : ni sur les émargements, ni dans les effectifs, ni au BPF.
        </p>
      )}
      {erreur && (
        <p className="text-[12px] text-red-600 dark:text-red-400 mt-2 inline-flex items-start gap-1.5">
          <AlertTriangle className="w-3.5 h-3.5 mt-px shrink-0" />
          {erreur}
        </p>
      )}
    </div>
  );
}
