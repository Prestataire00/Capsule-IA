/**
 * Dates de l'espace formateur, toujours au fuseau de Paris : le serveur tourne
 * en UTC, et un formatage « local » y décalait les heures de séance.
 */

const PARIS = 'Europe/Paris';
const JOUR_MS = 24 * 60 * 60 * 1000;

/** Clé de jour « AAAA-MM-JJ » à Paris. */
export const dayKey = (d: Date | string) => new Intl.DateTimeFormat('fr-CA', { timeZone: PARIS }).format(new Date(d));

const JOURS_SEMAINE = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** Clé du lundi de la semaine (à Paris). */
export function mondayKey(d: Date | string): string {
  const date = new Date(d);
  const jour = new Intl.DateTimeFormat('en-US', { timeZone: PARIS, weekday: 'short' }).format(date);
  const decalage = Math.max(0, JOURS_SEMAINE.indexOf(jour));
  return dayKey(new Date(date.getTime() - decalage * JOUR_MS));
}

export const heure = (iso: string) => new Intl.DateTimeFormat('fr-FR', { timeZone: PARIS, hour: '2-digit', minute: '2-digit' }).format(new Date(iso));

export const jourLong = (iso: string) =>
  new Intl.DateTimeFormat('fr-FR', { timeZone: PARIS, weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(iso));

/** « Semaine du 14 septembre » à partir d'une clé de lundi. */
export const semaineDu = (cleLundi: string) =>
  `Semaine du ${new Intl.DateTimeFormat('fr-FR', { timeZone: 'UTC', day: 'numeric', month: 'long' }).format(new Date(`${cleLundi}T12:00:00Z`))}`;

/** « Aujourd'hui », « Demain » ou le jour en toutes lettres. */
export function jourRelatif(iso: string, now = new Date()): string {
  const cle = dayKey(iso);
  if (cle === dayKey(now)) return 'Aujourd’hui';
  if (cle === dayKey(new Date(now.getTime() + JOUR_MS))) return 'Demain';
  return jourLong(iso);
}
