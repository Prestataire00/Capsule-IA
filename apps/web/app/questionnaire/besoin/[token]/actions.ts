'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { env } from '@/env.mjs';
import { verifyNeedsAnalysisToken } from '@/shared/lib/needs-analysis-token';

const needsAnalysisSchema = z.object({
  token: z.string().min(20),
  currentLevel: z.coerce.number().int().min(1).max(5),
  objectives: z.string().trim().min(1, 'Objectifs requis').max(2000),
  expectations: z.string().trim().max(2000).optional().or(z.literal('')),
  constraints: z.string().trim().max(2000).optional().or(z.literal('')),
  accommodations: z.string().trim().max(2000).optional().or(z.literal('')),
});

const admin = () =>
  createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

export async function submitNeedsAnalysis(formData: FormData): Promise<void> {
  const tokenStr = (formData.get('token') as string | null) ?? '';

  const parsed = needsAnalysisSchema.safeParse({
    token: tokenStr,
    currentLevel: formData.get('currentLevel'),
    objectives: formData.get('objectives'),
    expectations: formData.get('expectations'),
    constraints: formData.get('constraints'),
    accommodations: formData.get('accommodations'),
  });

  if (!parsed.success) {
    redirect(`/questionnaire/besoin/${tokenStr || 'invalid'}?error=invalid`);
  }
  const data = parsed.data;

  const verified = await verifyNeedsAnalysisToken(data.token);
  if (!verified.ok) {
    redirect(`/questionnaire/besoin/${data.token}?error=${verified.error}`);
  }

  const { assignmentId, dossierId, organizationId } = verified.value;
  const sb = admin();

  // Idempotence : une seule réponse par assignment.
  const { data: existing } = await sb
    .schema('app')
    .from('questionnaire_responses')
    .select('id')
    .eq('assignment_id', assignmentId)
    .maybeSingle();
  if (existing) {
    redirect(`/questionnaire/besoin/${data.token}/merci?status=already`);
  }

  const { data: assignmentRow } = await sb
    .schema('app')
    .from('questionnaire_assignments')
    .select('template_id')
    .eq('id', assignmentId)
    .maybeSingle();
  if (!assignmentRow) {
    redirect(`/questionnaire/besoin/${data.token}?error=invalid_token`);
  }
  const templateId = (assignmentRow as { template_id: string }).template_id;

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
      answers: {
        currentLevel: data.currentLevel,
        objectives: data.objectives,
        expectations: data.expectations || null,
        constraints: data.constraints || null,
        accommodations: data.accommodations || null,
      },
      submitter_ip: ip,
      submitter_user_agent: ua,
    });

  if (insertErr) {
    console.error('[submitNeedsAnalysis] insert failed', insertErr);
    redirect(`/questionnaire/besoin/${data.token}?error=db`);
  }

  await sb
    .schema('app')
    .from('questionnaire_assignments')
    .update({ status: 'completed' })
    .eq('id', assignmentId);

  redirect(`/questionnaire/besoin/${data.token}/merci`);
}
