// apps/web/features/attendance/queries/load-session-emargement.ts
import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '@/shared/lib/supabase/admin';
import { halfDayWindow, type HalfDay } from '@/features/attendance/half-day-window';
import {
  isAttested,
  isSelfSigned,
  participantState,
  sheetReady,
  type AttendanceStatus,
  type ParticipantState,
  type SignatureFacts,
} from '@/features/attendance/completeness';

/**
 * Séance, feuilles demi-journée et, pour chaque feuille, TOUS les participants
 * attendus — signés ou non — avec leur entrée, leur sortie et leur statut.
 *
 * Lecture de la séance et des feuilles sous RLS (le client de la page) : c'est
 * ce qui borne l'accès. Les participants attendus et leurs noms sont ensuite
 * lus en service role (fonction réservée), pour la séance ainsi autorisée.
 */

export type ParticipantRow = {
  readonly id: string;
  readonly kind: 'learner' | 'trainer';
  readonly fullName: string;
  readonly email: string | null;
  readonly expected: boolean;
  readonly status: AttendanceStatus | null;
  /** Entrée signée par la personne. */
  readonly entryAt: string | null;
  /** Présence attestée sans signature (équipe, Zoom). */
  readonly attestedAt: string | null;
  readonly exitAt: string | null;
  /** Sortie attestée par l'équipe (l'apprenant avait oublié de signer). */
  readonly exitAttested: boolean;
  readonly lateArrival: string | null;
  readonly earlyDeparture: string | null;
  readonly absenceReason: string | null;
  readonly captureMode: string | null;
  readonly state: ParticipantState;
};

export type SheetView = {
  readonly id: string;
  readonly halfDay: HalfDay;
  readonly windowStart: string;
  readonly windowEnd: string;
  readonly finalized: boolean;
  readonly documentId: string | null;
  readonly participants: ParticipantRow[];
  readonly ready: boolean;
};

export type SessionEmargementView = {
  session: {
    id: string;
    dossierId: string | null;
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

type SignatureRow = {
  participant_kind: 'learner' | 'trainer';
  learner_id: string | null;
  trainer_id: string | null;
  status: AttendanceStatus;
  signed_at: string | null;
  exit_signed_at: string | null;
  exit_attested_by?: string | null;
  capture_mode: string | null;
  evidence_source: string | null;
  late_arrival_time: string | null;
  early_departure_time: string | null;
  absence_reason: string | null;
};
type SheetRow = {
  id: string;
  half_day: HalfDay | null;
  status: string;
  finalized_at: string | null;
  document_id: string | null;
  signatures: SignatureRow[] | null;
};

const cle = (kind: string, id: string) => `${kind}:${id}`;
const hhmm = (t: string | null) => (t ? t.slice(0, 5) : null);

export async function loadSessionEmargement(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sb: SupabaseClient<any, any, any>,
  sessionId: string,
): Promise<SessionEmargementView> {
  const { data: sessionData, error: sessionError } = await sb
    .schema('app')
    .from('sessions')
    .select('id, dossier_id, organization_id, title, starts_at, ends_at, modality, location')
    .eq('id', sessionId)
    .maybeSingle();
  if (sessionError) throw sessionError;
  if (!sessionData) return null;
  const s = sessionData as {
    id: string; dossier_id: string | null; organization_id: string; title: string | null;
    starts_at: string; ends_at: string; modality: string; location: string | null;
  };

  const { data: sheetsData, error: sheetsError } = await sb
    .schema('app')
    .from('attendance_sheets')
    .select(
      'id, half_day, status, finalized_at, document_id, signatures:attendance_signatures(participant_kind, learner_id, trainer_id, status, signed_at, exit_signed_at, exit_attested_by, capture_mode, evidence_source, late_arrival_time, early_departure_time, absence_reason)',
    )
    .eq('session_id', sessionId);
  if (sheetsError) throw sheetsError;
  const sheetRows = (sheetsData ?? []) as unknown as SheetRow[];

  // Participants attendus (apprenants dérivés des dossiers inclus, retirés exclus).
  const admin = supabaseAdmin();
  const attendus = new Map<string, { kind: 'learner' | 'trainer'; id: string }>();
  const { data: expectedData, error: expectedError } = await admin
    .schema('app')
    .rpc('session_expected_signers' as never, { p_session_id: sessionId } as never);
  if (expectedError) {
    // Migration 0145 absente : repli sur les participants inscrits.
    const { data: parts } = await sb
      .schema('app')
      .from('session_participants')
      .select('participant_kind, learner_id, trainer_id, source')
      .eq('session_id', sessionId);
    for (const p of (parts ?? []) as { participant_kind: 'learner' | 'trainer'; learner_id: string | null; trainer_id: string | null; source?: string }[]) {
      const id = p.learner_id ?? p.trainer_id;
      if (id && p.source !== 'manual_remove') attendus.set(cle(p.participant_kind, id), { kind: p.participant_kind, id });
    }
  } else {
    for (const e of (expectedData ?? []) as { participant_kind: 'learner' | 'trainer'; participant_id: string }[]) {
      attendus.set(cle(e.participant_kind, e.participant_id), { kind: e.participant_kind, id: e.participant_id });
    }
  }

  // Signataires présents sur une feuille sans être (ou plus être) attendus : la preuve reste visible.
  const tous = new Map(attendus);
  for (const sh of sheetRows) {
    for (const g of sh.signatures ?? []) {
      const id = g.learner_id ?? g.trainer_id;
      if (id && !tous.has(cle(g.participant_kind, id))) tous.set(cle(g.participant_kind, id), { kind: g.participant_kind, id });
    }
  }

  const ids = (kind: 'learner' | 'trainer') => [...tous.values()].filter((p) => p.kind === kind).map((p) => p.id);
  const [learnersRes, trainersRes] = await Promise.all([
    ids('learner').length
      ? admin.schema('app').from('learners').select('id, first_name, last_name, email').in('id', ids('learner'))
      : Promise.resolve({ data: [] }),
    ids('trainer').length
      ? admin.schema('app').from('trainers').select('id, first_name, last_name, email').in('id', ids('trainer'))
      : Promise.resolve({ data: [] }),
  ]);
  type Personne = { id: string; first_name: string | null; last_name: string | null; email: string | null };
  const personnes = new Map<string, Personne>();
  for (const p of (learnersRes.data ?? []) as Personne[]) personnes.set(cle('learner', p.id), p);
  for (const p of (trainersRes.data ?? []) as Personne[]) personnes.set(cle('trainer', p.id), p);

  const debut = new Date(s.starts_at);
  const fin = new Date(s.ends_at);
  // Fenêtres calculées par la base (pause déjeuner de l'organisme) ; repli local.
  const fenetres = new Map<string, { start: Date; end: Date }>();
  const { data: fenData } = await admin.schema('app').rpc('attendance_session_windows' as never, { p_session_id: sessionId } as never);
  for (const f of (fenData ?? []) as { sheet_id: string; window_start: string; window_end: string }[]) {
    fenetres.set(f.sheet_id, { start: new Date(f.window_start), end: new Date(f.window_end) });
  }

  const sheets: SheetView[] = sheetRows
    .map((sheet) => {
      const halfDay: HalfDay = sheet.half_day ?? 'full';
      const fenetre = fenetres.get(sheet.id) ?? halfDayWindow(debut, fin, halfDay);
      const parSignataire = new Map<string, SignatureRow>();
      for (const g of sheet.signatures ?? []) {
        const id = g.learner_id ?? g.trainer_id;
        if (id) parSignataire.set(cle(g.participant_kind, id), g);
      }

      const participants: ParticipantRow[] = [...tous.entries()]
        .filter(([k]) => attendus.has(k) || parSignataire.has(k))
        .map(([k, p]) => {
          const g = parSignataire.get(k) ?? null;
          const faits: SignatureFacts | null = g
            ? {
                status: g.status,
                signedAt: g.signed_at,
                exitSignedAt: g.exit_signed_at,
                captureMode: g.capture_mode,
                evidenceSource: g.evidence_source,
                earlyDeparture: g.early_departure_time,
              }
            : null;
          const personne = personnes.get(k);
          return {
            id: p.id,
            kind: p.kind,
            fullName: personne ? `${personne.first_name ?? ''} ${personne.last_name ?? ''}`.trim() || 'Sans nom' : 'Participant inconnu',
            email: personne?.email ?? null,
            expected: attendus.has(k),
            status: g?.status ?? null,
            entryAt: faits && isSelfSigned(faits) ? faits.signedAt : null,
            attestedAt: faits && isAttested(faits) ? faits.signedAt : null,
            exitAt: g?.exit_signed_at ?? null,
            exitAttested: Boolean(g?.exit_attested_by),
            lateArrival: hhmm(g?.late_arrival_time ?? null),
            earlyDeparture: hhmm(g?.early_departure_time ?? null),
            absenceReason: g?.absence_reason ?? null,
            captureMode: g?.capture_mode ?? null,
            state: participantState(p.kind, faits),
          };
        })
        .sort((a, b) => (a.kind === b.kind ? a.fullName.localeCompare(b.fullName, 'fr') : a.kind === 'trainer' ? -1 : 1));

      return {
        id: sheet.id,
        halfDay,
        windowStart: fenetre.start.toISOString(),
        windowEnd: fenetre.end.toISOString(),
        finalized: sheet.finalized_at != null || sheet.status === 'finalized',
        documentId: sheet.document_id,
        participants,
        ready: sheetReady(participants.filter((p) => p.expected).map((p) => p.state)),
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
