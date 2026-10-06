'use server';

import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { env } from '@/env.mjs';
import { supabaseAdmin } from '@/shared/lib/supabase/admin';
import { sendEmail } from '@/shared/lib/email/resend';
import { lienStagiaire } from '@/features/questionnaire/lien-stagiaire';
import { referentsDesDossiers } from '@/features/espace-entreprise/referents';
import { liensStagiairesReferentEmail } from '@/shared/lib/email/templates';
import { requireMyTrainerSession } from '@/features/trainer-space/guard';
import { loadSessionsByIds } from '@/features/trainer-space/my-sessions';
import { questionnaireInvitationEmail } from '@/features/trainer-space/questionnaire-email';
import { TRAINER_SENDABLE_KINDS, isSatisfactionKind } from '@/features/trainer-space/questionnaires';

const sendSchema = z.object({ sessionId: z.string().uuid(), templateId: z.string().uuid() });

export type SendQuestionnaireResult =
  | { ok: true; assigned: number; skipped: number; sent: number; withoutEmail: string[] }
  | { ok: false; error: string };

/**
 * Le formateur envoie un questionnaire à tous les apprenants attendus de SA
 * séance : une affectation par apprenant (dossier de la séance), puis les
 * liens personnels des stagiaires partent groupés au référent de leur
 * entreprise, qui les transmet (plus d'espace apprenant : point Capsule IA du
 * 05/10/2026). Un particulier reçoit le sien. Déjà envoyé : sauté.
 */
export async function sendSessionQuestionnaire(input: { sessionId: string; templateId: string }): Promise<SendQuestionnaireResult> {
  const p = sendSchema.safeParse(input);
  if (!p.success) return { ok: false, error: 'invalid_payload' };
  const acces = await requireMyTrainerSession(p.data.sessionId);
  if (!acces.ok) return acces;
  const s = acces.session;
  const admin = supabaseAdmin();

  const { data: tpl } = await admin
    .schema('app')
    .from('questionnaire_templates')
    .select('id, title, kind, organization_id')
    .eq('id', p.data.templateId)
    .eq('is_active', true)
    .is('deleted_at', null)
    .maybeSingle();
  const modele = tpl as { id: string; title: string; kind: string; organization_id: string | null } | null;
  if (
    !modele ||
    (modele.organization_id !== null && modele.organization_id !== s.organization_id) ||
    !(TRAINER_SENDABLE_KINDS as readonly string[]).includes(modele.kind)
  ) {
    return { ok: false, error: 'template_not_allowed' };
  }

  const [{ data: attendus }, { data: liens }] = await Promise.all([
    admin.schema('app').rpc('session_expected_signers' as never, { p_session_id: s.id } as never),
    admin.schema('app').from('session_dossiers').select('dossier_id').eq('session_id', s.id),
  ]);
  const learnerIds = ((attendus ?? []) as { participant_kind: string; participant_id: string }[])
    .filter((e) => e.participant_kind === 'learner')
    .map((e) => e.participant_id);
  const dossierIds = [...new Set([s.dossier_id, ...((liens ?? []) as { dossier_id: string }[]).map((l) => l.dossier_id)].filter((x): x is string => Boolean(x)))];
  const [{ data: dossiers }, { data: learners }, [seance]] = await Promise.all([
    dossierIds.length
      ? admin.schema('app').from('dossiers').select('id, learner_id').in('id', dossierIds).is('deleted_at', null)
      : Promise.resolve({ data: [] }),
    learnerIds.length
      ? admin.schema('app').from('learners').select('id, first_name, last_name, email').in('id', learnerIds)
      : Promise.resolve({ data: [] }),
    loadSessionsByIds(admin, [s.id], { from: new Date(0), to: new Date('2100-01-01') }),
  ]);
  const dossierDe = new Map(((dossiers ?? []) as { id: string; learner_id: string }[]).map((d) => [d.learner_id, d.id]));
  const base = (env.PUBLIC_APP_URL ?? '').replace(/\/$/, '');

  let assigned = 0;
  let skipped = 0;
  let sent = 0;
  const withoutEmail: string[] = [];
  const aEnvoyer: Array<{ dossierId: string; nom: string; prenom: string; email: string | null; lien: string }> = [];
  for (const l of (learners ?? []) as { id: string; first_name: string | null; last_name: string | null; email: string | null }[]) {
    const dossierId = dossierDe.get(l.id);
    const nom = `${l.first_name ?? ''} ${l.last_name ?? ''}`.trim() || 'Apprenant';
    if (!dossierId) {
      skipped++;
      continue;
    }
    const { data: deja } = await admin
      .schema('app')
      .from('questionnaire_assignments')
      .select('id')
      .eq('dossier_id', dossierId)
      .eq('recipient_learner_id', l.id)
      .eq('template_id', modele.id)
      .neq('status', 'expired')
      .limit(1);
    if ((deja ?? []).length > 0) {
      skipped++;
      continue;
    }
    const { data: creee, error } = await admin
      .schema('app')
      .from('questionnaire_assignments')
      .insert({
        organization_id: s.organization_id,
        template_id: modele.id,
        dossier_id: dossierId,
        recipient_kind: 'learner',
        recipient_learner_id: l.id,
        recipient_email: l.email,
        recipient_name: nom,
        token_hash: `pending-${randomUUID()}`,
        status: 'pending',
        session_id: s.id,
        sent_by_trainer_id: acces.trainerId,
      } as never)
      .select('id')
      .single();
    if (error || !creee) {
      console.error('[espace formateur] affectation refusée', error?.message);
      continue;
    }
    assigned++;

    if (!base) {
      withoutEmail.push(nom);
      continue;
    }
    const lien = await lienStagiaire(base, 'questionnaire', {
      learnerId: l.id,
      organizationId: s.organization_id,
      dossierId,
      cibleId: (creee as { id: string }).id,
    });
    aEnvoyer.push({ dossierId, nom, prenom: l.first_name ?? '', email: l.email, lien });
  }

  // Les liens des salariés d'une entreprise partent ensemble à son référent ;
  // un particulier (sans référent) reçoit le sien.
  const referents = await referentsDesDossiers(admin as never, [...new Set(aEnvoyer.map((x) => x.dossierId))]);
  const groupes = new Map<string, { prenom: string; stagiaires: Array<{ nom: string; lien: string }> }>();
  for (const x of aEnvoyer) {
    const ref = referents.get(x.dossierId);
    if (ref) {
      const g = groupes.get(ref.email) ?? { prenom: ref.prenom, stagiaires: [] };
      g.stagiaires.push({ nom: x.nom, lien: x.lien });
      groupes.set(ref.email, g);
      continue;
    }
    if (!x.email) {
      withoutEmail.push(x.nom);
      continue;
    }
    const mail = questionnaireInvitationEmail({
      firstName: x.prenom,
      trainerName: acces.trainerName,
      questionnaireTitle: modele.title,
      formationTitle: seance?.title ?? 'votre formation',
      url: x.lien,
      anonymous: isSatisfactionKind(modele.kind),
    });
    const r = await sendEmail({
      to: x.email,
      subject: mail.subject,
      html: mail.html,
      organizationId: s.organization_id,
      dossierId: x.dossierId,
      kind: 'questionnaire_invitation',
      metadata: { session_id: s.id, template_id: modele.id, sent_by_trainer_id: acces.trainerId },
    });
    if (r.ok) sent++;
    else withoutEmail.push(x.nom);
  }
  const { data: org } = await admin.schema('app').from('organizations').select('name').eq('id', s.organization_id).maybeSingle();
  for (const [email, g] of groupes) {
    const tpl = liensStagiairesReferentEmail({
      prenom: g.prenom,
      objet: `« ${modele.title} » — à transmettre à vos stagiaires`,
      intro: `${acces.trainerName} vous adresse le questionnaire « ${modele.title} » pour ${seance?.title ?? 'la formation'}. Merci de transmettre à chacun de vos stagiaires son lien personnel.`,
      stagiaires: g.stagiaires,
      organisme: (org as { name: string | null } | null)?.name ?? 'Votre organisme de formation',
      libelleLien: 'son questionnaire',
    });
    const r = await sendEmail({
      to: email,
      subject: tpl.subject,
      html: tpl.html,
      organizationId: s.organization_id,
      kind: 'questionnaire_invitation',
      metadata: { session_id: s.id, template_id: modele.id, sent_by_trainer_id: acces.trainerId, groupe: true, stagiaires: g.stagiaires.length },
    });
    if (r.ok) sent += g.stagiaires.length;
    else withoutEmail.push(...g.stagiaires.map((x) => x.nom));
  }

  revalidatePath(`/seance/${s.id}/questionnaires`);
  return { ok: true, assigned, skipped, sent, withoutEmail };
}
