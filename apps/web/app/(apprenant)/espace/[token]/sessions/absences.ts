import 'server-only';
import { verifyApprenantToken } from '@/shared/lib/apprenant-token';
import { supabaseAdmin } from '@/shared/lib/supabase/admin';

export type AbsenceItem = {
  readonly sheetId: string;
  readonly startsAt: string;
  readonly halfDay: string;
  readonly excused: boolean;
  readonly justifications: readonly { id: string; fileName: string; decision: string; createdAt: string }[];
};

/**
 * Absences de l'apprenant sur ses séances passées : noté absent, ou feuille
 * clôturée sans aucune présence. Chacune peut recevoir un justificatif.
 */
export async function loadAbsences(token: string): Promise<AbsenceItem[]> {
  const verified = await verifyApprenantToken(token);
  if (!verified.ok) return [];
  const { learnerId, dossierId } = verified.value;
  const admin = supabaseAdmin();

  const [direct, jonction] = await Promise.all([
    admin.schema('app').from('sessions').select('id').eq('dossier_id', dossierId),
    admin.schema('app').from('session_dossiers' as never).select('session_id').eq('dossier_id' as never, dossierId as never),
  ]);
  const ids = new Set<string>();
  for (const r of (direct.data ?? []) as { id: string }[]) ids.add(r.id);
  for (const r of (jonction.data ?? []) as { session_id: string }[]) ids.add(r.session_id);
  if (ids.size === 0) return [];

  const { data: seances } = await admin
    .schema('app')
    .from('sessions')
    .select('id, starts_at')
    .in('id', [...ids])
    .lt('starts_at', new Date().toISOString());
  const debut = new Map(((seances ?? []) as { id: string; starts_at: string }[]).map((s) => [s.id, s.starts_at]));
  if (debut.size === 0) return [];

  const { data: feuilles } = await admin
    .schema('app')
    .from('attendance_sheets')
    .select('id, session_id, half_day, status')
    .in('session_id', [...debut.keys()]);
  const rows = (feuilles ?? []) as { id: string; session_id: string; half_day: string | null; status: string }[];
  if (rows.length === 0) return [];
  const sheetIds = rows.map((r) => r.id);

  const [{ data: sigs }, { data: justifs }] = await Promise.all([
    admin
      .schema('app')
      .from('attendance_signatures')
      .select('attendance_sheet_id, status, signed_at')
      .in('attendance_sheet_id', sheetIds)
      .eq('participant_kind', 'learner')
      .eq('learner_id', learnerId),
    admin
      .schema('app')
      .from('attendance_justifications' as never)
      .select('id, attendance_sheet_id, file_name, decision, created_at')
      .in('attendance_sheet_id' as never, sheetIds as never)
      .eq('learner_id' as never, learnerId as never)
      .order('created_at' as never, { ascending: true }),
  ]);
  const parFeuille = new Map(((sigs ?? []) as { attendance_sheet_id: string; status: string; signed_at: string | null }[]).map((s) => [s.attendance_sheet_id, s]));
  const pieces = new Map<string, AbsenceItem['justifications'][number][]>();
  for (const j of (justifs ?? []) as { id: string; attendance_sheet_id: string; file_name: string; decision: string; created_at: string }[]) {
    pieces.set(j.attendance_sheet_id, [...(pieces.get(j.attendance_sheet_id) ?? []), { id: j.id, fileName: j.file_name, decision: j.decision, createdAt: j.created_at }]);
  }

  return rows
    .filter((r) => {
      const s = parFeuille.get(r.id);
      const noteAbsent = s?.status === 'absent' || s?.status === 'absent_justified';
      const rienSurFeuilleClose = r.status === 'finalized' && (!s || (!s.signed_at && s.status !== 'present' && s.status !== 'late'));
      return noteAbsent || rienSurFeuilleClose || pieces.has(r.id);
    })
    .map((r) => ({
      sheetId: r.id,
      startsAt: debut.get(r.session_id) ?? '',
      halfDay: r.half_day ?? 'full',
      excused: parFeuille.get(r.id)?.status === 'absent_justified',
      justifications: pieces.get(r.id) ?? [],
    }))
    .sort((a, b) => b.startsAt.localeCompare(a.startsAt));
}
