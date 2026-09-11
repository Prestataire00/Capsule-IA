'use server';

import { revalidatePath } from 'next/cache';
import { supabaseAdmin } from '@/shared/lib/supabase/admin';
import { guardAction } from '@/shared/lib/auth/guard-action';
import { setIndicatorStatusSchema } from '@/features/qualiopi/status';

type Result = { ok: true } | { ok: false; error: string };

/** Identifiant du membre connecté dans son organisation (pour la traçabilité). */
async function memberId(userId: string, organizationId: string): Promise<string | null> {
  const { data } = await supabaseAdmin()
    .schema('app')
    .from('members')
    .select('id')
    .eq('user_id', userId)
    .eq('organization_id', organizationId)
    .is('deleted_at', null)
    .maybeSingle();
  return (data as { id: string } | null)?.id ?? null;
}

/**
 * Enregistre l'auto-évaluation de l'organisme sur un indicateur : statut et
 * note. Une seule ligne par indicateur, mise à jour à chaque changement.
 */
export async function setIndicatorStatus(input: unknown): Promise<Result> {
  const guard = await guardAction('qualiopi');
  if (!guard.ok) return { ok: false, error: guard.error };

  const parse = setIndicatorStatusSchema.safeParse(input);
  if (!parse.success) return { ok: false, error: parse.error.issues[0]?.message ?? 'saisie_invalide' };
  const v = parse.data;

  const sb = supabaseAdmin();
  const { data: indicateur } = await sb
    .schema('app')
    .from('qualiopi_indicators')
    .select('id')
    .eq('id', v.indicatorId)
    .eq('is_active', true)
    .maybeSingle();
  if (!indicateur) return { ok: false, error: 'indicateur_inconnu' };

  const { error } = await sb
    .schema('app')
    .from('qualiopi_org_indicator_status' as never)
    .upsert(
      {
        organization_id: guard.member.organizationId,
        indicator_id: v.indicatorId,
        status: v.status,
        note: v.note ?? null,
        updated_by: await memberId(guard.member.userId, guard.member.organizationId),
        updated_at: new Date().toISOString(),
      } as never,
      { onConflict: 'organization_id,indicator_id' },
    );
  if (error) {
    console.error('[qualiopi] statut non enregistré', error);
    return { ok: false, error: error.message };
  }

  revalidatePath('/qualiopi');
  return { ok: true };
}

/**
 * Retire une preuve déposée. Suppression douce : la ligne reste en base (et le
 * fichier en stockage) pour la traçabilité, elle cesse simplement de compter.
 */
export async function removeProof(proofId: string): Promise<Result> {
  const guard = await guardAction('qualiopi');
  if (!guard.ok) return { ok: false, error: guard.error };

  const { error } = await supabaseAdmin()
    .schema('app')
    .from('qualiopi_proofs')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', proofId)
    .eq('organization_id', guard.member.organizationId)
    .is('deleted_at', null);
  if (error) return { ok: false, error: error.message };

  revalidatePath('/qualiopi');
  return { ok: true };
}
