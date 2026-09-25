'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Loader2, Pencil, X } from 'lucide-react';
import { modifierMontantDossier } from './montant-actions';

/**
 * Le montant du dossier, corrigé sur place.
 *
 * Il se posait à la création et ne bougeait plus. Une remise négociée, un
 * stagiaire de plus, un devis revu : il fallait reprendre le dossier par la
 * base. Or c'est ce montant qui commande le reste à payer, le devis et la
 * facture.
 *
 * Modifié là où il se lit, plutôt que dans un écran de réglages : on corrige
 * un chiffre au moment où on le voit faux.
 */
export function MontantModifiable({
  dossierId,
  montantCents,
  affichage,
}: {
  dossierId: string;
  montantCents: number | null;
  /** Le montant déjà mis en forme par la carte, pour ne pas le formater deux fois. */
  affichage: string;
}) {
  const router = useRouter();
  const [ouvert, setOuvert] = useState(false);
  const [valeur, setValeur] = useState(montantCents == null ? '' : String(montantCents / 100));
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, demarrer] = useTransition();

  const enregistrer = () => {
    setErreur(null);
    demarrer(async () => {
      const r = await modifierMontantDossier({ dossierId, montant: valeur.trim() });
      if (r.ok) {
        setOuvert(false);
        router.refresh();
      } else setErreur(r.error);
    });
  };

  if (!ouvert) {
    return (
      <span className="inline-flex items-center gap-1.5">
        <span>{affichage}</span>
        <button
          type="button"
          onClick={() => setOuvert(true)}
          title="Modifier le montant"
          aria-label="Modifier le montant du dossier"
          className="text-emerald-700/60 dark:text-emerald-300/60 hover:text-emerald-800 dark:hover:text-emerald-200 transition"
        >
          <Pencil className="w-3.5 h-3.5" />
        </button>
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
              enregistrer();
            }
            if (e.key === 'Escape') setOuvert(false);
          }}
          inputMode="decimal"
          placeholder="4000"
          aria-label="Montant du dossier en euros"
          autoFocus
          className="w-28 h-8 px-2 rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-[15px] font-bold text-zinc-900 dark:text-zinc-100 tabular-nums focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
        />
        <button
          type="button"
          onClick={enregistrer}
          disabled={enCours}
          title="Enregistrer"
          className="w-7 h-7 rounded-md grid place-items-center bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-50"
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
        € HT pour tout le dossier. Vide = à définir.
      </span>
      {erreur && (
        <span role="alert" className="text-[11px] font-semibold text-rose-600 dark:text-rose-400">
          {erreur}
        </span>
      )}
    </span>
  );
}
