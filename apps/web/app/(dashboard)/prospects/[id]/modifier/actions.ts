'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@supabase/supabase-js';
import { env } from '@/env.mjs';
import { guardAction } from '@/shared/lib/auth/guard-action';
import { NouvelleDemandeSchema } from '@/app/(dashboard)/prospects/nouvelle/schema';

/**
 * Modification d'une demande.
 *
 * Elle ne pouvait jusqu'ici que se créer, se convertir ou se supprimer : une
 * coquille dans un nom, un SIRET tapé de travers ou une formation mal choisie
 * obligeaient à tout ressaisir.
 *
 * Le schéma est celui de la création : les deux écrans doivent valider la même
 * chose, sans quoi l'un accepterait ce que l'autre refuse.
 */

const admin = () =>
  createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

const orNull = (v: string | undefined | null) => {
  const t = (v ?? '').trim();
  return t === '' ? null : t;
};

export type ModifierResult = { ok: true } | { ok: false; error: string };

export async function modifierDemande(prospectId: string, brut: unknown): Promise<ModifierResult> {
  const garde = await guardAction('crm');
  if (!garde.ok) return { ok: false, error: garde.error };

  // `convertNow` n'a pas de sens ici : on modifie, on ne convertit pas.
  const parse = NouvelleDemandeSchema.safeParse({ ...(brut as object), convertNow: false });
  if (!parse.success) {
    const premier = parse.error.issues[0];
    return { ok: false, error: premier ? `${premier.message}` : 'Saisie invalide.' };
  }
  const v = parse.data;

  const sb = admin();
  const { data: existante } = await sb
    .schema('app')
    .from('prospects')
    .select('id')
    .eq('id', prospectId)
    .eq('organization_id', garde.member.organizationId)
    .is('deleted_at', null)
    .maybeSingle();
  if (!existante) return { ok: false, error: 'Demande introuvable.' };

  const { error } = await sb
    .schema('app')
    .from('prospects')
    .update({
      civility: orNull(v.civility),
      first_name: v.firstName,
      last_name: v.lastName,
      email: v.email,
      phone: orNull(v.phone),
      birth_date: orNull(v.birthDate),
      rqth: v.rqth,
      candidate_is_learner: v.candidateIsLearner,
      situation: v.situation,
      funder_kind: v.funderKind,
      company_name: orNull(v.companyName),
      company_siret: orNull(v.companySiret)?.replace(/\s/g, '') ?? null,
      convention_collective: orNull(v.conventionCollective),
      referent_name: orNull(v.referentName),
      referent_email: orNull(v.referentEmail),
      referent_phone: orNull(v.referentPhone),
      formation_id: orNull(v.formationId),
      custom_formation_title: orNull(v.customFormationTitle),
      custom_formation_hours: v.customFormationHours,
      custom_formation_price_cents: v.customFormationPriceCents,
      preferred_modality: orNull(v.preferredModality),
      preferred_start_date: orNull(v.preferredStartDate),
      message: orNull(v.message),
      updated_at: new Date().toISOString(),
      // Ni le statut ni la validation ne changent : modifier une demande n'est
      // pas la revalider, et une demande convertie le reste.
    } as never)
    .eq('id', prospectId);

  if (error) {
    console.error('[demande] modification impossible', prospectId, error.message);
    return { ok: false, error: 'La modification n’a pas pu être enregistrée.' };
  }

  revalidatePath(`/prospects/${prospectId}`);
  revalidatePath('/prospects');
  return { ok: true };
}
