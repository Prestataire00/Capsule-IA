'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import { env } from '@/env.mjs';
import { verifyQuestionnaireToken } from '@/shared/lib/questionnaire-token';
import { validateAnswers } from '@/features/questionnaire/schema';
import type { Answers, QuestionnaireSchema } from '@/features/questionnaire/schema';

const admin = () =>
  createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

export async function submitFunderQuestionnaire(formData: FormData): Promise<void> {
  const tokenStr = (formData.get('token') as string | null) ?? '';

  if (!tokenStr) {
    redirect('/questionnaire/financeur/invalid?error=invalid');
  }

  const verified = await verifyQuestionnaireToken(tokenStr);
  if (!verified.ok) {
    redirect(`/questionnaire/financeur/${tokenStr}?error=${verified.error}`);
  }

  const { assignmentId, dossierId, organizationId } = verified.value;
  const sb = admin();

  const { data: assignment } = await sb
    .schema('app')
    .from('questionnaire_assignments')
    .select('id, status, template_id')
    .eq('id', assignmentId)
    .maybeSingle();

  if (!assignment) {
    redirect(`/questionnaire/financeur/${tokenStr}?error=invalid_token`);
  }

  const templateId = (assignment as { template_id: string }).template_id;

  if ((assignment as { status: string }).status === 'completed') {
    redirect(`/questionnaire/financeur/${tokenStr}/merci?status=already`);
  }

  const { data: template } = await sb
    .schema('app')
    .from('questionnaire_templates')
    .select('schema')
    .eq('id', templateId)
    .maybeSingle();

  if (!template) {
    redirect(`/questionnaire/financeur/${tokenStr}?error=invalid_token`);
  }

  const schema = (template as { schema: unknown }).schema as QuestionnaireSchema;
  const questions = schema?.questions ?? [];

  const answers: Answers = {};
  let nps: number | null = null;
  for (const q of questions) {
    const raw = formData.get(q.id);
    if (raw === null) continue;
    const value = String(raw);
    if (q.type === 'nps' || q.type === 'rating') {
      if (value === '') continue;
      const n = Number(value);
      answers[q.id] = n;
      if (q.type === 'nps') nps = n;
    } else {
      if (value === '') continue;
      answers[q.id] = value;
    }
  }

  const validation = validateAnswers(schema, answers);
  if (!validation.ok) {
    redirect(`/questionnaire/financeur/${tokenStr}?error=invalid`);
  }

  const h = headers();
  const ip = h.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null;
  const ua = h.get('user-agent') ?? null;

  const { error: insertErr } = await sb
    .schema('app')
    .from('questionnaire_responses')
    .insert({
      organization_id: organizationId,
      assignment_id: assignmentId,
      template_id: templateId,
      dossier_id: dossierId,
      answers: answers as never,
      nps,
      submitter_ip: ip as never,
      submitter_user_agent: ua,
    });

  if (insertErr) {
    console.error('[submitFunderQuestionnaire] insert failed', insertErr);
    redirect(`/questionnaire/financeur/${tokenStr}?error=db`);
  }

  // La réponse est enregistrée ; si cette bascule échoue en silence, l'assignation
  // reste « en attente » : le destinataire est relancé et l'indicateur Qualiopi
  // sous-compte les réponses. On journalise donc l'échec (audit CAP-17).
  const { error: statutErr } = await sb
    .schema('app')
    .from('questionnaire_assignments')
    .update({ status: 'completed' } as never)
    .eq('id', assignmentId);
  if (statutErr) {
    console.error('[financeur] bascule du statut en « completed » échouée', statutErr);
  }

  redirect(`/questionnaire/financeur/${tokenStr}/merci`);
}
