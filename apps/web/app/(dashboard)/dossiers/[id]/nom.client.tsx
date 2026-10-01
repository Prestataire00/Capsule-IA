'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Building2, Check, Loader2, Pencil, X } from 'lucide-react';
import { renommerDossier } from './nom-actions';

/**
 * Le titre de la fiche, renommable sur place.
 *
 * Le nom déduit (stagiaire, référent, entreprise) reste proposé tant qu'on
 * n'en choisit pas d'autre ; l'entreprise cliente se reprend en un clic,
 * parce que c'est le cas qui a motivé la demande.
 */
export function NomDossierModifiable({
  dossierId,
  affiche,
  nomChoisi,
  entreprise,
  modifiable,
}: {
  dossierId: string;
  /** Le nom tel qu'il s'affiche : choisi, ou déduit à défaut. */
  affiche: string;
  nomChoisi: string | null;
  entreprise: string | null;
  modifiable: boolean;
}) {
  const router = useRouter();
  const [ouvert, setOuvert] = useState(false);
  const [valeur, setValeur] = useState(nomChoisi ?? affiche);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, demarrer] = useTransition();

  const enregistrer = (nom: string) => {
    setErreur(null);
    demarrer(async () => {
      const r = await renommerDossier({ dossierId, nom: nom.trim() });
      if (r.ok) {
        setOuvert(false);
        router.refresh();
      } else setErreur(r.error);
    });
  };

  const titre = (
    <h1 className="text-[30px] leading-none font-extrabold text-zinc-900 dark:text-zinc-100 truncate">{affiche}</h1>
  );

  if (!modifiable) return titre;

  if (!ouvert) {
    return (
      <div className="flex items-center gap-2 min-w-0">
        {titre}
        <button
          type="button"
          onClick={() => {
            setValeur(nomChoisi ?? affiche);
            setOuvert(true);
          }}
          title="Renommer le dossier"
          aria-label="Renommer le dossier"
          className="shrink-0 w-7 h-7 rounded-md grid place-items-center text-zinc-400 hover:text-orange-600 hover:bg-orange-50 dark:hover:bg-orange-950/40 dark:hover:text-orange-400 transition"
        >
          <Pencil className="w-4 h-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 max-w-xl">
      <div className="flex items-center gap-1.5">
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
          maxLength={120}
          aria-label="Nom du dossier"
          autoFocus
          className="flex-1 min-w-0 h-11 px-3 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-[20px] font-semibold text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-orange-300 dark:focus:border-orange-800 focus:ring-4 focus:ring-orange-500/10"
        />
        <button
          type="button"
          onClick={() => enregistrer(valeur)}
          disabled={enCours}
          title="Enregistrer"
          className="w-9 h-9 rounded-lg grid place-items-center bg-orange-500 hover:bg-orange-600 text-white disabled:opacity-50"
        >
          {enCours ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
        </button>
        <button
          type="button"
          onClick={() => setOuvert(false)}
          disabled={enCours}
          title="Annuler"
          className="w-9 h-9 rounded-lg grid place-items-center text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-50"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="flex items-center gap-3 flex-wrap text-[12px]">
        {entreprise && entreprise !== valeur.trim() && (
          <button
            type="button"
            onClick={() => setValeur(entreprise)}
            disabled={enCours}
            className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-medium bg-zinc-100 text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700 transition"
          >
            <Building2 className="w-3.5 h-3.5" aria-hidden /> Reprendre « {entreprise} »
          </button>
        )}
        {nomChoisi && (
          <button
            type="button"
            onClick={() => enregistrer('')}
            disabled={enCours}
            className="text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200 underline underline-offset-2"
          >
            Revenir au nom automatique
          </button>
        )}
        <span className="text-zinc-500 dark:text-zinc-400">Entrée pour enregistrer, Échap pour annuler.</span>
      </div>
      {erreur && (
        <p role="alert" className="text-[12px] font-medium text-rose-600 dark:text-rose-400">
          {erreur}
        </p>
      )}
    </div>
  );
}
