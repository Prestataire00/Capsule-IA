// Fenêtres horaires d'émargement par demi-journée + chevauchement de présence.
// Pur (testable). Utilisé pour attribuer une présence Zoom (join/leave) à la
// bonne feuille (matin / après-midi), en cohérence avec la migration 0082.

export type HalfDay = 'morning' | 'afternoon' | 'full' | 'evening';

const PARIS = 'Europe/Paris';

// Instant correspondant à 13:00 (heure de Paris) le jour de `startsAt`.
// Calculé via le décalage local au départ (pas de bascule DST en milieu de matinée).
export function parisMiddayBoundary(startsAt: Date): Date {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: PARIS,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(startsAt);
  const h = Number(parts.find((p) => p.type === 'hour')?.value ?? '0');
  const m = Number(parts.find((p) => p.type === 'minute')?.value ?? '0');
  const minutesIntoDay = h * 60 + m;
  return new Date(startsAt.getTime() + (13 * 60 - minutesIntoDay) * 60_000);
}

// Fenêtre [start, end] d'une demi-journée pour une session donnée.
export function halfDayWindow(
  startsAt: Date,
  endsAt: Date,
  halfDay: HalfDay,
): { start: Date; end: Date } {
  if (halfDay === 'morning') {
    const boundary = parisMiddayBoundary(startsAt);
    const end = boundary < endsAt ? boundary : endsAt;
    return { start: startsAt, end };
  }
  if (halfDay === 'afternoon') {
    const boundary = parisMiddayBoundary(startsAt);
    const start = boundary > startsAt ? boundary : startsAt;
    return { start, end: endsAt };
  }
  // full / evening : toute la session
  return { start: startsAt, end: endsAt };
}

// Minutes de chevauchement entre [aStart,aEnd] et [bStart,bEnd] (0 si disjoint).
export function overlapMinutes(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): number {
  const start = Math.max(aStart.getTime(), bStart.getTime());
  const end = Math.min(aEnd.getTime(), bEnd.getTime());
  return end > start ? Math.round((end - start) / 60_000) : 0;
}
