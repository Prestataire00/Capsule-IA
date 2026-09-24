'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { createClient } from '@supabase/supabase-js';
import { env } from '@/env.mjs';
import { guardAction } from '@/shared/lib/auth/guard-action';

/**
 * Les groupes d'apprenants d'un dossier (0194).
 *
 * Une entreprise forme seize personnes en deux groupes de huit, qui ne viennent
 * pas les mêmes demi-journées. Le groupe n'existait jusqu'ici que dans le titre
 * de la séance : du texte, que rien ne pouvait lire.
 *
 * Écriture en service role, donc garde explicite ici — le middleware ne protège
 * pas les Server Actions.
 */

const admin = () =>
  createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

export type GroupeResult = { ok: true } | { ok: false; error: string };

/** Le dossier appartient-il bien à l'organisme du membre ? L'id vient de l'écran. */
async function dossierDeLOrganisme(
  sb: ReturnType<typeof admin>,
  dossierId: string,
  organizationId: string,
): Promise<boolean> {
  const { data } = await sb
    .schema('app')
    .from('dossiers')
    .select('id')
    .eq('id', dossierId)
    .eq('organization_id', organizationId)
    .is('deleted_at', null)
    .maybeSingle();
  return Boolean(data);
}

const CreerSchema = z.object({
  dossierId: z.string().uuid(),
  nom: z.string().trim().min(1, 'Donnez un nom au groupe.').max(60),
});

export async function creerGroupe(brut: z.input<typeof CreerSchema>): Promise<GroupeResult> {
  const garde = await guardAction('dossiers');
  if (!garde.ok) return { ok: false, error: garde.error };
  const p = CreerSchema.safeParse(brut);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? 'Saisie invalide.' };

  const sb = admin();
  if (!(await dossierDeLOrganisme(sb, p.data.dossierId, garde.member.organizationId))) {
    return { ok: false, error: 'Dossier introuvable.' };
  }

  // L'ordre d'affichage suit la création : « Groupe A » puis « Groupe B », même
  // si on les renomme ensuite en « Matin » et « Après-midi ».
  const { count } = await sb
    .schema('app')
    .from('dossier_groupes' as never)
    .select('id', { count: 'exact', head: true })
    .eq('dossier_id', p.data.dossierId);

  const { error } = await sb
    .schema('app')
    .from('dossier_groupes' as never)
    .insert({
      dossier_id: p.data.dossierId,
      organization_id: garde.member.organizationId,
      nom: p.data.nom,
      ordre: count ?? 0,
      created_by: garde.member.userId,
    } as never);
  if (error) {
    // 23505 : deux « Groupe A » dans le même dossier ne se distingueraient pas.
    if (error.code === '23505') return { ok: false, error: 'Ce dossier a déjà un groupe de ce nom.' };
    console.error('[groupes] création impossible', p.data.dossierId, error.message);
    return { ok: false, error: 'Le groupe n’a pas pu être créé.' };
  }

  revalidatePath(`/dossiers/${p.data.dossierId}/apprenants`);
  return { ok: true };
}

const RenommerSchema = z.object({
  groupeId: z.string().uuid(),
  nom: z.string().trim().min(1, 'Donnez un nom au groupe.').max(60),
});

export async function renommerGroupe(brut: z.input<typeof RenommerSchema>): Promise<GroupeResult> {
  const garde = await guardAction('dossiers');
  if (!garde.ok) return { ok: false, error: garde.error };
  const p = RenommerSchema.safeParse(brut);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? 'Saisie invalide.' };

  const sb = admin();
  const { data: groupe } = await sb
    .schema('app')
    .from('dossier_groupes' as never)
    .select('dossier_id')
    .eq('id', p.data.groupeId)
    .eq('organization_id', garde.member.organizationId)
    .maybeSingle();
  if (!groupe) return { ok: false, error: 'Groupe introuvable.' };

  const { error } = await sb
    .schema('app')
    .from('dossier_groupes' as never)
    .update({ nom: p.data.nom } as never)
    .eq('id', p.data.groupeId);
  if (error) {
    if (error.code === '23505') return { ok: false, error: 'Ce dossier a déjà un groupe de ce nom.' };
    return { ok: false, error: 'Le nom n’a pas pu être changé.' };
  }

  revalidatePath(`/dossiers/${(groupe as { dossier_id: string }).dossier_id}/apprenants`);
  return { ok: true };
}

export async function supprimerGroupe(groupeId: string): Promise<GroupeResult> {
  const garde = await guardAction('dossiers');
  if (!garde.ok) return { ok: false, error: garde.error };
  if (!z.string().uuid().safeParse(groupeId).success) return { ok: false, error: 'Groupe introuvable.' };

  const sb = admin();
  const { data: groupe } = await sb
    .schema('app')
    .from('dossier_groupes' as never)
    .select('dossier_id')
    .eq('id', groupeId)
    .eq('organization_id', garde.member.organizationId)
    .maybeSingle();
  if (!groupe) return { ok: false, error: 'Groupe introuvable.' };

  // Les séances qui le visaient ne sont pas supprimées : `groupe_id` retombe à
  // NULL (ON DELETE SET NULL) et elles redeviennent celles de tout le dossier.
  // Perdre des séances parce qu'on renonce à une répartition serait brutal.
  const { error } = await sb.schema('app').from('dossier_groupes' as never).delete().eq('id', groupeId);
  if (error) {
    console.error('[groupes] suppression impossible', groupeId, error.message);
    return { ok: false, error: 'Le groupe n’a pas pu être supprimé.' };
  }

  const dossierId = (groupe as { dossier_id: string }).dossier_id;
  revalidatePath(`/dossiers/${dossierId}/apprenants`);
  revalidatePath(`/dossiers/${dossierId}/sessions`);
  return { ok: true };
}

const AffectationSchema = z.object({
  groupeId: z.string().uuid(),
  learnerId: z.string().uuid(),
  dedans: z.boolean(),
});

/** Met un apprenant dans un groupe, ou l'en retire. */
export async function affecterAuGroupe(brut: z.input<typeof AffectationSchema>): Promise<GroupeResult> {
  const garde = await guardAction('dossiers');
  if (!garde.ok) return { ok: false, error: garde.error };
  const p = AffectationSchema.safeParse(brut);
  if (!p.success) return { ok: false, error: 'Saisie invalide.' };

  const sb = admin();
  const { data: groupe } = await sb
    .schema('app')
    .from('dossier_groupes' as never)
    .select('id, dossier_id')
    .eq('id', p.data.groupeId)
    .eq('organization_id', garde.member.organizationId)
    .maybeSingle();
  if (!groupe) return { ok: false, error: 'Groupe introuvable.' };
  const dossierId = (groupe as { dossier_id: string }).dossier_id;

  // L'apprenant doit déjà être sur le dossier : un groupe répartit les inscrits,
  // il n'en ajoute pas.
  const { data: inscrit } = await sb
    .schema('app')
    .from('dossier_learners')
    .select('learner_id')
    .eq('dossier_id', dossierId)
    .eq('learner_id', p.data.learnerId)
    .maybeSingle();
  if (!inscrit) return { ok: false, error: 'Ce stagiaire n’est pas inscrit au dossier.' };

  if (p.data.dedans) {
    const { error } = await sb
      .schema('app')
      .from('dossier_groupe_membres' as never)
      .upsert(
        {
          groupe_id: p.data.groupeId,
          learner_id: p.data.learnerId,
          organization_id: garde.member.organizationId,
        } as never,
        { onConflict: 'groupe_id,learner_id' },
      );
    if (error) {
      console.error('[groupes] affectation impossible', p.data.groupeId, error.message);
      return { ok: false, error: 'L’affectation n’a pas été enregistrée.' };
    }
  } else {
    const { error } = await sb
      .schema('app')
      .from('dossier_groupe_membres' as never)
      .delete()
      .eq('groupe_id', p.data.groupeId)
      .eq('learner_id', p.data.learnerId);
    if (error) return { ok: false, error: 'Le retrait n’a pas été enregistré.' };

    // Les séances du groupe ne l'attendent plus. La dérivation ne retire que
    // les lignes `derived` ; celles posées à la main au moment de l'inscription
    // resteraient, et le stagiaire figurerait encore sur les émargements.
    const { data: seances } = await sb
      .schema('app')
      .from('sessions')
      .select('id')
      .eq('groupe_id', p.data.groupeId);
    const ids = ((seances ?? []) as Array<{ id: string }>).map((s) => s.id);
    if (ids.length > 0) {
      await sb
        .schema('app')
        .from('session_participants')
        .delete()
        .in('session_id', ids)
        .eq('learner_id', p.data.learnerId)
        .eq('participant_kind', 'learner');
    }
  }

  revalidatePath(`/dossiers/${dossierId}/apprenants`);
  revalidatePath(`/dossiers/${dossierId}/emargements`);
  return { ok: true };
}
