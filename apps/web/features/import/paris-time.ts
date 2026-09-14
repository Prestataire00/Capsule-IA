// ARCHETYPE: shared
// Une convention donne des horaires locaux (« 10h30 – 12h00 »), la base stocke
// des instants. Le serveur tourne en UTC : convertir avec `new Date(...)` y
// décalerait chaque séance d'une à deux heures selon la saison.

/** Décalage de Paris (en minutes) à cet instant : +120 en été, +60 en hiver. */
function decalageParis(instant: Date): number {
  const libelle = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Paris',
    timeZoneName: 'longOffset',
  }).format(instant);
  const m = /GMT([+-])(\d{2}):(\d{2})/.exec(libelle);
  if (!m) return 60;
  const signe = m[1] === '-' ? -1 : 1;
  return signe * (Number(m[2]) * 60 + Number(m[3]));
}

/**
 * Date (YYYY-MM-DD) + heure locale (HH:MM) à Paris → instant ISO.
 * Le décalage est calculé sur la date visée, donc juste de part et d'autre du
 * changement d'heure.
 */
export function parisIso(date: string, heure: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(heure)) return null;
  const [y, mo, d] = date.split('-').map(Number) as [number, number, number];
  const [h, mi] = heure.split(':').map(Number) as [number, number];
  const naif = Date.UTC(y, mo - 1, d, h, mi, 0);
  // Première approximation avec le décalage à cet instant naïf, puis correction :
  // suffisant hors des deux heures du basculement, où aucune séance ne commence.
  const approx = new Date(naif - decalageParis(new Date(naif)) * 60_000);
  const exact = new Date(naif - decalageParis(approx) * 60_000);
  return Number.isNaN(exact.getTime()) ? null : exact.toISOString();
}
