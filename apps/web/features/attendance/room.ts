import 'server-only';
import { env } from '@/env.mjs';
import { supabaseAdmin } from '@/shared/lib/supabase/admin';
import { issueAttendanceLink } from '@/features/attendance/issue-attendance-link';
import { roomCode, roomSlot } from '@/features/attendance/room-code';

/**
 * Émargement en salle : admission d'un apprenant qui a scanné le QR projeté.
 *
 * L'apprenant doit être attendu sur la séance, et un même téléphone ne peut
 * émarger qu'une personne par feuille (un apprenant ne signe pas pour son
 * voisin). L'admission délivre un lien de signature du canal « salle ».
 */

export const DEVICE_COOKIE = 'capsule_appareil';
export const LEARNER_COOKIE = 'capsule_emargement';

export const roomUrl = (baseUrl: string, sheetId: string, now: number) =>
  `${baseUrl.replace(/\/$/, '')}/signer/salle/${sheetId}?c=${roomCode(env.TOKEN_SIGNING_KEY, sheetId, roomSlot(now))}`;

export type RoomSheet = {
  readonly id: string;
  readonly sessionId: string;
  readonly finalized: boolean;
  readonly formationTitle: string;
  readonly halfDay: string;
  readonly organizationName: string;
};

export async function loadRoomSheet(sheetId: string): Promise<RoomSheet | null> {
  const { data } = await supabaseAdmin()
    .schema('app')
    .from('attendance_sheets')
    .select('id, session_id, status, finalized_at, half_day, sessions(title, formation:formations(title)), organizations(name)')
    .eq('id', sheetId)
    .maybeSingle();
  const r = data as unknown as {
    id: string;
    session_id: string;
    status: string;
    finalized_at: string | null;
    half_day: string | null;
    sessions: { title: string | null; formation: { title: string } | null } | null;
    organizations: { name: string } | null;
  } | null;
  if (!r) return null;
  return {
    id: r.id,
    sessionId: r.session_id,
    finalized: r.status === 'finalized' || r.finalized_at != null,
    formationTitle: r.sessions?.formation?.title ?? r.sessions?.title ?? 'Formation',
    halfDay: r.half_day ?? 'full',
    organizationName: r.organizations?.name ?? '',
  };
}

async function apprenantsAttendus(sessionId: string): Promise<string[]> {
  const { data } = await supabaseAdmin().schema('app').rpc('session_expected_signers' as never, { p_session_id: sessionId } as never);
  return ((data ?? []) as { participant_kind: string; participant_id: string }[])
    .filter((e) => e.participant_kind === 'learner')
    .map((e) => e.participant_id);
}

export type FindLearnerResult = { ok: true; learnerId: string } | { ok: false; error: 'room_email_unknown' | 'room_email_ambiguous' };

/** Apprenant attendu sur la séance dont l'e-mail correspond (casse ignorée). */
export async function findExpectedLearnerByEmail(sessionId: string, email: string): Promise<FindLearnerResult> {
  const ids = await apprenantsAttendus(sessionId);
  if (ids.length === 0) return { ok: false, error: 'room_email_unknown' };
  const { data } = await supabaseAdmin().schema('app').from('learners').select('id, email').in('id', ids);
  const cible = email.trim().toLowerCase();
  const trouves = ((data ?? []) as { id: string; email: string | null }[]).filter((l) => l.email?.trim().toLowerCase() === cible);
  if (trouves.length === 0) return { ok: false, error: 'room_email_unknown' };
  if (trouves.length > 1) return { ok: false, error: 'room_email_ambiguous' };
  return { ok: true, learnerId: trouves[0]!.id };
}

export type AdmitResult =
  | { ok: true; path: string }
  | { ok: false; error: 'room_not_expected' | 'room_device_used' | 'attendance_sheet_finalized' | 'register_failed' | 'public_app_url_missing' };

export async function admitInRoom(input: { sheet: RoomSheet; learnerId: string; deviceId: string }): Promise<AdmitResult> {
  if (!env.PUBLIC_APP_URL) return { ok: false, error: 'public_app_url_missing' };
  if (input.sheet.finalized) return { ok: false, error: 'attendance_sheet_finalized' };
  if (!(await apprenantsAttendus(input.sheet.sessionId)).includes(input.learnerId)) return { ok: false, error: 'room_not_expected' };

  const { data: autre } = await supabaseAdmin()
    .schema('app')
    .from('attendance_token_jtis' as never)
    .select('signer_id')
    .eq('attendance_sheet_id' as never, input.sheet.id as never)
    .eq('issued_channel' as never, 'salle' as never)
    .eq('device_id' as never, input.deviceId as never)
    .neq('signer_id' as never, input.learnerId as never)
    .limit(1);
  if ((autre ?? []).length > 0) return { ok: false, error: 'room_device_used' };

  const r = await issueAttendanceLink({
    sheetId: input.sheet.id,
    signerId: input.learnerId,
    signerKind: 'learner',
    baseUrl: env.PUBLIC_APP_URL,
    channel: 'salle',
    deviceId: input.deviceId,
  });
  if (!r.ok) return { ok: false, error: 'register_failed' };
  return { ok: true, path: new URL(r.link.url).pathname };
}
