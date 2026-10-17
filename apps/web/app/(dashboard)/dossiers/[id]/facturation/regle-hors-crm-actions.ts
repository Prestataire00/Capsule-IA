'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { getCurrentMember } from '@/shared/lib/auth/current-member';
import { can } from '@/shared/lib/auth/permissions';
import { supabaseAdmin } from '@/shared/lib/supabase/admin';

const Schema = z.object({
  dossierId: z.string().uuid(),
  regle: z.boolean(),
  note: z.string().trim().max(300).optional(),
});

/**
 * Dossier facturé et encaissé hors Capsule, dans Qonto (0232, réunion avec
 * Laurie, 16/10/2026) : il n'apparaît plus comme impayé et n'invite plus à
 * facturer, sans émettre une facture en double au client.
 */
export async function marquerRegleHorsCrm(brut: z.input<typeof Schema>): Promise<{ ok: true } | { ok: false; error: string }> {
  const me = await getCurrentMember();
  if (!me || can(me.role, 'billing') !== 'manage') return { ok: false, error: 'Votre rôle ne permet pas de modifier la facturation.' };
  const p = Schema.safeParse(brut);
  if (!p.success) return { ok: false, error: 'Saisie invalide.' };

  const { data, error } = await supabaseAdmin()
    .schema('app')
    .from('dossiers')
    .update({
      regle_hors_crm_at: p.data.regle ? new Date().toISOString() : null,
      regle_hors_crm_note: p.data.regle ? p.data.note?.trim() || null : null,
    } as never)
    .eq('id', p.data.dossierId)
    .eq('organization_id', me.organizationId)
    .select('id');
  if (error || !data || (data as unknown[]).length === 0) return { ok: false, error: 'Le dossier n’a pas pu être mis à jour.' };

  revalidatePath(`/dossiers/${p.data.dossierId}/facturation`);
  revalidatePath('/dossiers');
  return { ok: true };
}
