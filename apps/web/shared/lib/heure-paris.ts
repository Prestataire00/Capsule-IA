// L'heure telle qu'on la lit en France. Le serveur de production tourne en UTC :
// `getHours()` ou un format sans fuseau y donnent deux heures de moins l'été.

export const FUSEAU = 'Europe/Paris';

const PARTIES = new Intl.DateTimeFormat('fr-FR', {
  timeZone: FUSEAU,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  weekday: 'short',
  hourCycle: 'h23',
});

const JOURS: Record<string, number> = { 'lun.': 0, 'mar.': 1, 'mer.': 2, 'jeu.': 3, 'ven.': 4, 'sam.': 5, 'dim.': 6 };

/** Année, mois, jour, heure, minute et jour de la semaine (lundi = 0) à Paris. */
export function partiesParis(d: Date): {
  annee: number;
  mois: number;
  jour: number;
  heure: number;
  minute: number;
  jourSemaine: number;
} {
  const p = Object.fromEntries(PARTIES.formatToParts(d).map((x) => [x.type, x.value]));
  return {
    annee: Number(p.year),
    mois: Number(p.month),
    jour: Number(p.day),
    heure: Number(p.hour),
    minute: Number(p.minute),
    jourSemaine: JOURS[p.weekday ?? ''] ?? 0,
  };
}

/** « 09:00 » à Paris. */
export function heureParis(d: Date): string {
  const { heure, minute } = partiesParis(d);
  return `${String(heure).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}
