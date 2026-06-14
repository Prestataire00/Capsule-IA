'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@supabase/supabase-js';
import { env } from '@/env.mjs';

const admin = () =>
  createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

type ActionResult = { ok: true } | { ok: false; error: string };

async function recompute(sb: ReturnType<typeof admin>, sessionId: string): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (sb as any).rpc('materialize_session_participants', { p_session_id: sessionId });
}

export async function linkDossierToSession(
  sessionId: string, dossierId: string, primaryDossierId: string,
): Promise<ActionResult> {
  const sb = admin();
  const { data: session } = await sb.schema('app').from('sessions')
    .select('organization_id').eq('id', sessionId).maybeSingle();
  const orgId = (session as { organization_id?: string } | null)?.organization_id;
  if (!orgId) return { ok: false, error: 'Session introuvable' };

  const { error } = await sb.schema('app').from('session_dossiers')
    .upsert({ session_id: sessionId, dossier_id: dossierId, organization_id: orgId },
            { onConflict: 'session_id,dossier_id' });
  if (error) return { ok: false, error: error.message };

  await recompute(sb, sessionId);
  revalidatePath(`/dossiers/${primaryDossierId}/sessions`);
  return { ok: true };
}

export async function unlinkDossierFromSession(
  sessionId: string, dossierId: string, primaryDossierId: string,
): Promise<ActionResult> {
  const sb = admin();
  const { error } = await sb.schema('app').from('session_dossiers')
    .delete().eq('session_id', sessionId).eq('dossier_id', dossierId);
  if (error) return { ok: false, error: error.message };
  await recompute(sb, sessionId);
  revalidatePath(`/dossiers/${primaryDossierId}/sessions`);
  return { ok: true };
}

// Override d'un apprenant sur une session : 'add' force la présence, 'remove' la retire.
export async function overrideParticipant(
  sessionId: string, learnerId: string, action: 'add' | 'remove', primaryDossierId: string,
): Promise<ActionResult> {
  const sb = admin();
  const { data: session } = await sb.schema('app').from('sessions')
    .select('organization_id').eq('id', sessionId).maybeSingle();
  const orgId = (session as { organization_id?: string } | null)?.organization_id;
  if (!orgId) return { ok: false, error: 'Session introuvable' };

  const source = action === 'add' ? 'manual_add' : 'manual_remove';
  // delete+insert plutôt qu'upsert : participant_id est une colonne GENERATED,
  // on cible donc la clé (session_id, kind, learner_id) manuellement.
  await sb.schema('app').from('session_participants')
    .delete().eq('session_id', sessionId).eq('participant_kind', 'learner').eq('learner_id', learnerId);
  const { error } = await sb.schema('app').from('session_participants')
    .insert({ session_id: sessionId, organization_id: orgId, participant_kind: 'learner', learner_id: learnerId, source });
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/dossiers/${primaryDossierId}/sessions`);
  return { ok: true };
}
