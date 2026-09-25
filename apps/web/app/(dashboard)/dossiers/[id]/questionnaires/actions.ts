'use server';

import { z } from 'zod';
import { createHash, randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { authActionClient } from '@/shared/lib/safe-action';
import { generateQuestionnaireToken } from '@/shared/lib/questionnaire-token';
import { generateTrainerSatisfactionUrl } from '@/shared/lib/trainer-satisfaction-token';
import { ensureTrainerSatisfactionTemplate } from '@/features/questionnaire/satisfaction-formateur';
import { ensureCompanySatisfactionTemplate } from '@/features/questionnaire/satisfaction-entreprise';
import { trainerSatisfactionEmail } from '@/shared/lib/email/trainer-satisfaction-email';
import { questionnaireEmail } from '@/shared/lib/email/questionnaire-email';
import { sendEmail } from '@/shared/lib/email/resend';
import { env } from '@/env.mjs';
import { createClient } from '@supabase/supabase-js';
import { guardAction } from '@/shared/lib/auth/guard-action';

/** Écriture en service role : la garde de rôle est explicite à chaque action. */
const adminClient = () =>
  createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

const SendSchema = z.object({
  dossierId: z.string().uuid(),
  funderId: z.string().uuid(),
  templateCode: z.enum(['funder_besoins', 'funder_satisfaction', 'funder_conformite']),
});

const AssignLearnerSchema = z.object({
  dossierId: z.string().uuid(),
  templateId: z.string().uuid(),
});

/** Affecte un questionnaire à l'apprenant du dossier (rempli depuis son espace). */
export const assignLearnerQuestionnaire = authActionClient
  .schema(AssignLearnerSchema)
  .action(async ({ parsedInput, ctx }) => {
    const sb = ctx.supabase;
    const { data: dossier } = await sb
      .schema('app')
      .from('dossiers')
      .select('id, organization_id, learner_id, learner:learners!dossiers_learner_id_fkey(first_name, last_name, email)')
      .eq('id', parsedInput.dossierId)
      .maybeSingle();
    const d = dossier as {
      organization_id: string;
      learner_id: string | null;
      learner: { first_name: string; last_name: string; email: string | null } | null;
    } | null;
    if (!d) return { ok: false as const, error: 'dossier_not_found' };
    if (!d.learner_id) return { ok: false as const, error: 'no_learner' };

    // Pas de doublon actif pour ce template + apprenant.
    const { data: dup } = await sb
      .schema('app')
      .from('questionnaire_assignments')
      .select('id')
      .eq('dossier_id', parsedInput.dossierId)
      .eq('recipient_learner_id', d.learner_id)
      .eq('template_id', parsedInput.templateId)
      .neq('status', 'expired')
      .maybeSingle();
    if (dup) return { ok: false as const, error: 'already_assigned' };

    const { error } = await sb
      .schema('app')
      .from('questionnaire_assignments')
      .insert({
        organization_id: d.organization_id,
        template_id: parsedInput.templateId,
        dossier_id: parsedInput.dossierId,
        recipient_kind: 'learner',
        recipient_learner_id: d.learner_id,
        recipient_email: d.learner?.email ?? null,
        recipient_name: d.learner ? `${d.learner.first_name} ${d.learner.last_name}`.trim() : null,
        token_hash: `pending-${randomUUID()}`,
        status: 'pending',
      } as never);
    if (error) return { ok: false as const, error: 'assignment_create_failed', details: error.message };

    revalidatePath(`/dossiers/${parsedInput.dossierId}/questionnaires`);
    return { ok: true as const };
  });

export const sendFunderQuestionnaire = authActionClient
  .schema(SendSchema)
  .action(async ({ parsedInput, ctx }) => {
    const sb = ctx.supabase;
    // Dossier + org + lien funder (RLS scope l'org)
    const { data: dossier } = await sb.schema('app').from('dossiers')
      .select('id, organization_id').eq('id', parsedInput.dossierId).maybeSingle();
    if (!dossier) return { ok: false as const, error: 'dossier_not_found' };
    const orgId = (dossier as { organization_id: string }).organization_id;

    const { data: link } = await sb.schema('app').from('dossier_funders')
      .select('funder_id').eq('dossier_id', parsedInput.dossierId).eq('funder_id', parsedInput.funderId).maybeSingle();
    if (!link) return { ok: false as const, error: 'funder_not_linked' };

    const { data: funder } = await sb.schema('app').from('funders')
      .select('contact_email, name').eq('id', parsedInput.funderId).maybeSingle();
    const email = (funder as { contact_email: string | null } | null)?.contact_email ?? null;

    const { data: template } = await sb.schema('app').from('questionnaire_templates')
      .select('id').eq('code', parsedInput.templateCode).maybeSingle();
    if (!template) return { ok: false as const, error: 'template_not_found' };

    // Crée l'assignation (token_hash provisoire, mis à jour après signature avec l'id réel)
    const { data: ins, error } = await sb.schema('app').from('questionnaire_assignments').insert({
      organization_id: orgId,
      template_id: (template as { id: string }).id,
      dossier_id: parsedInput.dossierId,
      recipient_kind: 'funder',
      recipient_funder_id: parsedInput.funderId,
      recipient_email: email,
      recipient_name: (funder as { name?: string } | null)?.name ?? null,
      token_hash: `pending-${randomUUID()}`,
      status: 'pending',
    } as never).select('id').single();
    if (error || !ins) return { ok: false as const, error: 'assignment_create_failed', details: error?.message };
    const assignmentId = (ins as { id: string }).id;

    const signed = await generateQuestionnaireToken({ assignmentId, dossierId: parsedInput.dossierId, organizationId: orgId });
    const tokenHash = createHash('sha256').update(signed.token).digest('hex');
    await sb.schema('app').from('questionnaire_assignments')
      .update({ token_hash: tokenHash } as never).eq('id', assignmentId);

    // Le financeur ne recevait rien : le lien s'affichait, et il fallait penser
    // à le lui envoyer soi-même. Un questionnaire créé puis oublié à l'écran ne
    // sert à rien.
    const lienFinanceur = `/questionnaire/financeur/${signed.token}`;
    const envoye = await envoyerLienQuestionnaire({
      sb,
      destinataire: 'financeur',
      email,
      prenom: null,
      organizationId: orgId,
      dossierId: parsedInput.dossierId,
      titreQuestionnaire: 'Questionnaire de financement',
      lien: lienFinanceur,
      relance: false,
    });

    revalidatePath(`/dossiers/${parsedInput.dossierId}/questionnaires`);
    return { ok: true as const, link: lienFinanceur, envoye, sansAdresse: !email };
  });


const TrainerSchema = z.object({
  dossierId: z.string().uuid(),
  trainerId: z.string().uuid(),
});

/**
 * Envoie le questionnaire de satisfaction à un formateur du dossier.
 *
 * Il partait déjà tout seul, le lendemain de la fin d'un dossier terminé
 * (F-FOR-10). C'était le seul moment possible : un dossier clos sans que
 * l'automatisation parte, une session qui s'est mal passée, un client qui
 * s'interroge — rien ne permettait de le demander.
 *
 * Le modèle, le jeton et l'e-mail sont ceux de l'envoi automatique : deux
 * questionnaires du même nom aux questions différentes rendraient les réponses
 * incomparables d'une formation à l'autre.
 */
export const sendTrainerQuestionnaire = authActionClient
  .schema(TrainerSchema)
  .action(async ({ parsedInput, ctx }) => {
    const sb = ctx.supabase;
    const { data: dossier } = await sb
      .schema('app')
      .from('dossiers')
      .select('id, organization_id, formation:formations(title)')
      .eq('id', parsedInput.dossierId)
      .maybeSingle();
    if (!dossier) return { ok: false as const, error: 'dossier_not_found' };
    const d = dossier as unknown as {
      organization_id: string;
      formation: { title: string } | { title: string }[] | null;
    };
    const formation = Array.isArray(d.formation) ? d.formation[0] : d.formation;

    // Le formateur doit être celui du dossier : l'identifiant vient de l'écran.
    const { data: lien } = await sb
      .schema('app')
      .from('dossier_trainers')
      .select('trainer_id')
      .eq('dossier_id', parsedInput.dossierId)
      .eq('trainer_id', parsedInput.trainerId)
      .maybeSingle();
    if (!lien) return { ok: false as const, error: 'trainer_not_linked' };

    const { data: trainerRow } = await sb
      .schema('app')
      .from('trainers')
      .select('id, first_name, last_name, email')
      .eq('id', parsedInput.trainerId)
      .maybeSingle();
    const t = trainerRow as { first_name: string; last_name: string; email: string | null } | null;
    if (!t) return { ok: false as const, error: 'trainer_not_found' };

    const templateId = await ensureTrainerSatisfactionTemplate(sb as never);

    // Anti-doublon : une assignation par (modèle, dossier, formateur), comme le
    // cron. Sans quoi deux liens vivraient en parallèle et deux réponses
    // partielles se disputeraient la même case.
    const { data: existante } = await sb
      .schema('app')
      .from('questionnaire_assignments')
      .select('id')
      .eq('template_id', templateId)
      .eq('dossier_id', parsedInput.dossierId)
      .eq('recipient_kind', 'trainer' as never)
      .eq('recipient_trainer_id', parsedInput.trainerId)
      .maybeSingle();

    let assignmentId = (existante as { id: string } | null)?.id ?? null;
    if (!assignmentId) {
      const { data: creee, error } = await sb
        .schema('app')
        .from('questionnaire_assignments')
        .insert({
          organization_id: d.organization_id,
          template_id: templateId,
          dossier_id: parsedInput.dossierId,
          recipient_kind: 'trainer',
          recipient_trainer_id: parsedInput.trainerId,
          recipient_email: t.email,
          recipient_name: `${t.first_name} ${t.last_name}`.trim(),
          token_hash: `pending-${randomUUID()}`,
          status: 'pending',
        } as never)
        .select('id')
        .single();
      if (error || !creee) return { ok: false as const, error: 'assignment_create_failed' };
      assignmentId = (creee as { id: string }).id;
    }

    const signed = await generateTrainerSatisfactionUrl(
      {
        assignmentId,
        dossierId: parsedInput.dossierId,
        organizationId: d.organization_id,
        trainerId: parsedInput.trainerId,
      },
      env.PUBLIC_APP_URL ?? '',
    );
    await sb
      .schema('app')
      .from('questionnaire_assignments')
      .update({ token_hash: createHash('sha256').update(signed.token).digest('hex') } as never)
      .eq('id', assignmentId);

    // Sans adresse, le lien reste affiché à l'écran : il se transmet à la main
    // plutôt que de perdre le questionnaire.
    let envoye = false;
    if (t.email) {
      const tpl = trainerSatisfactionEmail({
        firstName: t.first_name,
        formationTitle: formation?.title ?? 'la formation',
        surveyUrl: signed.url,
      });
      const r = await sendEmail({ to: t.email, subject: tpl.subject, html: tpl.html });
      envoye = r.ok;
    }

    revalidatePath(`/dossiers/${parsedInput.dossierId}/questionnaires`);
    return { ok: true as const, envoye, lien: signed.url };
  });


/**
 * Envoie le lien par e-mail, et dit si c'est parti.
 *
 * Écrit une fois pour l'entreprise et le financeur : le corps de l'e-mail est
 * le même, seules deux phrases changent. Deux fonctions auraient divergé.
 *
 * L'URL doit être absolue — un lien relatif dans un e-mail ne mène nulle part.
 * Sans `PUBLIC_APP_URL`, on ne tente donc même pas l'envoi : mieux vaut rendre
 * le lien à l'écran que d'expédier une adresse cassée.
 */
async function envoyerLienQuestionnaire(args: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sb: any;
  destinataire: 'entreprise' | 'financeur';
  email: string | null;
  prenom: string | null;
  organizationId: string;
  dossierId: string;
  titreQuestionnaire: string;
  lien: string;
  relance: boolean;
}): Promise<boolean> {
  const base = env.PUBLIC_APP_URL?.replace(/\/$/, '') ?? '';
  if (!args.email || base === '') return false;

  const [{ data: orgRow }, { data: dossierRow }] = await Promise.all([
    args.sb.schema('app').from('organizations').select('name').eq('id', args.organizationId).maybeSingle(),
    args.sb
      .schema('app')
      .from('dossiers')
      .select('formation:formations(title)')
      .eq('id', args.dossierId)
      .maybeSingle(),
  ]);
  const formationBrute = (dossierRow as { formation?: { title: string } | { title: string }[] } | null)?.formation;
  const formation = Array.isArray(formationBrute) ? formationBrute[0] : formationBrute;

  const tpl = questionnaireEmail({
    destinataire: args.destinataire,
    prenom: args.prenom,
    titreQuestionnaire: args.titreQuestionnaire,
    formationTitle: formation?.title ?? null,
    organisme: (orgRow as { name?: string } | null)?.name ?? 'Votre organisme de formation',
    url: `${base}${args.lien}`,
    relance: args.relance,
  });
  const r = await sendEmail({ to: args.email, subject: tpl.subject, html: tpl.html });
  return r.ok;
}

const CompanySchema = z.object({
  dossierId: z.string().uuid(),
  /** Contact de l'entreprise qui répondra ; il porte l'adresse. */
  contactId: z.string().uuid(),
});

/**
 * Envoie le questionnaire de satisfaction à l'entreprise cliente.
 *
 * L'organisme interrogeait le stagiaire, le financeur et le formateur — jamais
 * celui qui paie et qui décide de recommencer. Qualiopi attend pourtant le
 * retour des parties prenantes, et l'entreprise en est une.
 *
 * Le destinataire est un CONTACT, pas l'entreprise : c'est une personne qui
 * répond, et c'est elle qui porte l'adresse. Le lien sort à l'écran plutôt que
 * de partir par e-mail — l'envoi se fait depuis la messagerie de l'organisme,
 * avec le mot qui va avec.
 */
export const sendCompanyQuestionnaire = authActionClient
  .schema(CompanySchema)
  .action(async ({ parsedInput, ctx }) => {
    const sb = ctx.supabase;
    const { data: dossier } = await sb
      .schema('app')
      .from('dossiers')
      .select('id, organization_id, company_id')
      .eq('id', parsedInput.dossierId)
      .maybeSingle();
    if (!dossier) return { ok: false as const, error: 'dossier_not_found' };
    const d = dossier as { organization_id: string; company_id: string | null };
    if (!d.company_id) return { ok: false as const, error: 'no_company' };

    // Le contact doit appartenir à l'entreprise du dossier : l'identifiant
    // vient de l'écran, et un contact d'un autre client recevrait sinon le
    // questionnaire de celui-ci.
    const { data: contactRow } = await sb
      .schema('app')
      .from('contacts')
      .select('id, first_name, last_name, email')
      .eq('id', parsedInput.contactId)
      .eq('company_id', d.company_id)
      .is('deleted_at', null)
      .maybeSingle();
    const c = contactRow as { first_name: string | null; last_name: string | null; email: string | null } | null;
    if (!c) return { ok: false as const, error: 'contact_not_linked' };

    const templateId = await ensureCompanySatisfactionTemplate(sb as never);

    // Une assignation par (modèle, dossier, contact) : deux liens en parallèle
    // donneraient deux réponses partielles sur la même case.
    const { data: existante } = await sb
      .schema('app')
      .from('questionnaire_assignments')
      .select('id')
      .eq('template_id', templateId)
      .eq('dossier_id', parsedInput.dossierId)
      .eq('recipient_kind', 'company_rep' as never)
      .eq('recipient_contact_id' as never, parsedInput.contactId)
      .maybeSingle();

    let assignmentId = (existante as { id: string } | null)?.id ?? null;
    if (!assignmentId) {
      const { data: creee, error } = await sb
        .schema('app')
        .from('questionnaire_assignments')
        .insert({
          organization_id: d.organization_id,
          template_id: templateId,
          dossier_id: parsedInput.dossierId,
          recipient_kind: 'company_rep',
          recipient_contact_id: parsedInput.contactId,
          recipient_email: c.email,
          recipient_name: `${c.first_name ?? ''} ${c.last_name ?? ''}`.trim() || null,
          token_hash: `pending-${randomUUID()}`,
          status: 'pending',
        } as never)
        .select('id')
        .single();
      if (error || !creee) return { ok: false as const, error: 'assignment_create_failed', details: error?.message };
      assignmentId = (creee as { id: string }).id;
    }

    const signed = await generateQuestionnaireToken({
      assignmentId,
      dossierId: parsedInput.dossierId,
      organizationId: d.organization_id,
    });
    await sb
      .schema('app')
      .from('questionnaire_assignments')
      .update({ token_hash: createHash('sha256').update(signed.token).digest('hex') } as never)
      .eq('id', assignmentId);

    const lien = `/questionnaire/entreprise/${signed.token}`;
    const envoye = await envoyerLienQuestionnaire({
      sb,
      destinataire: 'entreprise',
      email: c.email,
      prenom: c.first_name,
      organizationId: d.organization_id,
      dossierId: parsedInput.dossierId,
      titreQuestionnaire: 'Votre retour sur la formation',
      lien,
      relance: Boolean(existante),
    });

    revalidatePath(`/dossiers/${parsedInput.dossierId}/questionnaires`);
    // Le lien reste rendu : sans adresse, ou si l'envoi échoue, il se transmet
    // à la main plutôt que de perdre le questionnaire.
    return { ok: true as const, lien, envoye, sansAdresse: !c.email };
  });

const RelanceSchema = z.object({
  assignmentId: z.string().uuid(),
  dossierId: z.string().uuid(),
});

export type RelanceResult = { ok: true; message: string } | { ok: false; error: string };

/**
 * Relance un questionnaire resté sans réponse, quel que soit son destinataire.
 *
 * Un seul geste, quatre destinataires : l'écran ne devrait pas avoir à savoir
 * lequel il relance. La fonction lit l'assignation, reconnaît le destinataire,
 * et repart par le chemin qui lui convient — jeton formateur pour un formateur,
 * jeton générique pour une entreprise ou un financeur.
 *
 * Un questionnaire DÉJÀ RÉPONDU ne se relance pas : renvoyer un lien à
 * quelqu'un qui a pris le temps de répondre est la meilleure façon de ne plus
 * jamais obtenir de réponse.
 *
 * L'assignation n'est pas recréée : c'est la même, avec le même jeton. Un
 * second lien vivrait en parallèle du premier, et deux réponses partielles se
 * disputeraient la même case.
 */
export async function relancerQuestionnaire(brut: z.input<typeof RelanceSchema>): Promise<RelanceResult> {
  const garde = await guardAction('crm');
  if (!garde.ok) return { ok: false, error: garde.error };
  const p = RelanceSchema.safeParse(brut);
  if (!p.success) return { ok: false, error: 'Saisie invalide.' };

  const sb = adminClient();
  const { data: row } = await sb
    .schema('app')
    .from('questionnaire_assignments')
    .select('id, status, recipient_kind, recipient_email, recipient_name, recipient_trainer_id, template_id')
    .eq('id', p.data.assignmentId)
    .eq('dossier_id', p.data.dossierId)
    .eq('organization_id', garde.member.organizationId)
    .maybeSingle();
  const a = row as {
    status: string;
    recipient_kind: string;
    recipient_email: string | null;
    recipient_name: string | null;
    recipient_trainer_id: string | null;
    template_id: string;
  } | null;
  if (!a) return { ok: false, error: 'Questionnaire introuvable.' };
  if (a.status === 'completed') return { ok: false, error: 'Déjà répondu — rien à relancer.' };
  if (!a.recipient_email) {
    return { ok: false, error: 'Aucune adresse enregistrée pour ce destinataire.' };
  }

  const base = env.PUBLIC_APP_URL?.replace(/\/$/, '') ?? '';
  if (base === '') return { ok: false, error: 'Adresse publique de l’application non configurée.' };

  const { data: tplRow } = await sb
    .schema('app')
    .from('questionnaire_templates')
    .select('title')
    .eq('id', a.template_id)
    .maybeSingle();
  const titre = (tplRow as { title?: string } | null)?.title ?? 'Questionnaire';

  // Le jeton se régénère à l'identique : même assignation, même contenu signé.
  if (a.recipient_kind === 'trainer' && a.recipient_trainer_id) {
    const { data: d } = await sb
      .schema('app')
      .from('dossiers')
      .select('organization_id, formation:formations(title)')
      .eq('id', p.data.dossierId)
      .maybeSingle();
    const dossier = d as unknown as {
      organization_id: string;
      formation: { title: string } | { title: string }[] | null;
    } | null;
    if (!dossier) return { ok: false, error: 'Dossier introuvable.' };
    const formation = Array.isArray(dossier.formation) ? dossier.formation[0] : dossier.formation;
    const signed = await generateTrainerSatisfactionUrl(
      {
        assignmentId: p.data.assignmentId,
        dossierId: p.data.dossierId,
        organizationId: dossier.organization_id,
        trainerId: a.recipient_trainer_id,
      },
      base,
    );
    const tpl = trainerSatisfactionEmail({
      firstName: a.recipient_name?.split(' ')[0] ?? null,
      formationTitle: formation?.title ?? 'la formation',
      surveyUrl: signed.url,
    });
    const r = await sendEmail({ to: a.recipient_email, subject: tpl.subject, html: tpl.html });
    return r.ok
      ? { ok: true, message: `Relance envoyée à ${a.recipient_email}.` }
      : { ok: false, error: 'L’e-mail n’est pas parti.' };
  }

  if (a.recipient_kind === 'company_rep' || a.recipient_kind === 'funder') {
    const signed = await generateQuestionnaireToken({
      assignmentId: p.data.assignmentId,
      dossierId: p.data.dossierId,
      organizationId: garde.member.organizationId,
    });
    await sb
      .schema('app')
      .from('questionnaire_assignments')
      .update({ token_hash: createHash('sha256').update(signed.token).digest('hex') } as never)
      .eq('id', p.data.assignmentId);
    const entreprise = a.recipient_kind === 'company_rep';
    const envoye = await envoyerLienQuestionnaire({
      sb,
      destinataire: entreprise ? 'entreprise' : 'financeur',
      email: a.recipient_email,
      prenom: a.recipient_name?.split(' ')[0] ?? null,
      organizationId: garde.member.organizationId,
      dossierId: p.data.dossierId,
      titreQuestionnaire: titre,
      lien: `/questionnaire/${entreprise ? 'entreprise' : 'financeur'}/${signed.token}`,
      relance: true,
    });
    revalidatePath(`/dossiers/${p.data.dossierId}/questionnaires`);
    return envoye
      ? { ok: true, message: `Relance envoyée à ${a.recipient_email}.` }
      : { ok: false, error: 'L’e-mail n’est pas parti.' };
  }

  // Le stagiaire répond depuis son espace : sa relance passe par la fiche
  // besoin, qui sait déjà retrouver son lien et ne pas le renvoyer deux fois.
  return {
    ok: false,
    error: 'Le stagiaire répond depuis son espace — relancez-le depuis l’onglet Fiches besoin de la séance.',
  };
}
