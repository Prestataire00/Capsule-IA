'use server';

import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import { revalidatePath } from 'next/cache';
import { getCurrentMember } from '@/shared/lib/auth/current-member';
import { can } from '@/shared/lib/auth/permissions';
import { supabaseAdmin } from '@/shared/lib/supabase/admin';
import { isAutomationKey } from '@/features/automation/session-automations';

/**
 * Couper ou rétablir un envoi automatique pour UNE séance. Réservé aux rôles qui
 * gèrent les dossiers, pour une séance de l'organisme du membre ; l'écriture se
 * fait ensuite en service role (la table n'est écrivable que par lui).
 */

type Result = { ok: true } | { ok: false; error: string };

const schema = z.object({
  sessionId: z.string().uuid(),
  key: z.string().trim().min(1).max(60),
  enabled: z.boolean(),
});

export async function setSessionAutomation(input: z.input<typeof schema>): Promise<Result> {
  const p = schema.safeParse(input);
  if (!p.success) return { ok: false, error: 'Réglage invalide.' };
  if (!isAutomationKey(p.data.key)) return { ok: false, error: 'Envoi inconnu.' };

  const membre = await getCurrentMember();
  if (!membre) return { ok: false, error: 'Session expirée — reconnectez-vous.' };
  if (can(membre.role, 'dossiers') !== 'manage') {
    return { ok: false, error: 'Votre rôle ne permet pas de modifier les automatisations.' };
  }

  const admin = supabaseAdmin();
  const { data: sRow } = await admin
    .schema('app')
    .from('sessions')
    .select('id, organization_id')
    .eq('id', p.data.sessionId)
    .eq('organization_id', membre.organizationId)
    .maybeSingle();
  if (!sRow) return { ok: false, error: 'Séance introuvable.' };

  // Table absente des types générés (migration 0156) : client non typé, comme ailleurs.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const libre = admin as unknown as () => SupabaseClient<any, any, any>;
  const { error } = await libre()
    .schema('app')
    .from('session_automation_settings')
    .upsert(
      {
        organization_id: membre.organizationId,
        session_id: p.data.sessionId,
        key: p.data.key,
        enabled: p.data.enabled,
        updated_by: membre.userId,
        updated_at: new Date().toISOString(),
      } as never,
      { onConflict: 'session_id,key' },
    );
  if (error) {
    console.error('[automatisations séance] réglage non enregistré', error.message);
    return { ok: false, error: 'Le réglage n’a pas pu être enregistré.' };
  }

  revalidatePath(`/sessions/${p.data.sessionId}/automatisations`);
  return { ok: true };
}
