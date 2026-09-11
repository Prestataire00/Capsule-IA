'use server';

import { revalidatePath } from 'next/cache';
import { supabaseAdmin } from '@/shared/lib/supabase/admin';
import { guardAction } from '@/shared/lib/auth/guard-action';

/** Active ou coupe l'envoi automatique des liens d'émargement de l'organisme. */
export async function setAttendanceAutoSend(enabled: boolean): Promise<{ ok: true } | { ok: false; error: string }> {
  if (typeof enabled !== 'boolean') return { ok: false, error: 'saisie_invalide' };
  const g = await guardAction('settings');
  if (!g.ok) return { ok: false, error: g.error };

  const { error } = await supabaseAdmin()
    .schema('app')
    .from('organizations')
    .update({ attendance_auto_send: enabled } as never)
    .eq('id', g.member.organizationId);
  if (error) {
    console.error('[paramètres] envoi automatique non enregistré', error);
    return { ok: false, error: 'enregistrement_impossible' };
  }
  revalidatePath('/parametres/organisation');
  return { ok: true };
}
