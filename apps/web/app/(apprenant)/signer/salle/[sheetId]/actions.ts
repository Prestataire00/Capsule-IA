'use server';

import { randomUUID } from 'node:crypto';
import { cookies } from 'next/headers';
import { env } from '@/env.mjs';
import { checkRoomPass, learnerCookie, LEARNER_COOKIE_MS } from '@/features/attendance/room-code';
import { DEVICE_COOKIE, LEARNER_COOKIE, admitInRoom, findExpectedLearnerByName, loadRoomSheet } from '@/features/attendance/room';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const UN_AN_S = 365 * 24 * 60 * 60;

export type IdentifyResult = { ok: true; path: string } | { ok: false; error: string };

/**
 * Identification en salle, après un scan valide (laissez-passer de dix minutes).
 * Le nom et le prénom doivent être ceux d'un apprenant attendu sur la séance —
 * l'e-mail ne convenait pas, un stagiaire pouvant être inscrit sans adresse.
 * Le téléphone reçoit un identifiant d'appareil (qui le lie à cette personne
 * pour la feuille) et le cookie qui évitera de se ressaisir aux scans suivants.
 */
export async function identifyInRoom(input: {
  sheetId: string;
  pass: string;
  prenom: string;
  nom: string;
}): Promise<IdentifyResult> {
  if (
    typeof input?.sheetId !== 'string' ||
    !UUID.test(input.sheetId) ||
    typeof input.prenom !== 'string' ||
    typeof input.nom !== 'string'
  ) {
    return { ok: false, error: 'invalid_payload' };
  }
  const prenom = input.prenom.trim();
  const nom = input.nom.trim();
  if (prenom.length === 0 || nom.length === 0 || prenom.length > 120 || nom.length > 120) {
    return { ok: false, error: 'room_name_invalid' };
  }
  if (!checkRoomPass(env.TOKEN_SIGNING_KEY, input.sheetId, input.pass, Date.now())) return { ok: false, error: 'room_pass_expired' };

  const sheet = await loadRoomSheet(input.sheetId);
  if (!sheet) return { ok: false, error: 'attendance_sheet_not_found' };
  const trouve = await findExpectedLearnerByName(sheet.sessionId, { prenom, nom });
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
