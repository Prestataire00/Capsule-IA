import 'server-only';
// Relancer UN questionnaire resté sans réponse, quel que soit son destinataire.
//
// Écrit une fois pour le bouton « Relancer » du dossier et pour la relance
// automatique à J+3 : deux copies auraient fini par envoyer des liens
// différents à la même personne. L'assignation n'est jamais recréée — c'est la
// même, avec un lien qui mène à la même réponse.

import { createHash } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { env } from '@/env.mjs';
import { sendEmail } from '@/shared/lib/email/resend';
import { questionnaireEmail, type DestinataireQuestionnaire } from '@/shared/lib/email/questionnaire-email';
import { expediteurDeLOrganisme } from '@/shared/lib/email/expediteur-organisme';
import { generateQuestionnaireToken } from '@/shared/lib/questionnaire-token';
import { generateSatisfactionUrl } from '@/shared/lib/satisfaction-token';
import { generateTrainerSatisfactionUrl } from '@/shared/lib/trainer-satisfaction-token';
import { TRAINER_SAT_TEMPLATE_CODE } from './satisfaction-formateur';
import { RATTRAPAGE_JOURS, aRelancer, cleRelance, estSatisfaction } from './relance-satisfaction';
import { loadReglesParOrganisme } from '@/features/emails/programmation-store';
import { REGLABLES, reglageEffectif } from '@/features/emails/programmation-envois';
import { lienStagiaire } from './lien-stagiaire';
import { referentsDesDossiers } from '@/features/espace-entreprise/referents';
import { liensStagiairesReferentEmail } from '@/shared/lib/email/templates';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Client = SupabaseClient<any, any, any>;

export type RelanceResultat = { ok: true; email: string } | { ok: false; raison: string };

/** Le modèle système de satisfaction à chaud : sa page publique n'affiche que lui. */
const SATISFACTION_STAGIAIRE_CODE = 'satisfaction_chaud_default';

const DESTINATAIRE: Record<string, DestinataireQuestionnaire> = {
  learner: 'apprenant',
  trainer: 'formateur',
  company_rep: 'entreprise',
  funder: 'financeur',
};

export async function relancerAssignation(
  sb: Client,
  assignmentId: string,
  opts: { automatique: boolean; idempotencyKey?: string },
): Promise<RelanceResultat> {
  const { data: row } = await sb
    .schema('app')
    .from('questionnaire_assignments')
    .select('id, organization_id, dossier_id, status, recipient_kind, recipient_email, recipient_name, recipient_learner_id, recipient_trainer_id, template:questionnaire_templates(title, code)')
    .eq('id', assignmentId)
    .maybeSingle();
  const a = row as unknown as {
    id: string;
    organization_id: string;
    dossier_id: string | null;
    status: string;
    recipient_kind: string;
    recipient_email: string | null;
    recipient_name: string | null;
    recipient_learner_id: string | null;
    recipient_trainer_id: string | null;
    template: { title: string; code: string | null } | { title: string; code: string | null }[] | null;
  } | null;
  if (!a) return { ok: false, raison: 'Questionnaire introuvable.' };
  // Relancer quelqu'un qui a répondu est la meilleure façon de ne plus jamais
  // obtenir de réponse.
  if (a.status === 'completed') return { ok: false, raison: 'Déjà répondu — rien à relancer.' };
  if (!a.dossier_id) return { ok: false, raison: 'Questionnaire sans dossier.' };
  const modele = Array.isArray(a.template) ? a.template[0] : a.template;

  const base = env.PUBLIC_APP_URL?.trim().replace(/\/$/, '') ?? '';
  if (!base) return { ok: false, raison: 'Adresse publique de l’application non configurée.' };

  // Un stagiaire est relancé par son entreprise : un e-mail au référent, avec
  // le lien personnel du stagiaire à lui transmettre.
  if (a.recipient_kind === 'learner' && a.recipient_learner_id) {
    const [referents, { data: l }, expediteur] = await Promise.all([
      referentsDesDossiers(sb, [a.dossier_id]),
      sb.schema('app').from('learners').select('first_name, last_name').eq('id', a.recipient_learner_id).maybeSingle(),
      expediteurDeLOrganisme(sb, a.organization_id),
    ]);
    const ref = referents.get(a.dossier_id);
    if (!ref) return { ok: false, raison: 'Ce dossier n’a ni référent ni contact d’entreprise à qui écrire.' };
    const lien =
      modele?.code === SATISFACTION_STAGIAIRE_CODE
        ? (await generateSatisfactionUrl({ assignmentId: a.id, dossierId: a.dossier_id, organizationId: a.organization_id, learnerId: a.recipient_learner_id }, base)).url
        : await lienStagiaire(base, 'questionnaire', {
            learnerId: a.recipient_learner_id,
            organizationId: a.organization_id,
            dossierId: a.dossier_id,
            cibleId: a.id,
          });
    const stagiaire = l as { first_name: string | null; last_name: string | null } | null;
    const nom = `${stagiaire?.first_name ?? ''} ${stagiaire?.last_name ?? ''}`.trim() || a.recipient_name || 'Votre stagiaire';
    const tpl = liensStagiairesReferentEmail({
      prenom: ref.prenom,
      objet: `Rappel — « ${modele?.title ?? 'Questionnaire'} » pour ${nom}`,
      intro: `${nom} n’a pas encore répondu à « ${modele?.title ?? 'son questionnaire'} ». Pourriez-vous lui transmettre son lien ?`,
      stagiaires: [{ nom, lien }],
      organisme: expediteur.nom,
      libelleLien: 'son questionnaire',
    });
    const r = await sendEmail({
      to: ref.email,
      from: expediteur.from,
      ...(expediteur.email ? { replyTo: expediteur.email } : {}),
      subject: tpl.subject,
      html: tpl.html,
      organizationId: a.organization_id,
      dossierId: a.dossier_id,
      kind: opts.automatique ? 'relance_satisfaction' : 'relance_questionnaire',
      metadata: { assignment_id: a.id, via: 'referent' },
      ...(opts.idempotencyKey ? { idempotencyKey: opts.idempotencyKey } : {}),
    });
    if (!r.ok) return { ok: false, raison: r.reason === 'duplicate' ? 'Déjà relancé.' : 'L’e-mail n’est pas parti.' };
    return { ok: true, email: ref.email };
  }

  let email = a.recipient_email;
  if (!email && a.recipient_kind === 'learner' && a.recipient_learner_id) {
    const { data: l } = await sb.schema('app').from('learners').select('email').eq('id', a.recipient_learner_id).maybeSingle();
    email = (l as { email: string | null } | null)?.email ?? null;
  }
  if (!email || email.toLowerCase().endsWith('.invalid')) return { ok: false, raison: 'Aucune adresse enregistrée pour ce destinataire.' };

  // Le lien, par le chemin qui convient au destinataire et au modèle.
  const ctx = { assignmentId: a.id, dossierId: a.dossier_id, organizationId: a.organization_id };
  let url: string;
  if (a.recipient_kind === 'trainer' && a.recipient_trainer_id && modele?.code === TRAINER_SAT_TEMPLATE_CODE) {
    url = (await generateTrainerSatisfactionUrl({ ...ctx, trainerId: a.recipient_trainer_id }, base)).url;
  } else if (a.recipient_kind !== 'learner') {
    const signed = await generateQuestionnaireToken(ctx);
    await sb
      .schema('app')
      .from('questionnaire_assignments')
      .update({ token_hash: createHash('sha256').update(signed.token).digest('hex') } as never)
      .eq('id', a.id);
    url = `${base}/questionnaire/${a.recipient_kind === 'company_rep' ? 'entreprise' : 'financeur'}/${signed.token}`;
  } else {
    return { ok: false, raison: 'Stagiaire introuvable.' };
  }

  const [{ data: d }, expediteur] = await Promise.all([
    sb.schema('app').from('dossiers').select('formation:formations(title)').eq('id', a.dossier_id).maybeSingle(),
    expediteurDeLOrganisme(sb, a.organization_id),
  ]);
  const f = (d as { formation?: { title: string } | { title: string }[] | null } | null)?.formation;
  const formation = Array.isArray(f) ? f[0] : f;

  const tpl = questionnaireEmail({
    destinataire: DESTINATAIRE[a.recipient_kind] ?? 'financeur',
    prenom: a.recipient_name?.split(' ')[0] ?? null,
    titreQuestionnaire: modele?.title ?? 'Questionnaire',
    formationTitle: formation?.title ?? null,
    organisme: expediteur.nom,
    url,
    relance: true,
  });
  const r = await sendEmail({
    to: email,
    from: expediteur.from,
    ...(expediteur.email ? { replyTo: expediteur.email } : {}),
    subject: tpl.subject,
    html: tpl.html,
    organizationId: a.organization_id,
    dossierId: a.dossier_id,
    kind: opts.automatique ? 'relance_satisfaction' : 'relance_questionnaire',
    metadata: { assignment_id: a.id },
    ...(opts.idempotencyKey ? { idempotencyKey: opts.idempotencyKey } : {}),
  });
  if (!r.ok) return { ok: false, raison: r.reason === 'duplicate' ? 'Déjà relancé.' : 'L’e-mail n’est pas parti.' };
  return { ok: true, email };
}

/**
 * Passage quotidien : relance à J+3 chaque questionnaire de satisfaction resté
 * sans réponse. Une fois par questionnaire — la clé d'unicité en fait foi.
 */
export async function runRelancesSatisfaction(sb: Client, maintenant = new Date()): Promise<{ candidates: number; sent: number; errors: string[] }> {
  // Le délai se règle par organisme (Envois automatiques) : on interroge la
  // fenêtre la plus large, puis chacun est jugé sur SON réglage.
  const bornes = REGLABLES.relance_satisfaction?.delai;
  const regles = await loadReglesParOrganisme(sb, 'relance_satisfaction');
  const depuis = new Date(maintenant.getTime() - ((bornes?.max ?? 14) + RATTRAPAGE_JOURS) * 86_400_000).toISOString();
  const jusqua = new Date(maintenant.getTime() - (bornes?.min ?? 1) * 86_400_000).toISOString();
  const { data, error } = await sb
    .schema('app')
    .from('questionnaire_assignments')
    .select('id, organization_id, status, created_at, template:questionnaire_templates(kind, code)')
    .in('status', ['pending', 'in_progress'])
    .gte('created_at', depuis)
    .lte('created_at', jusqua)
    .limit(1000);
  if (error) return { candidates: 0, sent: 0, errors: [`relances satisfaction : ${error.message}`] };

  type Ligne = { id: string; organization_id: string; status: string; created_at: string; template: { kind: string; code: string | null } | { kind: string; code: string | null }[] | null };
  const aTraiter = ((data ?? []) as unknown as Ligne[]).filter((l) => {
    const t = Array.isArray(l.template) ? l.template[0] : l.template;
    const reglage = reglageEffectif('relance_satisfaction', regles.get(l.organization_id));
    return t && reglage.actif && estSatisfaction(t) && aRelancer(l, maintenant, reglage.delaiJours);
  });

  let sent = 0;
  const errors: string[] = [];
  for (const l of aTraiter) {
    try {
      const r = await relancerAssignation(sb, l.id, { automatique: true, idempotencyKey: cleRelance(l.id) });
      if (r.ok) sent++;
      // Sans adresse, déjà relancé ou déjà répondu : rien d'anormal.
      else if (r.raison === 'L’e-mail n’est pas parti.') errors.push(`relance ${l.id} : envoi échoué`);
    } catch (e) {
      errors.push(`relance ${l.id} : ${e instanceof Error ? e.message : 'échec'}`);
    }
  }
  return { candidates: aTraiter.length, sent, errors };
}
