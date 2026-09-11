'use server';

import { randomUUID } from 'node:crypto';
import { cookies } from 'next/headers';
import { env } from '@/env.mjs';
import { checkRoomPass, learnerCookie, LEARNER_COOKIE_MS } from '@/features/attendance/room-code';
import { DEVICE_COOKIE, LEARNER_COOKIE, admitInRoom, findExpectedLearnerByEmail, loadRoomSheet } from '@/features/attendance/room';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UN_AN_S = 365 * 24 * 60 * 60;

export type IdentifyResult = { ok: true; path: string } | { ok: false; error: string };

/**
 * Identification en salle, après un scan valide (laissez-passer de dix minutes).
 * L'e-mail doit être celui d'un apprenant attendu sur la séance. Le téléphone
 * reçoit un identifiant d'appareil (qui le lie à cette personne pour la
 * feuille) et le cookie qui évitera de ressaisir l'e-mail aux scans suivants.
 */
export async function identifyInRoom(input: { sheetId: string; pass: string; email: string }): Promise<IdentifyResult> {
  if (typeof input?.sheetId !== 'string' || !UUID.test(input.sheetId) || typeof input.email !== 'string') {
    return { ok: false, error: 'invalid_payload' };
  }
  const email = input.email.trim();
  if (email.length > 254 || !EMAIL.test(email)) return { ok: false, error: 'room_email_invalid' };
  if (!checkRoomPass(env.TOKEN_SIGNING_KEY, input.sheetId, input.pass, Date.now())) return { ok: false, error: 'room_pass_expired' };

  const sheet = await loadRoomSheet(input.sheetId);
  if (!sheet) return { ok: false, error: 'attendance_sheet_not_found' };
  const trouve = await findExpectedLearnerByEmail(sheet.sessionId, email);
  if (!trouve.ok) return trouve;

  const jar = cookies();
  const existant = jar.get(DEVICE_COOKIE)?.value;
  const deviceId = existant && UUID.test(existant) ? existant : randomUUID();
  const options = { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax' as const, path: '/signer' };
  jar.set(DEVICE_COOKIE, deviceId, { ...options, maxAge: UN_AN_S });

  const r = await admitInRoom({ sheet, learnerId: trouve.learnerId, deviceId });
  if (!r.ok) return r;
  jar.set(LEARNER_COOKIE, learnerCookie(env.TOKEN_SIGNING_KEY, trouve.learnerId, Date.now()), {
    ...options,
    maxAge: Math.floor(LEARNER_COOKIE_MS / 1000),
  });
  return r;
}

/** « Ce n'est pas moi » : oublie l'apprenant, pas l'appareil (qui reste lié à la feuille). */
export async function forgetRoomIdentity(): Promise<void> {
  cookies().delete({ name: LEARNER_COOKIE, path: '/signer' });
}
