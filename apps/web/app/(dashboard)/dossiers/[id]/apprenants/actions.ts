'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { supabaseAdmin } from '@/shared/lib/supabase/admin';
import { getCurrentMember } from '@/shared/lib/auth/current-member';
import { can } from '@/shared/lib/auth/permissions';

/**
 * Inscription des stagiaires sur un dossier.
 *
 * Une convention intra est signée avant que la liste nominative n'arrive :
 * l'import pose alors un titulaire provisoire et rien ne permettait ensuite de
 * nommer les personnes. C'est ce que fait cet écran — créer les apprenants,
 * les inscrire à toutes les séances du dossier, et remplacer le titulaire
 * provisoire par le premier d'entre eux.
 */

export type ApprenantsResult = { ok: true; ajoutes: number; reutilises: number } | { ok: false; error: string };
export type SimpleResult = { ok: true } | { ok: false; error: string };

type Contexte = {
  organizationId: string;
  companyId: string | null;
  learnerId: string | null;
  sessionIds: string[];
};

async function garder(dossierId: string): Promise<{ ok: true; ctx: Contexte } | { ok: false; error: string }> {
  const me = await getCurrentMember();
  if (!me) return { ok: false, error: 'Votre session a expiré, reconnectez-vous.' };
  if (can(me.role, 'dossiers') !== 'manage') {
    return { ok: false, error: "Vous n'avez pas le droit de modifier ce dossier." };
  }

  const admin = supabaseAdmin();
  const { data } = await admin
    .schema('app')
    .from('dossiers')
    .select('id, organization_id, company_id, learner_id')
    .eq('id', dossierId)
    .maybeSingle();
  const d = data as { organization_id: string; company_id: string | null; learner_id: string | null } | null;
  if (!d || d.organization_id !== me.organizationId) {
    return { ok: false, error: "Ce dossier n'appartient pas à votre organisation." };
  }

  // Les deux chemins d'une séance vers son dossier (liaison et colonne directe).
  const [liens, directes] = await Promise.all([
    admin.schema('app').from('session_dossiers').select('session_id').eq('dossier_id', dossierId),
    admin.schema('app').from('sessions').select('id').eq('dossier_id', dossierId).neq('status', 'cancelled'),
  ]);
  const sessionIds = [
    ...new Set([
      ...(((liens.data ?? []) as Array<{ session_id: string }>).map((l) => l.session_id)),
      ...(((directes.data ?? []) as Array<{ id: string }>).map((s) => s.id)),
    ]),
  ];

  return {
    ok: true,
    ctx: { organizationId: d.organization_id, companyId: d.company_id, learnerId: d.learner_id, sessionIds },
  };
}

const ligneSchema = z.object({
  firstName: z.string().trim().max(100),
  lastName: z.string().trim().min(1).max(100),
  email: z.union([z.literal(''), z.string().trim().email().max(200)]).nullable().optional(),
  phone: z.string().trim().max(40).nullable().optional(),
});

const ajoutSchema = z.object({
  dossierId: z.string().uuid(),
  apprenants: z.array(ligneSchema).min(1).max(200),
});

export async function ajouterApprenants(input: {
  dossierId: string;
  apprenants: Array<{ firstName: string; lastName: string; email?: string | null; phone?: string | null }>;
}): Promise<ApprenantsResult> {
  const p = ajoutSchema.safeParse(input);
  if (!p.success) return { ok: false, error: 'Liste invalide.' };

  const garde = await garder(p.data.dossierId);
  if (!garde.ok) return garde;
  const { organizationId, companyId, sessionIds } = garde.ctx;
  const admin = supabaseAdmin();

  // Une adresse déjà connue de l'organisme désigne la même personne : on la
  // réutilise plutôt que d'ouvrir un doublon qui brouillerait l'émargement.
  const emails = p.data.apprenants.map((a) => a.email?.trim().toLowerCase()).filter((e): e is string => Boolean(e));
  const { data: connus } = emails.length
    ? await admin
        .schema('app')
        .from('learners')
        .select('id, email')
        .eq('organization_id', organizationId)
        .in('email', emails)
        .is('deleted_at', null)
    : { data: [] };
  const parEmail = new Map(
    ((connus ?? []) as Array<{ id: string; email: string | null }>).map((l) => [(l.email ?? '').toLowerCase(), l.id]),
  );

  const ids: string[] = [];
  let ajoutes = 0;
  let reutilises = 0;

  for (const a of p.data.apprenants) {
    const email = a.email?.trim().toLowerCase() || null;
    const existant = email ? parEmail.get(email) : undefined;
    if (existant) {
      ids.push(existant);
      reutilises++;
      continue;
    }

    const { data, error } = await admin
      .schema('app')
      .from('learners')
      .insert({
        organization_id: organizationId,
        first_name: a.firstName || '—',
        last_name: a.lastName,
        email,
        phone: a.phone?.trim() || null,
        company_id: companyId,
      } as never)
      .select('id')
      .single();
    if (error || !data) {
      console.error('[apprenants] création impossible', a.lastName, error?.message);
      continue;
    }
    const id = (data as { id: string }).id;
    ids.push(id);
    if (email) parEmail.set(email, id);
    ajoutes++;
  }

  if (ids.length === 0) return { ok: false, error: "Aucun apprenant n'a pu être enregistré." };

  // Le groupe du dossier (0175). C'est ce rattachement qui fait exister le
  // stagiaire sur le dossier : sans lui, un dossier encore sans séance créait
  // l'apprenant puis le perdait de vue.
  const { error: lienErr } = await admin
    .schema('app')
    .from('dossier_learners' as never)
    .upsert(
      ids.map((lid) => ({
        dossier_id: p.data.dossierId,
        learner_id: lid,
        organization_id: organizationId,
      })) as never,
      { onConflict: 'dossier_id,learner_id' },
    );
  if (lienErr) {
    console.error('[apprenants] rattachement au dossier impossible', lienErr.message);
    return { ok: false, error: "Les stagiaires n'ont pas pu être rattachés au dossier." };
  }

  // Inscription à toutes les séances du dossier, quand il en a déjà.
  if (sessionIds.length > 0) {
    const lignes = sessionIds.flatMap((sessionId) =>
      ids.map((lid) => ({
        session_id: sessionId,
        organization_id: organizationId,
        participant_kind: 'learner' as const,
        learner_id: lid,
        source: 'manual_add' as const,
      })),
    );
    const { error } = await admin
      .schema('app')
      .from('session_participants')
      .upsert(lignes as never, { onConflict: 'session_id,participant_kind,participant_id' });
    if (error) console.error('[apprenants] inscription aux séances incomplète', error.message);
  }

  // Règle posée par Ismael le 16/09/2026 : un inscrit est un APPRENANT, et le
  // dossier reste au nom du référent désigné chez le client. On ne promeut donc
  // personne en titulaire — le titulaire provisoire de l'import est un artefact
  // technique (`learner_id` est NOT NULL), masqué partout : les écrans affichent
  // le référent (features/dossier/referent.ts).

  revalidatePath(`/dossiers/${p.data.dossierId}/apprenants`);
  revalidatePath(`/dossiers/${p.data.dossierId}`);
  return { ok: true, ajoutes, reutilises };
}

const retraitSchema = z.object({ dossierId: z.string().uuid(), learnerId: z.string().uuid() });

/** Retire de la formation : l'apprenant reste dans le CRM, il n'est plus attendu. */
export async function retirerApprenant(input: { dossierId: string; learnerId: string }): Promise<SimpleResult> {
  const p = retraitSchema.safeParse(input);
  if (!p.success) return { ok: false, error: 'Demande invalide.' };

  const garde = await garder(p.data.dossierId);
  if (!garde.ok) return garde;
  if (garde.ctx.learnerId === p.data.learnerId) {
    return { ok: false, error: 'Cet apprenant est le titulaire du dossier : désignez-en un autre avant de le retirer.' };
  }

  const admin = supabaseAdmin();
  const { error: lienErr } = await admin
    .schema('app')
    .from('dossier_learners' as never)
    .delete()
    .eq('dossier_id', p.data.dossierId)
    .eq('learner_id', p.data.learnerId);
  if (lienErr) return { ok: false, error: "Le retrait n'a pas été enregistré." };

  if (garde.ctx.sessionIds.length > 0) {
    const { error } = await admin
      .schema('app')
      .from('session_participants')
      .delete()
      .in('session_id', garde.ctx.sessionIds)
      .eq('learner_id', p.data.learnerId)
      .eq('participant_kind', 'learner');
    if (error) return { ok: false, error: "Le retrait des séances n'a pas été enregistré." };
  }

  revalidatePath(`/dossiers/${p.data.dossierId}/apprenants`);
  return { ok: true };
}
