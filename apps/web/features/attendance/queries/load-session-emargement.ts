// apps/web/features/attendance/queries/load-session-emargement.ts
import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { HalfDay } from '@/features/attendance/domain/half-day';
import type { ParticipantItem } from '@/app/(dashboard)/dossiers/[id]/emargements/[sessionId]/participants-list';

export type SheetView = {
  id: string;
  halfDay: HalfDay;
  finalized: boolean;
  documentId: string | null;
  participants: ParticipantItem[];
  allSigned: boolean;
};

export type SessionEmargementView = {
  session: {
    id: string;
    dossierId: string;
    organizationId: string;
    title: string | null;
    startsAt: string;
    endsAt: string;
    modality: string;
    location: string | null;
  };
  sheets: SheetView[];
} | null;

const HALF_DAY_ORDER: Record<string, number> = { morning: 0, afternoon: 1, full: 2, evening: 3 };

type ParticipantRow = {
  participant_kind: 'learner' | 'trainer';
  learner_id: string | null;
  trainer_id: string | null;
  learner: { first_name: string; last_name: string; email: string | null } | null;
  trainer: { first_name: string; last_name: string; email: string | null } | null;
};
type SignatureRow = {
  participant_kind: 'learner' | 'trainer';
  learner_id: string | null;
  trainer_id: string | null;
  signed_at: string | null;
};
type SheetRow = {
  id: string;
  half_day: HalfDay;
  status: string;
  finalized_at: string | null;
  document_id: string | null;
  signatures: SignatureRow[] | null;
};

/** Charge la séance + ses feuilles demi-journée + participants + état de signature. */
export async function loadSessionEmargement(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sb: SupabaseClient<any, any, any>,
  sessionId: string,
): Promise<SessionEmargementView> {
  const { data: sessionData } = await sb
    .schema('app')
    .from('sessions')
    .select('id, dossier_id, organization_id, title, starts_at, ends_at, modality, location')
    .eq('id', sessionId)
    .maybeSingle();
  if (!sessionData) return null;
  const s = sessionData as {
    id: string; dossier_id: string; organization_id: string; title: string | null;
    starts_at: string; ends_at: string; modality: string; location: string | null;
  };

  const [{ data: sheetsData }, { data: partsData }] = await Promise.all([
    sb
      .schema('app')
      .from('attendance_sheets')
      .select('id, half_day, status, finalized_at, document_id, signatures:attendance_signatures(participant_kind, learner_id, trainer_id, signed_at)')
      .eq('session_id', sessionId),
    sb
      .schema('app')
      .from('session_participants')
      .select('participant_kind, learner_id, trainer_id, learner:learners(first_name,last_name,email), trainer:trainers(first_name,last_name,email)')
      .eq('session_id', sessionId),
  ]);

  const parts = ((partsData ?? []) as unknown as ParticipantRow[]).map((p) => {
    const isLearner = p.participant_kind === 'learner';
    const person = isLearner ? p.learner : p.trainer;
    return {
      id: (isLearner ? p.learner_id : p.trainer_id) ?? '',
      kind: p.participant_kind,
      fullName: person ? `${person.first_name} ${person.last_name}` : 'Participant inconnu',
      email: person?.email ?? null,
    };
  });

  const sheets: SheetView[] = ((sheetsData ?? []) as unknown as SheetRow[])
    .map((sheet) => {
      const sigs = sheet.signatures ?? [];
      const isSigned = (kind: 'learner' | 'trainer', id: string) =>
        sigs.some(
          (g) => g.participant_kind === kind && (kind === 'learner' ? g.learner_id : g.trainer_id) === id && g.signed_at != null,
        );
      const participants: ParticipantItem[] = parts.map((p) => ({
        id: p.id,
        kind: p.kind,
        fullName: p.fullName,
        email: p.email,
        signed: p.id !== '' && isSigned(p.kind, p.id),
      }));
      return {
        id: sheet.id,
        halfDay: sheet.half_day,
        finalized: sheet.finalized_at != null || sheet.status === 'finalized',
        documentId: sheet.document_id,
        participants,
        allSigned: participants.length > 0 && participants.every((p) => p.signed),
      };
    })
    .sort((a, b) => (HALF_DAY_ORDER[a.halfDay] ?? 9) - (HALF_DAY_ORDER[b.halfDay] ?? 9));

  return {
    session: {
      id: s.id, dossierId: s.dossier_id, organizationId: s.organization_id, title: s.title,
      startsAt: s.starts_at, endsAt: s.ends_at, modality: s.modality, location: s.location,
    },
    sheets,
  };
}
