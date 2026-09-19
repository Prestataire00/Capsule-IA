'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Check, X, Minus, Loader2, CalendarRange, ChevronLeft, ChevronRight } from 'lucide-react';
import type { Creneau, Dispo } from '@/features/trainer-space/availability';
import { declarerMaDisponibilite } from './actions';

/**
 * Déclaration des disponibilités, en semaines calendaires.
 *
 * La liste verticale obligeait à faire défiler pour comparer deux jours, alors
 * qu'un formateur raisonne par semaine : « je suis pris tous les mardis ». La
 * grille rend cette régularité visible d'un regard.
 *
 * Un clic fait tourner l'état : non renseigné → disponible → indisponible →
 * non renseigné. C'est le geste le plus court pour remplir un mois.
 *
 * UNE semaine à l'écran, et des flèches pour en changer — comme le planning de
 * l'espace administrateur. Les cinq semaines empilées faisaient une page à
 * dérouler, où l'on perdait de vue celle qu'on était en train de remplir.
 */

export type JourAffiche = {
  day: string;
  label: string;
  jourSemaine: string;
  weekend: boolean;
  matin: Dispo | null;
  apresMidi: Dispo | null;
  /** Une séance déjà planifiée : le fait prime sur la déclaration. */
  seances: number;
  /** Jour révolu : on ne déclare pas le passé. */
  passe: boolean;
  aujourdhui: boolean;
};

export type SemaineAffichee = { cle: string; titre: string; jours: JourAffiche[] };

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

const LIBELLE_CRENEAU: Record<Creneau, string> = { matin: 'Matin', apres_midi: 'Après-midi', journee: 'Journée' };

export function Disponibilites({ trainerId, semaines }: { trainerId: string; semaines: SemaineAffichee[] }) {
  const router = useRouter();
  const [index, setIndex] = useState(0);
  // Borné : le tableau des semaines peut rétrécir d'un rendu à l'autre.
  const semaine = semaines[Math.min(index, Math.max(0, semaines.length - 1))];
  const [erreur, setErreur] = useState<string | null>(null);
  const [encours, setEncours] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const basculer = (jour: JourAffiche, creneau: Creneau, actuel: Dispo | null) => {
    const cle = `${jour.day}-${creneau}`;
    setErreur(null);
    setEncours(cle);
    startTransition(async () => {
      const res = await declarerMaDisponibilite({
        trainerId,
        day: jour.day,
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

  /** Toute la semaine d'un coup : le geste le plus fréquent après « je suis pris ». */
  const toutePlaSemaine = (semaine: SemaineAffichee, kind: Dispo) => {
    setErreur(null);
    const ouvrables = semaine.jours.filter((j) => !j.passe && !j.weekend && j.seances === 0);
    startTransition(async () => {
      for (const jour of ouvrables) {
        const res = await declarerMaDisponibilite({ trainerId, day: jour.day, creneau: 'journee', kind });
        if (!res.ok) {
          setErreur(res.error);
          break;
        }
      }
      router.refresh();
    });
  };

  return (
    <section className="rounded-2xl border border-emerald-100/70 dark:border-emerald-900/30 bg-gradient-to-br from-emerald-50 to-white dark:from-emerald-950/25 dark:to-zinc-900 p-5 shadow-sm space-y-4">
      <div>
        <h2 className="text-[17px] font-extrabold text-zinc-900 dark:text-zinc-100">Mes disponibilités</h2>
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

      {semaine && (
        <div key={semaine.cle} className="space-y-1.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setIndex((n) => Math.max(0, n - 1))}
                disabled={index === 0}
                aria-label="Semaine précédente"
                className="w-7 h-7 rounded-md grid place-items-center text-zinc-500 dark:text-zinc-400 hover:bg-white/70 dark:hover:bg-zinc-800 transition disabled:opacity-30 disabled:hover:bg-transparent"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <h3 className="text-[13px] font-bold text-zinc-800 dark:text-zinc-200 capitalize">{semaine.titre}</h3>
              <button
                type="button"
                onClick={() => setIndex((n) => Math.min(semaines.length - 1, n + 1))}
                disabled={index >= semaines.length - 1}
                aria-label="Semaine suivante"
                className="w-7 h-7 rounded-md grid place-items-center text-zinc-500 dark:text-zinc-400 hover:bg-white/70 dark:hover:bg-zinc-800 transition disabled:opacity-30 disabled:hover:bg-transparent"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
              {index > 0 && (
                <button
                  type="button"
                  onClick={() => setIndex(0)}
                  className="ml-1 text-[12px] font-semibold text-orange-600 dark:text-orange-400 hover:text-orange-700 dark:hover:text-orange-300 transition"
                >
                  Cette semaine
                </button>
              )}
            </div>
            <span className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => toutePlaSemaine(semaine, 'disponible')}
                className="h-7 px-2 rounded-md text-[11px] font-semibold text-emerald-700 dark:text-emerald-300 bg-emerald-100/70 dark:bg-emerald-950/40 hover:bg-emerald-200 dark:hover:bg-emerald-950/70 transition"
              >
                Tout dispo
              </button>
              <button
                type="button"
                onClick={() => toutePlaSemaine(semaine, 'indisponible')}
                className="h-7 px-2 rounded-md text-[11px] font-semibold text-red-700 dark:text-red-300 bg-red-100/70 dark:bg-red-950/40 hover:bg-red-200 dark:hover:bg-red-950/70 transition"
              >
                Tout indispo
              </button>
            </span>
          </div>

          <div className="overflow-x-auto -mx-1 px-1">
            <div className="grid grid-cols-7 gap-1.5 min-w-[560px]">
              {semaine.jours.map((j) => (
                <div
                  key={j.day}
                  className={`rounded-lg border p-1.5 ${
                    j.aujourdhui
                      ? 'border-orange-300 dark:border-orange-900/60 bg-orange-50/60 dark:bg-orange-950/20'
                      : 'border-zinc-200/70 dark:border-zinc-800 bg-white/70 dark:bg-zinc-900/50'
                  } ${j.passe ? 'opacity-40' : j.weekend ? 'opacity-70' : ''}`}
                >
                  <p className="text-center mb-1">
                    <span className="block text-[11px] font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                      {j.jourSemaine}
                    </span>
                    <span
                      className={`block text-[13px] font-bold tabular-nums ${
                        j.aujourdhui ? 'text-orange-600 dark:text-orange-400' : 'text-zinc-800 dark:text-zinc-200'
                      }`}
                    >
                      {j.label}
                    </span>
                  </p>

                  {(
                    [
                      ['matin', j.matin] as const,
                      ['apres_midi', j.apresMidi] as const,
                    ]
                  ).map(([creneau, valeur]) => {
                    const cle = `${j.day}-${creneau}`;
                    const etat = j.seances > 0 ? 'seance' : (valeur ?? 'vide');
                    const charge = encours === cle;
                    const fige = j.passe || j.seances > 0;
                    return (
                      <button
                        key={creneau}
                        type="button"
                        onClick={() => !fige && basculer(j, creneau, valeur)}
                        disabled={charge || fige}
                        aria-label={`${LIBELLE_CRENEAU[creneau]} du ${j.label} — ${
                          j.seances > 0 ? 'séance planifiée' : etat === 'vide' ? 'non renseigné' : etat
                        }`}
                        title={
                          j.seances > 0
                            ? 'Séance déjà planifiée'
                            : j.passe
                              ? 'Jour passé'
                              : `${LIBELLE_CRENEAU[creneau]} — cliquez pour changer`
                        }
                        className={`w-full h-7 mb-1 last:mb-0 rounded-md border text-[11px] font-semibold inline-flex items-center justify-center gap-1 transition disabled:cursor-default ${CELLULE[etat]}`}
                      >
                        {charge ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <>
                            <Icone etat={etat} />
                            <span className="hidden sm:inline">{creneau === 'matin' ? 'M' : 'A'}</span>
                          </>
                        )}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>

          {/* Repère de position : sans lui, on ne sait plus où l'on en est dans
              les cinq semaines déclarables. */}
          <p className="text-[11px] text-zinc-500 dark:text-zinc-400 text-right tabular-nums">
            Semaine {index + 1} sur {semaines.length}
          </p>
        </div>
      )}

      {erreur && <p className="text-[12px] text-red-600 dark:text-red-400">{erreur}</p>}
    </section>
  );
}
