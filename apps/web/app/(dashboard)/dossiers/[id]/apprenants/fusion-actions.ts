'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { guardAction } from '@/shared/lib/auth/guard-action';
import { supabaseAdmin } from '@/shared/lib/supabase/admin';
import type { FusionResult } from '@/shared/ui/doublons.client';

/**
 * Réunir deux fiches d'un même apprenant (0216), depuis un dossier où les deux
 * figurent. Réservé à qui gère les dossiers ; les fiches doivent être de son
 * organisme. La fusion se fait en base, tout ou rien : signatures, fiche de
 * positionnement, questionnaires et dossiers passent sur la fiche gardée.
 */

const Schema = z.object({ dossierId: z.string().uuid(), gardeId: z.string().uuid(), doublonId: z.string().uuid() }).refine((v) => v.gardeId !== v.doublonId);

export async function fusionnerApprenants(brut: z.input<typeof Schema>): Promise<FusionResult> {
  const garde = await guardAction('dossiers');
  if (!garde.ok) return { ok: false, error: 'Votre rôle ne permet pas de fusionner des apprenants.' };
  const p = Schema.safeParse(brut);
  if (!p.success) return { ok: false, error: 'Choisissez deux fiches différentes.' };

  const admin = supabaseAdmin();
  const { data } = await admin
    .schema('app')
    .from('learners')
    .select('id')
    .in('id', [p.data.gardeId, p.data.doublonId])
    .eq('organization_id', garde.member.organizationId)
    .is('deleted_at', null);
  if ((data ?? []).length !== 2) return { ok: false, error: 'Fiches introuvables.' };

  const { data: bilan, error } = await admin
    .schema('app')
    .rpc('fusionner_apprenants' as never, { p_garde: p.data.gardeId, p_doublon: p.data.doublonId } as never);
  if (error) {
    console.error('[apprenants] fusion impossible', p.data, error.message);
    return { ok: false, error: 'La fusion n’a pas pu se faire. Rien n’a été modifié.' };
  }
  const b = bilan as unknown as { liens_deplaces?: number } | null;
  revalidatePath(`/dossiers/${p.data.dossierId}`, 'layout');
  revalidatePath('/apprenants');
  return { ok: true, message: `Fiches réunies : ${b?.liens_deplaces ?? 0} élément(s) rattaché(s) à la fiche gardée.` };
}
