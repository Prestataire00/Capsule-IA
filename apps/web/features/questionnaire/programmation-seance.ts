// ARCHETYPE: shared
// Quand part un questionnaire coché sur une séance. Module pur.
//
// Le moment se dit par rapport au début ou à la fin de la séance — « J-7
// début », « J+1 fin » — parce que c'est ainsi qu'on raisonne en le cochant :
// le positionnement avant, la satisfaction après. Une date absolue deviendrait
// fausse au premier report de séance.

import { etapeDuModele } from './cartographie';

export type Ancre = 'debut' | 'fin';
export type Moment = { ancre: Ancre; decalage: number };

/** Les moments proposés à l'écran, dans l'ordre de la formation. */
export const MOMENTS: ReadonlyArray<Moment> = [
  { ancre: 'debut', decalage: -30 },
  { ancre: 'debut', decalage: -14 },
  { ancre: 'debut', decalage: -7 },
  { ancre: 'debut', decalage: -3 },
  { ancre: 'debut', decalage: -1 },
  { ancre: 'debut', decalage: 0 },
  { ancre: 'fin', decalage: 0 },
  { ancre: 'fin', decalage: 1 },
  { ancre: 'fin', decalage: 7 },
  { ancre: 'fin', decalage: 21 },
  { ancre: 'fin', decalage: 30 },
  { ancre: 'fin', decalage: 90 },
];

export const cleMoment = (m: Moment): string => `${m.ancre}:${m.decalage}`;

export function lireCleMoment(cle: string): Moment | null {
  const m = /^(debut|fin):(-?\d{1,3})$/.exec(cle);
  if (!m) return null;
  const decalage = Number(m[2]);
  if (decalage < -90 || decalage > 365) return null;
  return { ancre: m[1] as Ancre, decalage };
}

/** « J-7 début », « Jour du début », « J+1 fin ». */
export function libelleMoment(m: Moment): string {
  if (m.decalage === 0) return m.ancre === 'debut' ? 'Jour du début' : 'Jour de la fin';
  const signe = m.decalage > 0 ? '+' : '-';
  return `J${signe}${Math.abs(m.decalage)} ${m.ancre === 'debut' ? 'début' : 'fin'}`;
}

/**
 * Le moment proposé quand on coche un modèle : celui de son étape. La
 * satisfaction à froid attend que la formation ait porté ses fruits.
 */
export function momentParDefaut(modele: { kind: string; code?: string | null }): Moment {
  if (modele.kind === 'satisfaction_froid') return { ancre: 'fin', decalage: 90 };
  const etape = etapeDuModele(modele);
  if (etape === 'avant') return { ancre: 'debut', decalage: -7 };
  if (etape === 'apres') return { ancre: 'fin', decalage: 1 };
  return { ancre: 'debut', decalage: 0 };
}

const JOUR = 86_400_000;

/**
 * Jour d'envoi (YYYY-MM-DD, calendrier de Paris). Le cron passe une fois par
 * jour : l'heure n'a pas de sens, le jour si — et c'est celui de Paris, sans
 * quoi une séance de 00h30 glisserait sur la veille.
 */
export function jourEnvoi(seance: { startsAt: string; endsAt: string }, m: Moment): string {
  const base = jourParis(m.ancre === 'debut' ? seance.startsAt : seance.endsAt);
  const [y, mo, d] = base.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, mo - 1, d) + m.decalage * JOUR).toISOString().slice(0, 10);
}

const fmtJour = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' });
export const jourParis = (iso: string | Date): string => fmtJour.format(typeof iso === 'string' ? new Date(iso) : iso);

/** À envoyer aujourd'hui (ou en retard : coché après la date, il part au passage suivant). */
export function estDu(seance: { startsAt: string; endsAt: string }, m: Moment, maintenant: Date): boolean {
  return jourEnvoi(seance, m) <= jourParis(maintenant);
}
