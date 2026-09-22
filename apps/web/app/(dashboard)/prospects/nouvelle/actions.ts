'use server';

import { revalidatePath } from 'next/cache';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '@/shared/lib/supabase/admin';
import { guardAction } from '@/shared/lib/auth/guard-action';
import { convertProspectToDossier } from '@/features/crm/prospect-conversion/convert-core';
import { notifyOrgStaffOfNewDemande } from '@/shared/lib/notifications/notify-staff';
import { tryEnsureQuoteForDossier } from '@/features/billing/quotes/quote-service';
import { NouvelleDemandeSchema, type NouvelleDemandeValues } from './schema';

export type CreateDemandeResult =
  | { ok: true; prospectId: string; dossierId: string | null }
  | { ok: false; error: string };

const orNull = (v: string | undefined): string | null => {
  const t = v?.trim();
  return t ? t : null;
};

/**
 * Enregistre une demande saisie par l'organisme (téléphone, mail, visite).
 *
 * La formation est facultative : pour un besoin spécifique, l'intitulé libre
 * suffit — la formation est créée à la conversion en dossier. Les Server
 * Actions ne passent pas par le middleware : la garde est explicite.
 */
export async function createDemande(input: NouvelleDemandeValues): Promise<CreateDemandeResult> {
  const guard = await guardAction('crm');
  if (!guard.ok) {
    return {
      ok: false,
      error:
        guard.error === 'unauthenticated'
          ? 'Session expirée : reconnectez-vous.'
          : 'Vous n’avez pas le droit de créer une demande.',
    };
  }
  const parsed = NouvelleDemandeSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Saisie invalide.' };
  }
  const v = parsed.data;
  const orgId = guard.member.organizationId;
  const sb = supabaseAdmin() as unknown as SupabaseClient;

  const { data: inserted, error } = await sb
    .schema('app')
    .from('prospects')
    .insert({
      organization_id: orgId,
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
      status: 'new',
      // Saisie par l'organisme : il n'y a pas de pièces déposées par un tiers à
      // vérifier, la demande est donc déjà validée.
      validation_status: 'validated',
      validated_at: new Date().toISOString(),
      validated_by: guard.member.userId,
      source: 'staff',
    } as never)
    .select('id')
    .single();

  if (error || !inserted) {
    console.error('[nouvelle demande] insert échoué', error);
    return { ok: false, error: `Enregistrement impossible : ${error?.message ?? 'erreur inconnue'}` };
  }
  const prospectId = (inserted as { id: string }).id;

  // Une demande saisie par l'organisme ne prévenait personne : seul le tunnel
  // public notifiait. Le gestionnaire qui suit les demandes doit l'apprendre,
  // qu'elle vienne du site ou du téléphone.
  await notifyOrgStaffOfNewDemande({
    organizationId: orgId,
    prospectId,
    exclureUserId: guard.member.userId,
    summary: {
      name: `${v.firstName} ${v.lastName}`.trim(),
      situationLabel: v.situation,
      companyName: orNull(v.companyName),
      employeesCount: null,
    },
  });

  let dossierId: string | null = null;
  if (v.convertNow) {
    const conv = await convertProspectToDossier(sb, orgId, prospectId);
    if (!conv.ok) {
      revalidatePath('/prospects');
      return {
        ok: false,
        error: `Demande enregistrée, mais le dossier n'a pas pu être créé (${conv.error}). Ouvrez la demande pour réessayer.`,
      };
    }
    dossierId = conv.dossierId;
    // Le devis suivra dès que la session sera planifiée et l'analyse du besoin reçue.
    await tryEnsureQuoteForDossier(sb, dossierId);
  }

  revalidatePath('/prospects');
  return { ok: true, prospectId, dossierId };
}
