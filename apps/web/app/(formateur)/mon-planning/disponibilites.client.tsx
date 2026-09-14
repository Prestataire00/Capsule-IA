'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Check, X, Minus, Loader2, CalendarRange } from 'lucide-react';
import type { Creneau, Dispo } from '@/features/trainer-space/availability';
import { declarerMaDisponibilite } from './actions';

/**
 * Déclaration des disponibilités, demi-journée par demi-journée.
 *
 * Un clic fait tourner l'état : non renseigné → disponible → indisponible →
 * non renseigné. C'est le geste le plus court pour remplir quatre semaines, et
 * la couleur suffit ensuite à relire son mois.
 */

export type JourAffiche = {
  day: string;
  label: string;
  jourSemaine: string;
  weekend: boolean;
  matin: Dispo | null;
  apresMidi: Dispo | null;
  /** Une séance déjà planifiée : on ne laisse pas déclarer par-dessus. */
  seances: number;
};

const SUIVANT: Record<string, Dispo | null> = { vide: 'disponible', disponible: 'indisponible', indisponible: null };

const CELLULE: Record<string, string> = {
  vide: 'bg-zinc-50 text-zinc-400 border-zinc-200 dark:bg-zinc-900 dark:text-zinc-500 dark:border-zinc-800 hover:border-zinc-300',
  disponible:
    'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-900/50',
  indisponible: 'bg-red-100 text-red-700 border-red-200 dark:bg-red-950/50 dark:text-red-300 dark:border-red-900/50',
  seance: 'bg-sky-100 text-sky-700 border-sky-200 dark:bg-sky-950/50 dark:text-sky-300 dark:border-sky-900/50',
};

function Icone({ etat }: { etat: string }) {
  if (etat === 'disponible') return <Check className="w-3.5 h-3.5" />;
  if (etat === 'indisponible') return <X className="w-3.5 h-3.5" />;
  if (etat === 'seance') return <CalendarRange className="w-3.5 h-3.5" />;
  return <Minus className="w-3.5 h-3.5" />;
}

export function Disponibilites({ trainerId, jours }: { trainerId: string; jours: JourAffiche[] }) {
  const router = useRouter();
  const [erreur, setErreur] = useState<string | null>(null);
  const [encours, setEncours] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const basculer = (day: string, creneau: Creneau, actuel: Dispo | null) => {
    const cle = `${day}-${creneau}`;
    setErreur(null);
    setEncours(cle);
    startTransition(async () => {
      const res = await declarerMaDisponibilite({
        trainerId,
        day,
        creneau,
        kind: SUIVANT[actuel ?? 'vide'] ?? null,
      });
      setEncours(null);
      if (!res.ok) {
        setErreur(res.error);
        return;
      }
      router.refresh();
    });
  };

  return (
    <section className="rounded-2xl border border-emerald-100/70 dark:border-emerald-900/30 bg-gradient-to-br from-emerald-50 to-white dark:from-emerald-950/25 dark:to-zinc-900 p-5 shadow-sm space-y-4">
      <div>
        <h2 className="text-[16px] font-extrabold text-zinc-900 dark:text-zinc-100">Mes disponibilités</h2>
        <p className="text-[13px] text-zinc-600 dark:text-zinc-400 mt-1">
          Dites quand vous êtes libre : votre organisme le voit au moment où il planifie une séance. Cliquez sur une
          demi-journée pour changer son état.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3 text-[11px] text-zinc-600 dark:text-zinc-400">
        {(
          [
            ['disponible', 'Disponible'],
            ['indisponible', 'Indisponible'],
            ['vide', 'Non renseigné'],
            ['seance', 'Séance planifiée'],
          ] as const
        ).map(([etat, label]) => (
          <span key={etat} className="inline-flex items-center gap-1.5">
            <span className={`w-5 h-5 rounded border grid place-items-center ${CELLULE[etat]}`}>
              <Icone etat={etat} />
            </span>
            {label}
          </span>
        ))}
      </div>

      <div className="overflow-x-auto -mx-1 px-1">
        <table className="w-full min-w-[320px] border-separate border-spacing-y-1">
          <thead>
            <tr className="text-[11px] font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              <th className="text-left font-bold pb-1">Jour</th>
              <th className="w-24 pb-1">Matin</th>
              <th className="w-24 pb-1">Après-midi</th>
            </tr>
          </thead>
          <tbody>
            {jours.map((j) => (
              <tr key={j.day} className={j.weekend ? 'opacity-55' : ''}>
                <td className="py-0.5">
                  <span className="text-[13px] text-zinc-800 dark:text-zinc-200">
                    <span className="capitalize font-medium">{j.jourSemaine}</span>{' '}
                    <span className="tabular-nums text-zinc-500 dark:text-zinc-400">{j.label}</span>
                  </span>
                  {j.seances > 0 && (
                    <span className="ml-2 text-[11px] font-semibold text-sky-600 dark:text-sky-400 tabular-nums">
                      {j.seances} séance{j.seances > 1 ? 's' : ''}
                    </span>
                  )}
                </td>
                {(
                  [
                    ['matin', j.matin] as const,
                    ['apres_midi', j.apresMidi] as const,
                  ]
                ).map(([creneau, valeur]) => {
                  const cle = `${j.day}-${creneau}`;
                  const etat = valeur ?? 'vide';
                  const charge = encours === cle;
                  return (
                    <td key={creneau} className="py-0.5 text-center">
                      <button
                        type="button"
                        onClick={() => basculer(j.day, creneau, valeur)}
                        disabled={charge}
                        aria-label={`${creneau === 'matin' ? 'Matin' : 'Après-midi'} du ${j.label} — ${
                          etat === 'vide' ? 'non renseigné' : etat
                        }`}
                        className={`w-full h-8 rounded-lg border text-[12px] font-semibold inline-flex items-center justify-center gap-1 transition disabled:opacity-60 ${CELLULE[etat]}`}
                      >
                        {charge ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Icone etat={etat} />}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {erreur && <p className="text-[12px] text-red-600 dark:text-red-400">{erreur}</p>}
    </section>
  );
}
