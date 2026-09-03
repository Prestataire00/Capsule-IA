'use server';

import { revalidatePath } from 'next/cache';
import { supabaseAdmin } from '@/shared/lib/supabase/admin';
import { guardAction } from '@/shared/lib/auth/guard-action';
import { declaredIndicatorSchema } from '@/features/indicateurs/declared-schema';

export type SaveDeclaredResult = { ok: true } | { ok: false; error: string };

/**
 * Enregistre — ou met à jour — une déclaration d'indicateurs.
 *
 * Une seule déclaration par périmètre (organisme + année, ou formation + année) :
 * la contrainte est portée par deux index uniques partiels côté base
 * (migration 0135), on s'appuie dessus plutôt que de vérifier avant d'écrire.
 */
export async function saveDeclaredIndicator(donnees: unknown): Promise<SaveDeclaredResult> {
  const guard = await guardAction('qualiopi');
  if (!guard.ok) return { ok: false, error: guard.error };

  const parse = declaredIndicatorSchema.safeParse(donnees);
  if (!parse.success) {
    return { ok: false, error: parse.error.issues[0]?.message ?? 'saisie_invalide' };
  }
  const v = parse.data;

  const sb = supabaseAdmin();
  const { data: membre } = await sb
    .schema('app')
    .from('members')
    .select('id')
    .eq('user_id', guard.member.userId)
    .eq('organization_id', guard.member.organizationId)
    .maybeSingle();

  const ligne = {
    organization_id: guard.member.organizationId,
    formation_id: v.formationId,
    year: v.year,
    learners_trained: v.learnersTrained,
    satisfaction_rate: v.satisfactionRate,
    satisfaction_responses: v.satisfactionResponses,
    response_rate: v.responseRate,
    formations_delivered: v.formationsDelivered,
    source: v.source,
    note: v.note ?? null,
    updated_at: new Date().toISOString(),
    updated_by: (membre as { id: string } | null)?.id ?? null,
  };

  const { error } = v.id
    ? await sb
        .schema('app')
        .from('declared_indicators' as never)
        .update(ligne as never)
        .eq('id' as never, v.id as never)
        .eq('organization_id' as never, guard.member.organizationId as never)
    : await sb
        .schema('app')
        .from('declared_indicators' as never)
        .upsert(ligne as never, {
          onConflict: v.formationId ? 'organization_id,formation_id,year' : 'organization_id,year',
        });

  if (error) {
    console.error('[indicateurs] enregistrement de la déclaration échoué', error);
    return { ok: false, error: error.message };
  }

  revalidatePath('/indicateurs');
  return { ok: true };
}

export async function deleteDeclaredIndicator(id: string): Promise<SaveDeclaredResult> {
  const guard = await guardAction('qualiopi');
  if (!guard.ok) return { ok: false, error: guard.error };

  const { error } = await supabaseAdmin()
    .schema('app')
    .from('declared_indicators' as never)
    .delete()
    .eq('id' as never, id as never)
    .eq('organization_id' as never, guard.member.organizationId as never);

  if (error) return { ok: false, error: error.message };

  revalidatePath('/indicateurs');
  return { ok: true };
}
