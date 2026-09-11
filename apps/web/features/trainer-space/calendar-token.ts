import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Jeton de l'abonnement calendrier d'un formateur : l'identifiant du compte,
 * signé. Il ne donne accès qu'à l'agenda de ses séances (titres, horaires,
 * lieux) — aucune donnée d'apprenant. Fonctions pures.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const mac = (key: string, userId: string) => createHmac('sha256', `calendrier:${key}`).update(userId).digest('base64url').slice(0, 32);

export const calendarToken = (key: string, userId: string) => `${userId}.${mac(key, userId)}`;

export function readCalendarToken(key: string, token: unknown): string | null {
  if (typeof token !== 'string' || token.length > 120) return null;
  const i = token.lastIndexOf('.');
  const userId = token.slice(0, i);
  const signature = token.slice(i + 1);
  if (i < 0 || !UUID.test(userId)) return null;
  const attendu = Buffer.from(mac(key, userId));
  const recu = Buffer.from(signature);
  return attendu.length === recu.length && timingSafeEqual(attendu, recu) ? userId : null;
}
