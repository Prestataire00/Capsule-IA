// Traçabilité de l'export d'émargement (demande du 12/11/2026 : « on n'a pas
// la traçabilité »). Ce que chaque signature prouve, rendu lisible. Pur.

const PARIS = 'Europe/Paris';

/** « 08/10/2026 13:45:12 », heure de Paris, à la seconde. */
export const horodatage = (iso: string | null | undefined): string =>
  iso
    ? new Intl.DateTimeFormat('fr-FR', {
        timeZone: PARIS,
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hourCycle: 'h23',
      })
        .format(new Date(iso))
        .replace(',', '')
    : '';

const CANAL: Record<string, string> = {
  lien: 'Lien personnel reçu par e-mail',
  lien_equipe: 'Lien transmis par l’équipe',
  qr: 'QR code projeté en salle',
  tablette: 'Signature sur la tablette du formateur',
  visio: 'Visio (lien de connexion)',
  grille: 'Présence attestée par l’équipe',
  zoom: 'Connexion Zoom',
  papier: 'Feuille papier',
};
const SOURCE: Record<string, string> = {
  qr: 'Lien personnel reçu par e-mail',
  manual: 'Signature sur la tablette du formateur',
  trainer_override: 'Présence attestée par l’équipe',
  zoom_csv: 'Connexion Zoom (import)',
  zoom_api: 'Connexion Zoom',
};

/** Comment la présence a été recueillie. */
export const canal = (captureMode: string | null | undefined, evidenceSource: string | null | undefined): string =>
  (captureMode && CANAL[captureMode]) || (evidenceSource && SOURCE[evidenceSource]) || captureMode || evidenceSource || '';

/** « iPhone · Safari », « Windows · Chrome » : assez pour reconnaître l'appareil. */
export function appareil(ua: string | null | undefined): string {
  if (!ua) return '';
  const os = /iPhone/.test(ua)
    ? 'iPhone'
    : /iPad/.test(ua)
      ? 'iPad'
      : /Android/.test(ua)
        ? 'Android'
        : /Windows/.test(ua)
          ? 'Windows'
          : /Mac OS X|Macintosh/.test(ua)
            ? 'Mac'
            : /Linux/.test(ua)
              ? 'Linux'
              : 'Autre';
  const nav = /Edg\//.test(ua)
    ? 'Edge'
    : /OPR\//.test(ua)
      ? 'Opera'
      : /Firefox\//.test(ua)
        ? 'Firefox'
        : /Chrome\//.test(ua) || /CriOS\//.test(ua)
          ? 'Chrome'
          : /Safari\//.test(ua)
            ? 'Safari'
            : 'Navigateur';
  return `${os} · ${nav}`;
}

/** La fenêtre de connexion d'une présence en visio, si elle a été importée. */
export function connexionVisio(payload: unknown): string {
  const p = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {};
  const debut = typeof p.joinTime === 'string' ? p.joinTime : null;
  const fin = typeof p.leaveTime === 'string' ? p.leaveTime : null;
  if (!debut && !fin) return '';
  return [horodatage(debut), horodatage(fin)].filter(Boolean).join(' → ');
}

const CHAMPS_SUIVIS: Record<string, string> = {
  status: 'présence',
  signed_at: 'heure d’entrée',
  exit_signed_at: 'heure de sortie',
  late_arrival_time: 'retard',
  early_departure_time: 'départ anticipé',
  absence_reason: 'motif d’absence',
};

/** Ce qu'une correction a changé, d'après l'avant/après du journal d'audit. */
export function changements(avant: unknown, apres: unknown): string[] {
  const a = avant && typeof avant === 'object' ? (avant as Record<string, unknown>) : {};
  const b = apres && typeof apres === 'object' ? (apres as Record<string, unknown>) : {};
  return Object.entries(CHAMPS_SUIVIS)
    .filter(([k]) => JSON.stringify(a[k] ?? null) !== JSON.stringify(b[k] ?? null))
    .map(([, libelle]) => libelle);
}
