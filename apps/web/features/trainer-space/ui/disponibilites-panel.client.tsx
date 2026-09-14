'use client';

import { useEffect, useState } from 'react';
import { Check, X, Minus, CircleSlash, Loader2, Users } from 'lucide-react';
import { STATUT_LABELS, type Statut } from '@/features/trainer-space/availability';

/**
 * Disponibilité des formateurs au moment où l'on planifie.
 *
 * Elle se recharge à chaque changement de créneau : c'est la date choisie qui
 * décide, pas celle d'ouverture du formulaire. Un formateur non renseigné n'est
 * pas présenté comme libre — il est présenté comme silencieux.
 */

type Ligne = {
  trainerId: string;
  name: string;
  statut: Statut;
  note: string | null;
  dejaEnSeance: number;
};

const TON: Record<Statut, string> = {
  disponible: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300',
  indisponible: 'bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-300',
  partiel: 'bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300',
  non_renseigne: 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400',
};

function Picto({ statut }: { statut: Statut }) {
  if (statut === 'disponible') return <Check className="w-3.5 h-3.5" />;
  if (statut === 'indisponible') return <X className="w-3.5 h-3.5" />;
  if (statut === 'partiel') return <CircleSlash className="w-3.5 h-3.5" />;
  return <Minus className="w-3.5 h-3.5" />;
}

const ORDRE: Record<Statut, number> = { disponible: 0, partiel: 1, non_renseigne: 2, indisponible: 3 };

export function DisponibilitesPanel({
  startsAtLocal,
  endsAtLocal,
  selectedTrainerId,
  onSelect,
}: {
  /** Valeurs brutes des champs `datetime-local` : converties ici, comme à l'envoi. */
  startsAtLocal: string;
  endsAtLocal: string;
  selectedTrainerId: string;
  onSelect: (trainerId: string) => void;
}) {
  const [lignes, setLignes] = useState<Ligne[] | null>(null);
  const [charge, setCharge] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    const debut = new Date(startsAtLocal);
    const fin = new Date(endsAtLocal);
    if (Number.isNaN(debut.getTime()) || Number.isNaN(fin.getTime()) || fin <= debut) {
      setLignes(null);
      return;
    }

    const controleur = new AbortController();
    setCharge(true);
    setErreur(null);
    fetch(
      `/api/formateurs/disponibilites?startsAt=${encodeURIComponent(debut.toISOString())}&endsAt=${encodeURIComponent(fin.toISOString())}`,
      { signal: controleur.signal },
    )
      .then((r) => r.json())
      .then((j: { ok: boolean; formateurs?: Ligne[] }) => {
        if (!j.ok || !j.formateurs) {
          setErreur('Disponibilités indisponibles pour le moment.');
          return;
        }
        setLignes([...j.formateurs].sort((a, b) => ORDRE[a.statut] - ORDRE[b.statut] || a.name.localeCompare(b.name)));
      })
      .catch((e: unknown) => {
        if ((e as { name?: string }).name === 'AbortError') return;
        setErreur('Disponibilités indisponibles pour le moment.');
      })
      .finally(() => setCharge(false));

    return () => controleur.abort();
  }, [startsAtLocal, endsAtLocal]);

  if (!lignes && !charge && !erreur) return null;

  return (
    <div className="rounded-xl border border-emerald-100 dark:border-emerald-900/40 bg-emerald-50/50 dark:bg-emerald-950/15 p-3.5 space-y-2.5">
      <div className="flex items-center gap-2">
        <span className="w-7 h-7 rounded-md grid place-items-center bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
          <Users className="w-4 h-4" />
        </span>
        <p className="text-[13px] font-semibold text-zinc-900 dark:text-zinc-100">
          Disponibilité des formateurs sur ce créneau
        </p>
        {charge && <Loader2 className="w-3.5 h-3.5 animate-spin text-zinc-400" />}
      </div>

      {erreur && <p className="text-[12px] text-zinc-500 dark:text-zinc-400">{erreur}</p>}

      {lignes && lignes.length === 0 && (
        <p className="text-[12px] text-zinc-500 dark:text-zinc-400">Aucun formateur enregistré dans cet organisme.</p>
      )}

      {lignes && lignes.length > 0 && (
        <ul className="space-y-1">
          {lignes.map((l) => {
            const choisi = l.trainerId === selectedTrainerId;
            return (
              <li key={l.trainerId}>
                <button
                  type="button"
                  onClick={() => onSelect(choisi ? '' : l.trainerId)}
                  className={`w-full text-left px-2.5 py-1.5 rounded-lg flex items-center justify-between gap-3 transition ${
                    choisi
                      ? 'bg-white dark:bg-zinc-900 ring-2 ring-orange-400'
                      : 'hover:bg-white/70 dark:hover:bg-zinc-900/50'
                  }`}
                >
                  <span className="min-w-0">
                    <span className="block text-[13px] font-medium text-zinc-900 dark:text-zinc-100 truncate">{l.name}</span>
                    {(l.note || l.dejaEnSeance > 0) && (
                      <span className="block text-[11px] text-zinc-500 dark:text-zinc-400 truncate">
                        {l.dejaEnSeance > 0
                          ? `Déjà ${l.dejaEnSeance} séance${l.dejaEnSeance > 1 ? 's' : ''} sur ce créneau`
                          : l.note}
                      </span>
                    )}
                  </span>
                  <span
                    className={`inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide px-2 h-6 rounded-md shrink-0 ${TON[l.statut]}`}
                  >
                    <Picto statut={l.statut} />
                    {STATUT_LABELS[l.statut]}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
        Cliquez sur un formateur pour le désigner. « Non renseigné » signifie qu&apos;il n&apos;a rien déclaré, pas
        qu&apos;il est libre.
      </p>
    </div>
  );
}
