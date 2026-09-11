import { createHmac, timingSafeEqual } from 'node:crypto';
import { ROTATION_MS } from '@/features/attendance/room-live';

/**
 * Émargement en salle (modèle Edusign) : QR code tournant projeté par le
 * formateur, laissez-passer d'identification et cookie de l'apprenant.
 *
 * Fonctions pures (clé et horloge en paramètres) : testables sans serveur.
 *
 * Le code change toutes les dix secondes et n'est accepté que vingt secondes
 * au plus : une photo du QR envoyée à un absent est périmée avant d'arriver.
 */

export { ROTATION_MS };
const TOLERANCE_SLOTS = 1;
export const PASS_MS = 10 * 60_000;
export const LEARNER_COOKIE_MS = 90 * 24 * 60 * 60_000;

const mac = (key: string, data: string) => createHmac('sha256', `salle:${key}`).update(data).digest('base64url');

const egal = (a: string, b: string) => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

export const roomSlot = (now: number) => Math.floor(now / ROTATION_MS);

export const roomCode = (key: string, sheetId: string, slot: number) => mac(key, `code|${sheetId}|${slot}`).slice(0, 22);

/** Instant du prochain changement de code. */
export const nextRotation = (now: number) => (roomSlot(now) + 1) * ROTATION_MS;

export function checkRoomCode(key: string, sheetId: string, code: unknown, now: number): boolean {
  if (typeof code !== 'string' || code.length !== 22) return false;
  const slot = roomSlot(now);
  for (let i = 0; i <= TOLERANCE_SLOTS; i++) if (egal(roomCode(key, sheetId, slot - i), code)) return true;
  return false;
}

/** Laissez-passer remis après un scan valide : le temps de saisir son e-mail. */
export function roomPass(key: string, sheetId: string, now: number): string {
  const exp = now + PASS_MS;
  return `${exp}.${mac(key, `pass|${sheetId}|${exp}`)}`;
}

export function checkRoomPass(key: string, sheetId: string, pass: unknown, now: number): boolean {
  if (typeof pass !== 'string' || pass.length > 100) return false;
  const [expTxt, sig] = pass.split('.');
  const exp = Number(expTxt);
  if (!sig || !Number.isFinite(exp) || exp < now || exp > now + PASS_MS) return false;
  return egal(mac(key, `pass|${sheetId}|${exp}`), sig);
}

/** Cookie « cet appareil appartient à tel apprenant », pour les scans suivants. */
export function learnerCookie(key: string, learnerId: string, now: number): string {
  const exp = now + LEARNER_COOKIE_MS;
  return `${learnerId}.${exp}.${mac(key, `apprenant|${learnerId}|${exp}`)}`;
}

export function readLearnerCookie(key: string, value: unknown, now: number): string | null {
  if (typeof value !== 'string' || value.length > 200) return null;
  const [learnerId, expTxt, sig] = value.split('.');
  const exp = Number(expTxt);
  if (!learnerId || !sig || !Number.isFinite(exp) || exp < now) return null;
  return egal(mac(key, `apprenant|${learnerId}|${exp}`), sig) ? learnerId : null;
}

/** « Anissa Fiévé » → « Anissa F. » : assez pour se reconnaître à l'écran. */
export function nomProjete(fullName: string): string {
  const mots = fullName.trim().split(/\s+/);
  if (mots.length < 2) return mots[0] ?? '';
  return `${mots[0]} ${mots[mots.length - 1]!.charAt(0).toUpperCase()}.`;
}
