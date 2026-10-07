// Formats de l'espace entreprise : toujours à l'heure de Paris.

const tz = { timeZone: 'Europe/Paris' } as const;
export const jourCourt = new Intl.DateTimeFormat('fr-FR', { ...tz, day: '2-digit', month: '2-digit', year: 'numeric' });
export const jourLong = new Intl.DateTimeFormat('fr-FR', { ...tz, weekday: 'long', day: 'numeric', month: 'long' });
export const heure = new Intl.DateTimeFormat('fr-FR', { ...tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
export const dateHeure = new Intl.DateTimeFormat('fr-FR', { ...tz, day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
export const heures = (n: number) => `${new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 }).format(n)} h`;
export const euros = (c: number) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(c / 100);
export const date = (iso: string | null) => (iso ? jourCourt.format(new Date(iso.length === 10 ? `${iso}T12:00:00Z` : iso)) : null);

export const MODALITE: Record<string, string> = { presentiel: 'Présentiel', distanciel: 'À distance', hybride: 'Hybride' };
export const DEMI_JOURNEE: Record<string, string> = { morning: 'Matin', afternoon: 'Après-midi', full: 'Journée', evening: 'Soir' };
export const STATUT_EMARGEMENT: Record<string, { libelle: string; ton: string }> = {
  present: { libelle: 'Présent', ton: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300' },
  late: { libelle: 'En retard', ton: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300' },
  remote: { libelle: 'À distance', ton: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300' },
  absent: { libelle: 'Absent', ton: 'bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-300' },
  absent_justified: { libelle: 'Absence justifiée', ton: 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300' },
};
export const CARTE = 'rounded-xl border border-zinc-200/70 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-sm';
export const BOUTON =
  'inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-zinc-200 dark:border-zinc-700 text-[12px] font-medium text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-800';
