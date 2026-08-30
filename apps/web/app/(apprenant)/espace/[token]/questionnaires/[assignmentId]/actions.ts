'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { verifyApprenantToken } from '@/shared/lib/apprenant-token';
import { supabaseAdmin } from '@/shared/lib/supabase/admin';
import { validateAnswers, type Answers, type QuestionnaireSchema } from '@/features/questionnaire/schema';

/** Soumission d'un questionnaire assigné depuis l'espace apprenant. */
export async function submitApprenantQuestionnaire(formData: FormData): Promise<void> {
  const token = (formData.get('token') as string | null) ?? '';
  const assignmentId = (formData.get('assignmentId') as string | null) ?? '';
  const base = `/espace/${token}/questionnaires`;

  const verified = await verifyApprenantToken(token);
  if (!verified.ok || !assignmentId) redirect(`${base}?error=invalid`);
  const { learnerId, organizationId, dossierId } = verified.value;

  const admin = supabaseAdmin();

  // Charge l'assignment + vérifie l'appartenance à l'apprenant du token.
  const { data: a } = await admin
    .schema('app')
    .from('questionnaire_assignments')
    .select('id, recipient_learner_id, template_id')
    .eq('id', assignmentId)
    .maybeSingle();
  const assignment = a as { recipient_learner_id: string | null; template_id: string } | null;
  if (!assignment || assignment.recipient_learner_id !== learnerId) redirect(`${base}?error=invalid`);

  // Idempotence : une seule réponse par assignment.
  const { data: existing } = await admin
    .schema('app')
    .from('questionnaire_responses')
    .select('id')
    .eq('assignment_id', assignmentId)
    .maybeSingle();
  if (existing) redirect(`${base}?done=already`);

  const { data: t } = await admin
    .schema('app')
    .from('questionnaire_templates')
    .select('schema')
    .eq('id', assignment.template_id)
    .maybeSingle();
  const schema = ((t as { schema: QuestionnaireSchema } | null)?.schema ?? { questions: [] }) as QuestionnaireSchema;

  // Construit les réponses depuis le FormData selon le schéma.
  const answers: Answers = {};
  for (const q of schema.questions) {
    const raw = formData.get(q.id);
    if (raw === null || raw === '') continue;
    answers[q.id] = q.type === 'nps' || q.type === 'rating' ? Number(raw) : String(raw);
  }

  const validation = validateAnswers(schema, answers);
  if (!validation.ok) redirect(`${base}/${assignmentId}?error=incomplete`);

  // Score / NPS dérivés (best-effort, comme le flux satisfaction).
  const ratings = schema.questions
    .filter((q) => q.type === 'rating')
    .map((q) => Number(answers[q.id]))
    .filter((n) => Number.isFinite(n));
  const npsQ = schema.questions.find((q) => q.type === 'nps');
  const nps = npsQ && answers[npsQ.id] !== undefined ? Number(answers[npsQ.id]) : null;
  const score = ratings.length ? (ratings.reduce((s, n) => s + n, 0) / ratings.length) * 20 : null;

  const h = headers();
  const ip = h.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null;
  const ua = h.get('user-agent') ?? null;

  const { error: insertErr } = await admin
    .schema('app')
    .from('questionnaire_responses')
    .insert({
      organization_id: organizationId,
      assignment_id: assignmentId,
      template_id: assignment.template_id,
      dossier_id: dossierId,
      answers,
      score,
      nps,
      submitter_ip: ip,
      submitter_user_agent: ua,
    });
  if (insertErr) {
    console.error('[submitApprenantQuestionnaire] insert failed', insertErr);
    redirect(`${base}/${assignmentId}?error=db`);
  }

  // La réponse est enregistrée ; si cette bascule échoue en silence, l'assignation
  // reste « en attente » : le destinataire est relancé et l'indicateur Qualiopi
  // sous-compte les réponses. On journalise donc l'échec (audit CAP-17).
  const { error: statutErr } = await admin
    .schema('app')
    .from('questionnaire_assignments')
    .update({ status: 'completed' } as never)
    .eq('id', assignmentId);
  if (statutErr) {
    console.error('[espace-apprenant] bascule du statut en « completed » échouée', statutErr);
  }

  redirect(`${base}?done=1`);
}
