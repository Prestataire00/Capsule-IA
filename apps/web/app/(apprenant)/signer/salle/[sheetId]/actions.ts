'use server';

import { randomUUID } from 'node:crypto';
import { cookies } from 'next/headers';
import { env } from '@/env.mjs';
import { checkRoomPass, learnerCookie, LEARNER_COOKIE_MS } from '@/features/attendance/room-code';
import { DEVICE_COOKIE, LEARNER_COOKIE, admitInRoom, findExpectedLearnerByName, loadRoomSheet } from '@/features/attendance/room';
import { inscrireLeJourJ } from '@/features/attendance/inscrire-jour-j';
import { supabaseAdmin } from '@/shared/lib/supabase/admin';
import { membresParRole } from '@/features/trainer-space/validation-recipients';

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
  /**
   * « Je ne suis pas sur la liste » : il s'inscrit lui-même, en salle (point
   * Capsule IA du 05/10/2026). Le laissez-passer du QR, qui tourne toutes les
   * dix secondes, garantit qu'il est devant l'écran ; l'équipe est prévenue
   * pour régulariser (dossier, convention, facture).
   */
  ajouter?: boolean;
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
  let trouve = await findExpectedLearnerByName(sheet.sessionId, { prenom, nom });
  if (!trouve.ok && trouve.error === 'room_name_unknown' && input.ajouter === true) {
    const ajout = await sInscrireEnSalle(sheet.sessionId, prenom, nom);
    if (!ajout.ok) return ajout;
    trouve = { ok: true, learnerId: ajout.learnerId };
  }
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

async function sInscrireEnSalle(sessionId: string, prenom: string, nom: string): Promise<{ ok: true; learnerId: string } | { ok: false; error: string }> {
  const admin = supabaseAdmin();
  const { data: s } = await admin.schema('app').from('sessions').select('organization_id, status').eq('id', sessionId).maybeSingle();
  const seance = s as { organization_id: string; status: string } | null;
  if (!seance || seance.status === 'cancelled') return { ok: false, error: 'attendance_sheet_not_found' };
  const r = await inscrireLeJourJ(admin, { sessionId, organizationId: seance.organization_id, prenom, nom, email: null });
  if (!r.ok) return { ok: false, error: 'room_self_add_failed' };

  // L'équipe régularise : dossier, convention, facture.
  const equipe = await membresParRole(admin, seance.organization_id, ['owner', 'admin', 'gestionnaire']);
  if (equipe.length > 0) {
    const { error } = await admin
      .schema('app')
      .from('notifications')
      .insert(
        equipe.map((m) => ({
          organization_id: seance.organization_id,
          channel: 'in_app',
          template_code: 'emargement.ajout_jour_j',
          recipient_user_id: m.userId,
          subject: `${prenom} ${nom} s’est ajouté en scannant le QR — à régulariser`,
          payload: { session_id: sessionId, learner_id: r.learnerId, dossier_id: r.dossierId, par: 'qr' },
          status: 'sent',
          sent_at: new Date().toISOString(),
          related_aggregate_type: 'session',
          related_aggregate_id: sessionId,
        })) as never,
      );
    if (error) console.error('[émargement] équipe non prévenue de l’ajout au scan', error.message);
  }
  return { ok: true, learnerId: r.learnerId };
}

/** « Ce n'est pas moi » : oublie l'apprenant, pas l'appareil (qui reste lié à la feuille). */
export async function forgetRoomIdentity(): Promise<void> {
  cookies().delete({ name: LEARNER_COOKIE, path: '/signer' });
}
