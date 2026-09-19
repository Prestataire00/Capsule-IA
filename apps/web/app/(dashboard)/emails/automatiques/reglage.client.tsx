'use client';

import { useState } from 'react';
import { Pencil, RotateCcw, Lock } from 'lucide-react';
import type { Reglable, Reglage } from '@/features/emails/programmation-envois';
import { reglerEnvoi, remettreDefaut } from './actions';

/**
 * Le réglage d'un envoi : actif ou non, et dans combien de jours.
 *
 * Replié par défaut : on vient d'abord sur cette page pour LIRE ce qui part.
 * Le formulaire n'apparaît qu'au moment où l'on veut changer quelque chose.
 */
export function Reglage({
  kind,
  reglable,
  reglage,
  phrase,
  personnalise,
  peutRegler,
}: {
  kind: string;
  reglable: Reglable;
  reglage: Reglage;
  phrase: string | null;
  /** Un réglage explicite existe : on peut proposer de revenir au défaut. */
  personnalise: boolean;
  peutRegler: boolean;
}) {
  const [ouvert, setOuvert] = useState(false);

  if (!peutRegler) {
    return (
      <p className="text-[11px] text-zinc-400 mt-2.5 flex items-center gap-1.5">
        <Lock className="w-3 h-3 shrink-0" />
        {phrase ?? 'Réglé par votre organisme'} — seuls un propriétaire ou un administrateur peuvent le changer.
      </p>
    );
  }

  if (!ouvert) {
    return (
      <div className="flex flex-wrap items-center gap-2 mt-2.5">
        {phrase && (
          <span className="text-[11px] text-zinc-500 dark:text-zinc-400 tabular-nums">{phrase}</span>
        )}
        {!reglage.actif && (
          <span className="inline-flex items-center h-5 px-1.5 rounded text-[11px] font-semibold bg-zinc-200 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
            Coupé pour tout l’organisme
          </span>
        )}
        {personnalise && (
          <span className="inline-flex items-center h-5 px-1.5 rounded text-[11px] font-medium bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300">
            Réglé par vous
          </span>
        )}
        <button
          type="button"
          onClick={() => setOuvert(true)}
          className="inline-flex items-center gap-0.5 text-[11px] font-semibold text-orange-600 dark:text-orange-400 hover:underline"
        >
          <Pencil className="w-3 h-3" /> Régler
        </button>
      </div>
    );
  }

  return (
    <div className="mt-3 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50/70 dark:bg-zinc-950/40 p-3">
      <form action={reglerEnvoi} className="flex flex-wrap items-end gap-3">
        <input type="hidden" name="kind" value={kind} />
        <input type="hidden" name="coupable" value={reglable.coupable ? '1' : '0'} />

        {reglable.coupable && (
          <label className="inline-flex items-center gap-2 text-[12px] text-zinc-700 dark:text-zinc-200">
            <input
              type="checkbox"
              name="actif"
              defaultChecked={reglage.actif}
              className="w-4 h-4 rounded border-zinc-300 dark:border-zinc-600 text-orange-500 focus:ring-orange-500"
            />
            Envoyer automatiquement
          </label>
        )}

        {reglable.delai && (
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Délai</span>
            <span className="flex items-center gap-2">
              <input
                type="number"
                name="delaiJours"
                defaultValue={reglage.delaiJours}
                min={reglable.delai.min}
                max={reglable.delai.max}
                step={1}
                required
                className="w-20 h-8 px-2 rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-[12px] tabular-nums"
              />
              <span className="text-[12px] text-zinc-600 dark:text-zinc-300">jours {reglable.delai.libelle}</span>
            </span>
            <span className="text-[11px] text-zinc-400">
              Entre {reglable.delai.min} et {reglable.delai.max} jours · d’origine : {reglable.delai.defaut}
            </span>
          </label>
        )}

        <div className="flex items-center gap-2">
          <button
            type="submit"
            className="h-8 px-3 rounded-md bg-orange-500 hover:bg-orange-600 text-white text-[12px] font-semibold transition"
          >
            Enregistrer
          </button>
          <button
            type="button"
            onClick={() => setOuvert(false)}
            className="h-8 px-2.5 rounded-md text-[12px] text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition"
          >
            Annuler
          </button>
        </div>
      </form>

      {personnalise && (
        <form action={remettreDefaut} className="mt-2">
          <input type="hidden" name="kind" value={kind} />
          <button
            type="submit"
            className="inline-flex items-center gap-1 text-[11px] text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 transition"
          >
            <RotateCcw className="w-3 h-3" /> Revenir au réglage d’origine
          </button>
        </form>
      )}

      {!reglable.coupable && (
        <p className="text-[11px] text-zinc-400 mt-2">
          Cet envoi ne peut pas être coupé — seul son moment se règle.
        </p>
      )}
    </div>
  );
}
