import 'server-only';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { supabaseAdmin } from '@/shared/lib/supabase/admin';
import { hasTrainerSpace } from '@/shared/lib/auth/landing';

/**
 * Garde des actions de l'espace formateur sur une séance : compte connecté,
 * fiche formateur ouverte, et séance figurant parmi SES séances
 * (`my_trainer_session_ids`, 0150). Les écritures qui suivent se font en
 * service role, pour cette séance seulement.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type TrainerSessionRef = {
  readonly id: string;
  readonly organization_id: string;
  readonly dossier_id: string | null;
  readonly formation_id: string | null;
  readonly starts_at: string;
  readonly ends_at: string;
};

export type TrainerSessionAccess =
  | { ok: true; userId: string; session: TrainerSessionRef; trainerId: string | null; trainerName: string }
  | { ok: false; error: 'unauthenticated' | 'forbidden' };

export async function requireMyTrainerSession(sessionId: string): Promise<TrainerSessionAccess> {
  if (!UUID.test(sessionId)) return { ok: false, error: 'forbidden' };
  const sb = supabaseServer();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return { ok: false, error: 'unauthenticated' };
  if (!(await hasTrainerSpace(user.id))) return { ok: false, error: 'forbidden' };

  const { data: ids, error } = await sb.schema('app').rpc('my_trainer_session_ids' as never);
  if (error || !((ids ?? []) as string[]).includes(sessionId)) return { ok: false, error: 'forbidden' };

  const admin = supabaseAdmin();
  const { data: s } = await admin
    .schema('app')
    .from('sessions')
    .select('id, organization_id, dossier_id, formation_id, starts_at, ends_at')
    .eq('id', sessionId)
    .maybeSingle();
  const session = s as TrainerSessionRef | null;
  if (!session) return { ok: false, error: 'forbidden' };

  const { data: t } = await admin
    .schema('app')
    .from('trainers')
    .select('id, first_name, last_name')
    .eq('user_id', user.id)
    .eq('organization_id', session.organization_id)
    .is('deleted_at', null)
    .maybeSingle();
  const fiche = t as { id: string; first_name: string | null; last_name: string | null } | null;
  return {
    ok: true,
    userId: user.id,
    session,
    trainerId: fiche?.id ?? null,
    trainerName: fiche ? `${fiche.first_name ?? ''} ${fiche.last_name ?? ''}`.trim() : 'Votre formateur',
  };
}
