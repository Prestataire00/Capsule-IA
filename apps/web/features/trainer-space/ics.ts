/**
 * Calendrier iCalendar (RFC 5545) des séances d'un formateur, pour l'abonnement
 * depuis Google Agenda, Apple Calendrier ou Outlook. Fonctions pures.
 */

export type IcsEvent = {
  readonly uid: string;
  readonly start: Date;
  readonly end: Date;
  readonly summary: string;
  readonly location?: string | null;
  readonly description?: string | null;
  readonly url?: string | null;
  readonly cancelled?: boolean;
};

export const echapperIcs = (t: string) =>
  t.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

/** Horodatage UTC « AAAAMMJJTHHMMSSZ ». */
export const horodatageIcs = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

/** Lignes de 75 octets au plus ; les suivantes commencent par une espace. */
export function plierLigne(ligne: string): string {
  const morceaux: string[] = [];
  let courant = '';
  let limite = 75;
  for (const car of ligne) {
    if (Buffer.byteLength(courant + car) > limite) {
      morceaux.push(courant);
      courant = ' ';
      limite = 75;
    }
    courant += car;
  }
  morceaux.push(courant);
  return morceaux.join('\r\n');
}

export function buildIcs(nom: string, evenements: readonly IcsEvent[], now = new Date()): string {
  const lignes = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Capsule IA//Espace formateur//FR',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${echapperIcs(nom)}`,
    'X-WR-TIMEZONE:Europe/Paris',
  ];
  for (const e of evenements) {
    lignes.push(
      'BEGIN:VEVENT',
      `UID:${e.uid}`,
      `DTSTAMP:${horodatageIcs(now)}`,
      `DTSTART:${horodatageIcs(e.start)}`,
      `DTEND:${horodatageIcs(e.end)}`,
      `SUMMARY:${echapperIcs(e.summary)}`,
    );
    if (e.location) lignes.push(`LOCATION:${echapperIcs(e.location)}`);
    if (e.description) lignes.push(`DESCRIPTION:${echapperIcs(e.description)}`);
    if (e.url) lignes.push(`URL:${e.url}`);
    lignes.push(`STATUS:${e.cancelled ? 'CANCELLED' : 'CONFIRMED'}`, 'END:VEVENT');
  }
  lignes.push('END:VCALENDAR');
  return `${lignes.map(plierLigne).join('\r\n')}\r\n`;
}
