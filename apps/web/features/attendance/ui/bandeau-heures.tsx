import { CalendarClock, Clock, UserCheck, Users } from 'lucide-react';
import { AccentBar, ACCENTS } from '@/shared/ui/kpi-card';
import { heuresManquantes, heuresStagiaires, tauxDeRealisation, type DemiJournee } from '@/features/attendance/heures-stagiaires';

/**
 * Les heures de la séance, en bandeau à côté de l'émargement : ce sont les
 * signatures qui les font, elles se lisent au même endroit.
 */

const TZ = 'Europe/Paris';
const heure = new Intl.DateTimeFormat('fr-FR', { timeZone: TZ, hour: '2-digit', minute: '2-digit' });
const DEMI_JOURNEE: Record<string, string> = { morning: 'Matin', afternoon: 'Après-midi', full: 'Journée', evening: 'Soir' };

type Feuille = { readonly id: string; readonly half_day: DemiJournee; readonly signed: number; readonly total: number };

function Ligne({ icone: Icone, accent, label, valeur, detail }: {
  icone: typeof Clock;
  accent: keyof typeof ACCENTS;
  label: string;
  valeur: string;
  detail?: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <span className={`w-8 h-8 rounded-lg grid place-items-center shrink-0 ${ACCENTS[accent].soft}`}>
        <Icone className="w-4 h-4" />
      </span>
      <div className="min-w-0">
        <p className="text-[12px] text-zinc-500 dark:text-zinc-400">{label}</p>
        <p className="text-[15px] font-medium text-zinc-900 dark:text-zinc-100 tabular-nums">{valeur}</p>
        {detail && <p className="text-[12px] text-zinc-500 dark:text-zinc-400 tabular-nums">{detail}</p>}
      </div>
    </div>
  );
}

export function BandeauHeures({
  debut,
  fin,
  dureeHeures,
  inscrits,
  feuilles,
}: {
  debut: string;
  fin: string;
  dureeHeures: number;
  inscrits: number;
  feuilles: readonly Feuille[];
}) {
  const heures = heuresStagiaires({
    dureeHeures,
    inscrits,
    feuilles: feuilles.map((f) => ({ demiJournee: f.half_day, presents: f.signed })),
  });
  const manquantes = heuresManquantes(heures);
  const taux = tauxDeRealisation(heures);

  return (
    <aside className="rounded-xl border border-zinc-200/70 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-sm p-4 space-y-4 lg:sticky lg:top-4 self-start">
      <Ligne icone={CalendarClock} accent="blue" label="Créneau" valeur={`${heure.format(new Date(debut))} – ${heure.format(new Date(fin))}`} detail={`${dureeHeures} h de formation`} />
      <Ligne
        icone={Users}
        accent="rose"
        label="Heures-stagiaires prévues"
        valeur={`${heures.prevues} h`}
        detail={`${inscrits} inscrit${inscrits > 1 ? 's' : ''}`}
      />
      <Ligne
        icone={UserCheck}
        accent={!heures.mesurable ? 'sky' : manquantes > 0 ? 'amber' : 'emerald'}
        label="Heures-stagiaires réalisées"
        valeur={heures.mesurable ? `${heures.realisees} h` : '—'}
        detail={!heures.mesurable ? 'Aucun émargement encore' : manquantes > 0 ? `${manquantes} h non suivies · ${taux} %` : 'Tout le monde était présent'}
      />
      {feuilles.length > 0 && (
        <ul className="pt-3 border-t border-zinc-100 dark:border-zinc-800 space-y-2.5">
          {feuilles.map((f) => (
            <li key={f.id} className="space-y-1">
              <p className="flex items-center justify-between text-[12px]">
                <span className="text-zinc-700 dark:text-zinc-300">{DEMI_JOURNEE[f.half_day] ?? f.half_day}</span>
                <span className="text-zinc-500 dark:text-zinc-400 tabular-nums">
                  {f.signed}/{f.total} signées
                </span>
              </p>
              <AccentBar value={f.signed} max={f.total} accent={f.total > 0 && f.signed >= f.total ? 'emerald' : 'amber'} />
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}
