'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { env } from '@/env.mjs';
import { verifyTrainerSatisfactionToken } from '@/shared/lib/trainer-satisfaction-token';

const ratingSchema = z.coerce.number().int().min(1).max(5);
const npsSchema = z.coerce.number().int().min(0).max(10);

const schema = z.object({
  token: z.string().min(20),
  nps: npsSchema,
  overallRating: ratingSchema,
  organizationRating: ratingSchema,
  groupRating: ratingSchema,
  whatWorked: z.string().trim().max(2000).optional().or(z.literal('')),
  whatToImprove: z.string().trim().max(2000).optional().or(z.literal('')),
});

const admin = () =>
  createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

export async function submitTrainerSatisfaction(formData: FormData): Promise<void> {
  const tokenStr = (formData.get('token') as string | null) ?? '';
  const parsed = schema.safeParse({
    token: tokenStr,
    nps: formData.get('nps'),
    overallRating: formData.get('overallRating'),
    organizationRating: formData.get('organizationRating'),
    groupRating: formData.get('groupRating'),
    whatWorked: formData.get('whatWorked'),
    whatToImprove: formData.get('whatToImprove'),
  });
  if (!parsed.success) {
    redirect(`/questionnaire/formateur/${tokenStr || 'invalid'}?error=invalid`);
  }
  const data = parsed.data;

  const verified = await verifyTrainerSatisfactionToken(data.token);
  if (!verified.ok) {
    redirect(`/questionnaire/formateur/${data.token}?error=${verified.error}`);
  }
  const { assignmentId, dossierId, organizationId } = verified.value;
  const sb = admin();

  // Idempotence
  const { data: existing } = await sb
    .schema('app')
    .from('questionnaire_responses')
    .select('id')
    .eq('assignment_id', assignmentId)
    .maybeSingle();
  if (existing) {
    redirect(`/questionnaire/formateur/${data.token}/merci?status=already`);
  }

  const { data: assignmentRow } = await sb
    .schema('app')
    .from('questionnaire_assignments')
    .select('template_id')
    .eq('id', assignmentId)
    .maybeSingle();
  if (!assignmentRow) {
    redirect(`/questionnaire/formateur/${data.token}?error=invalid_token`);
  }
  const templateId = (assignmentRow as { template_id: string }).template_id;

  const h = headers();
  const ip = h.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null;
  const ua = h.get('user-agent') ?? null;
  const avgRating = (data.overallRating + data.organizationRating + data.groupRating) / 3;

  const { error: insertErr } = await sb
    .schema('app')
    .from('questionnaire_responses')
    .insert({
      organization_id: organizationId,
      assignment_id: assignmentId,
      template_id: templateId,
      dossier_id: dossierId,
      answers: {
        nps: data.nps,
        overallRating: data.overallRating,
        organizationRating: data.organizationRating,
        groupRating: data.groupRating,
        whatWorked: data.whatWorked || null,
        whatToImprove: data.whatToImprove || null,
      },
      score: avgRating * 20,
      nps: data.nps,
      submitter_ip: ip,
      submitter_user_agent: ua,
    });
  if (insertErr) {
    console.error('[submitTrainerSatisfaction] insert failed', insertErr);
    redirect(`/questionnaire/formateur/${data.token}?error=db`);
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
    console.error('[formateur] bascule du statut en « completed » échouée', statutErr);
  }

  redirect(`/questionnaire/formateur/${data.token}/merci`);
}
