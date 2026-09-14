// ARCHETYPE: shared
// Échéances des tâches : toujours raisonnées à l'heure de Paris, jamais au fuseau
// de la machine (un report « à demain » saisi à 23 h 30 doit viser le bon jour).

/** Date du jour à Paris, au format AAAA-MM-JJ. */
export function jourParis(d: Date = new Date()): string {
  return new Intl.DateTimeFormat('fr-CA', { timeZone: 'Europe/Paris' }).format(d);
}

/** AAAA-MM-JJ + n jours calendaires, fins de mois et d'année comprises. */
export function ajouterJours(jour: string, n: number): string {
  const [a = NaN, m = NaN, j = NaN] = jour.split('-').map(Number);
  const cible = new Date(Date.UTC(a, m - 1, j + n));
  if (Number.isNaN(cible.getTime())) throw new Error(`Date invalide : ${jour}`);
  return cible.toISOString().slice(0, 10);
}

/** Reports proposés d'un clic, comptés depuis aujourd'hui. */
export const REPORTS_RAPIDES = [
  { label: 'Demain', jours: 1 },
  { label: 'Dans 3 jours', jours: 3 },
  { label: 'Dans une semaine', jours: 7 },
] as const;
