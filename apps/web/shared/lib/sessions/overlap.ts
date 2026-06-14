// Module pur (pas de `server-only`) : détecte si un créneau chevauche d'autres
// créneaux — base de l'alerte « planning formateur » sur les sessions partagées.
export type TimeRange = { startsAt: Date; endsAt: Date };

/** True si `candidate` chevauche au moins un créneau de `existing` (bornes exclusives :
 *  deux créneaux adjacents ne se chevauchent pas). */
export function hasOverlap(candidate: TimeRange, existing: TimeRange[]): boolean {
  return existing.some(
    (e) => candidate.startsAt < e.endsAt && e.startsAt < candidate.endsAt,
  );
}
