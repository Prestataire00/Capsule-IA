'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { guardAction } from '@/shared/lib/auth/guard-action';
import { supabaseAdmin } from '@/shared/lib/supabase/admin';

/**
 * Réunir deux fiches d'un même formateur (0214). Réservé à qui gère les
 * dossiers ; les deux fiches doivent être de l'organisme du membre — les
 * identifiants viennent de l'écran. La fusion elle-même se fait en base, tout
 * ou rien.
 */

const Schema = z.object({ gardeId: z.string().uuid(), doublonId: z.string().uuid() }).refine((v) => v.gardeId !== v.doublonId);

export type FusionResult = { ok: true; message: string } | { ok: false; error: string };

export async function fusionnerFormateurs(brut: z.input<typeof Schema>): Promise<FusionResult> {
  const garde = await guardAction('dossiers');
  if (!garde.ok) return { ok: false, error: 'Votre rôle ne permet pas de fusionner des formateurs.' };
  const p = Schema.safeParse(brut);
  if (!p.success) return { ok: false, error: 'Choisissez deux fiches différentes.' };

  const admin = supabaseAdmin();
  const { data } = await admin
    .schema('app')
    .from('trainers')
    .select('id')
    .in('id', [p.data.gardeId, p.data.doublonId])
    .eq('organization_id', garde.member.organizationId)
    .is('deleted_at', null);
  if ((data ?? []).length !== 2) return { ok: false, error: 'Fiches introuvables.' };

  const { data: bilan, error } = await admin
    .schema('app')
    .rpc('fusionner_formateurs' as never, { p_garde: p.data.gardeId, p_doublon: p.data.doublonId } as never);
  if (error) {
    console.error('[formateurs] fusion impossible', p.data, error.message);
    return { ok: false, error: 'La fusion n’a pas pu se faire. Rien n’a été modifié.' };
  }
  const b = bilan as unknown as { liens_deplaces?: number } | null;
  revalidatePath('/formateurs');
  revalidatePath(`/formateurs/${p.data.gardeId}`);
  return { ok: true, message: `Fiches réunies : ${b?.liens_deplaces ?? 0} élément(s) rattaché(s) à la fiche gardée.` };
}
