'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Loader2, Pencil, X } from 'lucide-react';
import { modifierHeuresDossier } from './heures-actions';

const fmt = (h: number) => `${h.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} h`;

/**
 * Les heures du dossier, corrigées là où elles se lisent. Quand les séances
 * planifiées en totalisent un autre nombre, l'écart se signale et se reprend
 * en un clic : c'est le cas d'un dossier né à 1 h faute de module.
 */
export function HeuresModifiables({
  dossierId,
  heures,
  heuresSeances,
}: {
  dossierId: string;
  heures: number;
  /** Somme des séances planifiées, 0 s'il n'y en a pas encore. */
  heuresSeances: number;
}) {
  const router = useRouter();
  const [ouvert, setOuvert] = useState(false);
  const [valeur, setValeur] = useState(String(heures).replace('.', ','));
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, demarrer] = useTransition();

  const enregistrer = (saisie: string) => {
    setErreur(null);
    demarrer(async () => {
      const r = await modifierHeuresDossier({ dossierId, heures: saisie });
      if (r.ok) {
        setOuvert(false);
        router.refresh();
      } else setErreur(r.error);
    });
  };

  const ecart = heuresSeances > 0 && Math.abs(heuresSeances - heures) > 0.01;

  if (!ouvert) {
    return (
      <span className="inline-flex flex-col gap-1">
        <span className="inline-flex items-center gap-1.5">
          <span className="tabular-nums">{fmt(heures)}</span>
          <button
            type="button"
            onClick={() => setOuvert(true)}
            title="Modifier les heures"
            aria-label="Modifier les heures du dossier"
            className="text-sky-700/60 dark:text-sky-300/60 hover:text-sky-800 dark:hover:text-sky-200 transition"
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>
        </span>
        {ecart && (
          <button
            type="button"
            onClick={() => enregistrer(String(heuresSeances))}
            disabled={enCours}
            className="self-start text-left text-[11px] font-medium text-amber-700 dark:text-amber-300 hover:underline disabled:opacity-50"
          >
            {enCours ? 'Enregistrement…' : `Les séances font ${fmt(heuresSeances)} — reprendre ce total`}
          </button>
        )}
        {erreur && (
          <span role="alert" className="text-[11px] font-semibold text-rose-600 dark:text-rose-400">
            {erreur}
          </span>
        )}
      </span>
    );
  }

  return (
    <span className="inline-flex flex-col gap-1">
      <span className="inline-flex items-center gap-1.5">
        <input
          value={valeur}
          onChange={(e) => setValeur(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              enregistrer(valeur);
            }
            if (e.key === 'Escape') setOuvert(false);
          }}
          inputMode="decimal"
          placeholder="18"
          aria-label="Heures du dossier"
          autoFocus
          className="w-20 h-8 px-2 rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-[15px] font-bold text-zinc-900 dark:text-zinc-100 tabular-nums focus:outline-none focus:ring-2 focus:ring-sky-500/30"
        />
        <button
          type="button"
          onClick={() => enregistrer(valeur)}
          disabled={enCours}
          title="Enregistrer"
          className="w-7 h-7 rounded-md grid place-items-center bg-sky-600 hover:bg-sky-700 text-white disabled:opacity-50"
        >
          {enCours ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
        </button>
        <button
          type="button"
          onClick={() => setOuvert(false)}
          disabled={enCours}
          title="Annuler"
          className="w-7 h-7 rounded-md grid place-items-center text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-50"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </span>
      <span className="text-[11px] font-normal text-zinc-500 dark:text-zinc-400">
        Heures par stagiaire, reprises sur la convention et les attestations.
      </span>
      {erreur && (
        <span role="alert" className="text-[11px] font-semibold text-rose-600 dark:text-rose-400">
          {erreur}
        </span>
      )}
    </span>
  );
}
