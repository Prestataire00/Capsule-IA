'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Loader2, UserCog, UserPlus, X } from 'lucide-react';
import { confierDossier, retirerDossier } from './formateur-actions';

export type FormateurAssigne = { id: string; nom: string; isLead: boolean };
export type FormateurOption = { id: string; label: string };

/**
 * Désignation du formateur, dans la bannière du dossier : confier une affaire
 * tient en un choix, cela ne méritait pas un onglet à soi.
 */
export function FormateurChip({
  dossierId,
  assignes,
  disponibles,
  gerer,
}: {
  dossierId: string;
  assignes: FormateurAssigne[];
  disponibles: FormateurOption[];
  gerer: boolean;
}) {
  const router = useRouter();
  const [ouvert, setOuvert] = useState(false);
  const [trainerId, setTrainerId] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const agir = (fn: () => Promise<{ ok: true } | { ok: false; error: string }>) => {
    setErreur(null);
    start(async () => {
      const r = await fn();
      if (!r.ok) {
        setErreur(r.error);
        return;
      }
      setOuvert(false);
      setTrainerId('');
      router.refresh();
    });
  };

  return (
    <p className="text-[13px] text-zinc-500 dark:text-zinc-400 mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
      <span className="inline-flex items-center gap-1.5">
        <UserCog className="w-3.5 h-3.5 text-zinc-400" aria-hidden />
        {assignes.length === 0 ? 'Aucun formateur' : assignes.length > 1 ? 'Formateurs' : 'Formateur'} :
      </span>

      {assignes.length === 0 && !gerer && <span>à désigner</span>}

      {assignes.map((f) => (
        <span
          key={f.id}
          className="inline-flex items-center gap-1 rounded-md bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 text-[12px] font-semibold text-zinc-700 dark:text-zinc-200"
        >
          {f.nom}
          {f.isLead && <span className="font-normal text-zinc-500 dark:text-zinc-400">· pédagogique</span>}
          {gerer && (
            <button
              type="button"
              aria-label={`Retirer ${f.nom} du dossier`}
              title="Retirer du dossier"
              disabled={pending}
              onClick={() => {
                if (!window.confirm(`Retirer ${f.nom} de ce dossier ? Il n’y aura plus accès dans son espace.`)) return;
                agir(() => retirerDossier({ dossierId, trainerId: f.id }));
              }}
              className="text-zinc-400 hover:text-rose-600 dark:hover:text-rose-400 disabled:opacity-50"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </span>
      ))}

      {gerer && !ouvert && disponibles.length > 0 && (
        <button
          type="button"
          onClick={() => setOuvert(true)}
          className="inline-flex items-center gap-1 text-[12px] font-semibold text-orange-600 dark:text-orange-400 hover:underline"
        >
          <UserPlus className="w-3.5 h-3.5" /> {assignes.length === 0 ? 'Confier à un formateur' : 'Ajouter'}
        </button>
      )}

      {gerer && ouvert && (
        <span className="inline-flex items-center gap-1.5">
          <select
            value={trainerId}
            onChange={(e) => setTrainerId(e.target.value)}
            aria-label="Formateur à qui confier le dossier"
            className="text-[12px] px-2 h-8 rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200 max-w-[14rem] focus:outline-none focus:ring-2 focus:ring-orange-500/30"
          >
            <option value="">Choisir…</option>
            {disponibles.map((f) => (
              <option key={f.id} value={f.id}>
                {f.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={pending || !trainerId}
            onClick={() => agir(() => confierDossier({ dossierId, trainerId }))}
            className="inline-flex items-center gap-1 text-[12px] font-semibold px-2 h-8 rounded-md bg-orange-500 text-white hover:bg-orange-600 disabled:opacity-40"
          >
            {pending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} Confier
          </button>
          <button
            type="button"
            onClick={() => {
              setOuvert(false);
              setErreur(null);
            }}
            className="text-[12px] text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
          >
            Annuler
          </button>
        </span>
      )}

      <span className="block basis-full text-[12px] text-zinc-400 dark:text-zinc-500">
        Le formateur désigné gère cette affaire depuis son espace — apprenants, séances et émargement — sans accès aux
        tarifs ni à la facturation.
      </span>

      {erreur && (
        <span role="alert" className="block basis-full text-[12px] font-semibold text-rose-600 dark:text-rose-400">
          {erreur}
        </span>
      )}
    </p>
  );
}
