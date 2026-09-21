'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@supabase/supabase-js';
import { env } from '@/env.mjs';
import { guardAction } from '@/shared/lib/auth/guard-action';

/**
 * Rattacher un apprenant à un dossier, ou à une entreprise, depuis sa fiche.
 *
 * Cela ne se faisait que depuis le dossier. Or on constate souvent le
 * rattachement manquant en regardant la personne — « elle a suivi cette
 * formation, pourquoi n'apparaît-elle nulle part ? » — et il fallait alors
 * retrouver le dossier pour l'y ajouter.
 */

const admin = () =>
  createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

export type RattachementResult = { ok: true; message: string } | { ok: false; error: string };

/** L'apprenant et la cible doivent tous deux appartenir à l'organisme. */
async function memeOrganisme(
  sb: ReturnType<typeof admin>,
  table: 'dossiers' | 'companies',
  id: string,
  organizationId: string,
): Promise<boolean> {
  const { data } = await sb
    .schema('app')
    .from(table)
    .select('id')
    .eq('id', id)
    .eq('organization_id', organizationId)
    .is('deleted_at', null)
    .maybeSingle();
  return Boolean(data);
}

export async function rattacherAuDossier(learnerId: string, dossierId: string): Promise<RattachementResult> {
  const garde = await guardAction('dossiers');
  if (!garde.ok) return { ok: false, error: garde.error };
  const orgId = garde.member.organizationId;

  const sb = admin();
  if (!(await memeOrganisme(sb, 'dossiers', dossierId, orgId))) {
    return { ok: false, error: 'Dossier introuvable.' };
  }
  const { data: l } = await sb
    .schema('app')
    .from('learners')
    .select('id')
    .eq('id', learnerId)
    .eq('organization_id', orgId)
    .is('deleted_at', null)
    .maybeSingle();
  if (!l) return { ok: false, error: 'Apprenant introuvable.' };

  const { error: lienErr } = await sb
    .schema('app')
    .from('dossier_learners')
    .upsert({ dossier_id: dossierId, learner_id: learnerId, organization_id: orgId } as never, {
      onConflict: 'dossier_id,learner_id',
    });
  if (lienErr) {
    console.error('[apprenant] rattachement au dossier impossible', learnerId, lienErr.message);
    return { ok: false, error: 'Le rattachement n’a pas pu être enregistré.' };
  }

  // Inscription aux séances déjà planifiées : sans cela, l'apprenant est sur le
  // dossier mais absent des feuilles d'émargement — le défaut corrigé par la
  // 0186 du côté des séances créées ensuite.
  const { data: seances } = await sb
    .schema('app')
    .from('sessions')
    .select('id')
    .eq('dossier_id', dossierId)
    .neq('status', 'cancelled');
  const ids = ((seances ?? []) as Array<{ id: string }>).map((s) => s.id);
  if (ids.length > 0) {
    const { error } = await sb
      .schema('app')
      .from('session_participants')
      .upsert(
        ids.map((sessionId) => ({
          session_id: sessionId,
          organization_id: orgId,
          participant_kind: 'learner' as const,
          learner_id: learnerId,
          source: 'manual_add' as const,
        })) as never,
        { onConflict: 'session_id,participant_kind,participant_id' },
      );
    if (error) console.error('[apprenant] inscription aux séances incomplète', error.message);
  }

  revalidatePath(`/apprenants/${learnerId}`);
  revalidatePath(`/dossiers/${dossierId}/apprenants`);
  return {
    ok: true,
    message: ids.length > 0 ? `Rattaché au dossier et à ses ${ids.length} séance(s).` : 'Rattaché au dossier.',
  };
}

export async function rattacherAEntreprise(learnerId: string, companyId: string): Promise<RattachementResult> {
  const garde = await guardAction('dossiers');
  if (!garde.ok) return { ok: false, error: garde.error };
  const orgId = garde.member.organizationId;

  const sb = admin();
  // `companyId` vide = détacher : un salarié qui quitte son entreprise reste
  // apprenant de l'organisme.
  if (companyId && !(await memeOrganisme(sb, 'companies', companyId, orgId))) {
    return { ok: false, error: 'Entreprise introuvable.' };
  }

  const { error } = await sb
    .schema('app')
    .from('learners')
    .update({ company_id: companyId || null, updated_at: new Date().toISOString() } as never)
    .eq('id', learnerId)
    .eq('organization_id', orgId);
  if (error) {
    console.error('[apprenant] rattachement entreprise impossible', learnerId, error.message);
    return { ok: false, error: 'Le rattachement n’a pas pu être enregistré.' };
  }

  revalidatePath(`/apprenants/${learnerId}`);
  return { ok: true, message: companyId ? 'Rattaché à l’entreprise.' : 'Détaché de son entreprise.' };
}
