'use server';

import { revalidatePath } from 'next/cache';
import { getCurrentMember } from '@/shared/lib/auth/current-member';
import { can } from '@/shared/lib/auth/permissions';
import { supabaseAdmin } from '@/shared/lib/supabase/admin';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { creerVisioDeSeance } from '@/features/sessions/visio';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const MESSAGES = {
  exists: 'Cette séance a déjà son lien.',
  not_remote: 'La séance est en présentiel : passez-la en distanciel ou hybride pour lui donner une visio.',
  no_calendar:
    'Aucun agenda Google connecté : connectez la boîte formateur dans Paramètres → Intégrations → Google Agenda.',
  failed: 'Google n’a pas créé la visio. Réessayez dans un instant.',
} as const;

export async function creerLienVisio(sessionId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!UUID.test(sessionId)) return { ok: false, error: 'Séance introuvable.' };
  const membre = await getCurrentMember();
  if (!membre) return { ok: false, error: 'Session expirée — reconnectez-vous.' };
  if (can(membre.role, 'dossiers') !== 'manage') return { ok: false, error: 'Votre rôle ne permet pas de modifier une séance.' };
  const { data } = await supabaseServer().schema('app').from('sessions').select('organization_id').eq('id', sessionId).maybeSingle();
  if ((data as { organization_id: string } | null)?.organization_id !== membre.organizationId) {
    return { ok: false, error: 'Séance introuvable.' };
  }

  const r = await creerVisioDeSeance(supabaseAdmin() as never, sessionId, membre.userId);
  if (r !== 'created') return { ok: false, error: MESSAGES[r] };
  revalidatePath(`/sessions/${sessionId}`, 'layout');
  return { ok: true };
}
