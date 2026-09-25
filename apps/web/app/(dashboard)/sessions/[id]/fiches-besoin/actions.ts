'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@supabase/supabase-js';
import { env } from '@/env.mjs';
import { guardAction } from '@/shared/lib/auth/guard-action';
import { ensureNeedsAnalysisTemplate, sendNeedsAnalysisForLearner } from '@/features/questionnaire/needs-analysis';
import {
  nettoyerReponses,
  ficheBesoinRemplie,
  type ReponsesFicheBesoin,
} from '@/features/questionnaire/fiche-besoin';
import { questionsFicheBesoin, clesDeQuestions } from '@/features/questionnaire/modele-fiche-besoin';

/**
 * Fiche besoin d'un stagiaire, depuis la séance : la renvoyer, ou la remplir.
 *
 * L'écran ne savait qu'afficher les réponses reçues. Or c'est en préparant la
 * séance qu'on voit qui n'a pas répondu — et qu'on l'appelle pour noter son
 * besoin à sa place.
 */

const admin = () =>
  createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

export type FicheResult = { ok: true; message: string } | { ok: false; error: string };

/** Le stagiaire doit appartenir à l'organisme du membre : l'id vient de l'écran. */
async function apprenantDeLOrganisme(
  sb: ReturnType<typeof admin>,
  learnerId: string,
  organizationId: string,
): Promise<boolean> {
  const { data } = await sb
    .schema('app')
    .from('learners')
    .select('id')
    .eq('id', learnerId)
    .eq('organization_id', organizationId)
    .is('deleted_at', null)
    .maybeSingle();
  return Boolean(data);
}

export async function renvoyerFicheBesoin(learnerId: string, sessionId: string): Promise<FicheResult> {
  const garde = await guardAction('qualiopi');
  if (!garde.ok) return { ok: false, error: garde.error };

  const sb = admin();
  if (!(await apprenantDeLOrganisme(sb, learnerId, garde.member.organizationId))) {
    return { ok: false, error: 'Stagiaire introuvable.' };
  }

  const r = await sendNeedsAnalysisForLearner({ learnerId, sb });
  revalidatePath(`/sessions/${sessionId}/fiches-besoin`);

  if (!r.ok) return { ok: false, error: 'L’envoi a échoué.' };
  // Chaque issue dit quelque chose d'utile : un « rien envoyé » sans raison
  // laisserait croire à une panne.
  const MESSAGES: Record<string, string> = {
    sent: 'Fiche besoin envoyée.',
    reused_inscription: 'Déjà renseignée à l’inscription : rien n’a été renvoyé.',
    skipped_existing: 'Une fiche est déjà en attente de réponse.',
    no_email: 'Ce stagiaire n’a pas d’adresse e-mail.',
    no_base_url: 'Adresse publique de l’application non configurée (PUBLIC_APP_URL).',
    not_found: 'Stagiaire ou dossier introuvable.',
  };
  const message = MESSAGES[r.status] ?? 'Envoi traité.';
  return r.status === 'no_email' || r.status === 'no_base_url' || r.status === 'not_found'
    ? { ok: false, error: message }
    : { ok: true, message };
}

/**
 * Saisie par l'organisme, typiquement au téléphone.
 *
 * On écrit là où l'écran lit — une assignation et sa réponse — plutôt que dans
 * la demande : à ce stade le dossier existe, et c'est lui qui porte la preuve
 * attendue en audit. `input_by` distingue ce que le stagiaire a dit de ce que
 * nous avons noté pour lui.
 */
export async function saisirFicheBesoinApprenant(
  learnerId: string,
  dossierId: string,
  sessionId: string,
  reponses: ReponsesFicheBesoin,
): Promise<FicheResult> {
  const garde = await guardAction('qualiopi');
  if (!garde.ok) return { ok: false, error: garde.error };

  const questions = await questionsFicheBesoin(admin() as never, garde.member.organizationId);
  const propres = nettoyerReponses(reponses, clesDeQuestions(questions));
  if (!ficheBesoinRemplie(propres as ReponsesFicheBesoin)) {
    return { ok: false, error: 'Indiquez au moins une réponse.' };
  }

  const sb = admin();
  const orgId = garde.member.organizationId;
  if (!(await apprenantDeLOrganisme(sb, learnerId, orgId))) {
    return { ok: false, error: 'Stagiaire introuvable.' };
  }

  const templateId = await ensureNeedsAnalysisTemplate(sb, orgId);

  const { data: existante } = await sb
    .schema('app')
    .from('questionnaire_assignments')
    .select('id')
    .eq('template_id', templateId)
    .eq('dossier_id', dossierId)
    .eq('recipient_learner_id', learnerId)
    .maybeSingle();

  let assignmentId = (existante as { id: string } | null)?.id ?? null;
  if (!assignmentId) {
    const { data: creee, error } = await sb
      .schema('app')
      .from('questionnaire_assignments')
      .insert({
        organization_id: orgId,
        template_id: templateId,
        dossier_id: dossierId,
        recipient_kind: 'learner',
        recipient_learner_id: learnerId,
        status: 'completed',
      } as never)
      .select('id')
      .single();
    if (error || !creee) {
      console.error('[fiche besoin] assignation impossible', learnerId, error?.message);
      return { ok: false, error: 'La saisie n’a pas pu être enregistrée.' };
    }
    assignmentId = (creee as { id: string }).id;
  }

  const { error: erreurReponse } = await sb
    .schema('app')
    .from('questionnaire_responses')
    .upsert(
      {
        organization_id: orgId,
        assignment_id: assignmentId,
        template_id: templateId,
        dossier_id: dossierId,
        answers: propres,
        metadata: { input_by: 'admin', input_user_id: garde.member.userId },
      } as never,
      { onConflict: 'assignment_id' },
    );
  if (erreurReponse) {
    console.error('[fiche besoin] réponse non enregistrée', learnerId, erreurReponse.message);
    return { ok: false, error: 'La saisie n’a pas pu être enregistrée.' };
  }

  await sb
    .schema('app')
    .from('questionnaire_assignments')
    .update({ status: 'completed' } as never)
    .eq('id', assignmentId);

  revalidatePath(`/sessions/${sessionId}/fiches-besoin`);
  return { ok: true, message: 'Fiche besoin enregistrée.' };
}
