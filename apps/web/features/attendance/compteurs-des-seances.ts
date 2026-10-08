import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '@/shared/lib/supabase/admin';
import { additionner, compteurSignatures, type Compteur, type ParticipantCompte } from './compteur-signatures';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const admin = () => supabaseAdmin() as unknown as SupabaseClient<any, any, any>;

/**
 * Le récapitulatif d'émargement de plusieurs séances, pour une liste : par
 * séance, signatures reçues sur attendues, toutes demi-journées confondues.
 * L'appelant a lu ces séances sous ses droits.
 */
export async function compteursDesSeances(sessionIds: readonly string[]): Promise<Map<string, Compteur>> {
  const out = new Map<string, Compteur>();
  if (sessionIds.length === 0) return out;
  const sb = admin();
  const { data: f } = await sb.schema('app').from('attendance_sheets').select('id, session_id').in('session_id', [...sessionIds]);
  const feuilles = (f ?? []) as Array<{ id: string; session_id: string }>;
  const { data: g } = feuilles.length
    ? await sb
        .schema('app')
        .from('attendance_signatures')
        .select('attendance_sheet_id, participant_kind, participant_id, status, signed_at, exit_signed_at, exit_attested_by')
        .in('attendance_sheet_id', feuilles.map((x) => x.id))
    : { data: [] };
  const signatures = (g ?? []) as Array<{
    attendance_sheet_id: string;
    participant_kind: 'learner' | 'trainer';
    participant_id: string;
    status: string | null;
    signed_at: string | null;
    exit_signed_at: string | null;
    exit_attested_by: string | null;
  }>;

  await Promise.all(
    sessionIds.map(async (sessionId) => {
      const { data: e } = await sb.schema('app').rpc('session_expected_signers', { p_session_id: sessionId });
      const attendus = (e ?? []) as Array<{ participant_kind: 'learner' | 'trainer'; participant_id: string }>;
      const compteurs = feuilles
        .filter((x) => x.session_id === sessionId)
        .map((feuille) =>
          compteurSignatures(
            attendus.map((a): ParticipantCompte => {
              const s = signatures.find((x) => x.attendance_sheet_id === feuille.id && x.participant_kind === a.participant_kind && x.participant_id === a.participant_id);
              const state = s?.status === 'absent' ? 'absent' : s?.status === 'absent_justified' ? 'excuse' : 'a_signer';
              return {
                kind: a.participant_kind,
                expected: true,
                state,
                entryAt: s?.signed_at ?? null,
                attestedAt: null,
                exitAt: s?.exit_signed_at ?? null,
                exitAttested: Boolean(s?.exit_attested_by),
              };
            }),
          ),
        );
      if (compteurs.length) out.set(sessionId, additionner(compteurs));
    }),
  );
  return out;
}
