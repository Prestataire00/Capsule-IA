'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import { randomBytes, createHash } from 'crypto';
import { z } from 'zod';
import { env } from '@/env.mjs';

const ratingSchema = z.coerce.number().int().min(1).max(5);
const npsSchema = z.coerce.number().int().min(0).max(10);

const satisfactionSchema = z.object({
  dossierId: z.string().uuid(),
  nps: npsSchema,
  overallRating: ratingSchema,
  pedagogyRating: ratingSchema,
  organizationRating: ratingSchema,
  whatWorked: z.string().trim().max(2000).optional().or(z.literal('')),
  whatToImprove: z.string().trim().max(2000).optional().or(z.literal('')),
});

const admin = () =>
  createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

const SATISFACTION_TEMPLATE_CODE = 'satisfaction_chaud_default';

async function ensureSystemTemplate(sb: ReturnType<typeof admin>): Promise<string> {
  const { data: existing } = await sb
    .schema('app')
    .from('questionnaire_templates')
    .select('id')
    .is('organization_id', null)
    .eq('code', SATISFACTION_TEMPLATE_CODE)
    .maybeSingle();

  if (existing) return (existing as { id: string }).id;

  const { data: created, error } = await sb
    .schema('app')
    .from('questionnaire_templates')
    .insert({
      organization_id: null,
      kind: 'satisfaction_chaud',
      code: SATISFACTION_TEMPLATE_CODE,
      title: 'Satisfaction à chaud — Qualiopi',
      description: 'Questionnaire envoyé à la fin de la formation pour mesurer la satisfaction des apprenants.',
      schema: {
        version: 1,
        fields: [
          { key: 'nps', kind: 'nps', label: 'Recommanderiez-vous cette formation ?' },
          { key: 'overallRating', kind: 'rating_5', label: 'Satisfaction globale' },
          { key: 'pedagogyRating', kind: 'rating_5', label: 'Qualité pédagogique' },
          { key: 'organizationRating', kind: 'rating_5', label: 'Organisation pratique' },
          { key: 'whatWorked', kind: 'long_text', label: 'Ce qui a particulièrement fonctionné' },
          { key: 'whatToImprove', kind: 'long_text', label: 'Pistes d\'amélioration' },
        ],
      },
      is_active: true,
    })
    .select('id')
    .single();

  if (error || !created) throw new Error(`template create failed: ${error?.message}`);
  return (created as { id: string }).id;
}

async function ensureAssignment(
  sb: ReturnType<typeof admin>,
  templateId: string,
  dossierId: string,
  organizationId: string,
  learnerId: string | null,
): Promise<string> {
  const { data: existing } = await sb
    .schema('app')
    .from('questionnaire_assignments')
    .select('id')
    .eq('template_id', templateId)
    .eq('dossier_id', dossierId)
    .eq('recipient_kind', 'learner')
    .maybeSingle();

  if (existing) return (existing as { id: string }).id;

  const tokenRaw = randomBytes(24).toString('hex');
  const tokenHash = createHash('sha256').update(tokenRaw).digest('hex');

  const { data: created, error } = await sb
    .schema('app')
    .from('questionnaire_assignments')
    .insert({
      organization_id: organizationId,
      template_id: templateId,
      dossier_id: dossierId,
      recipient_kind: 'learner',
      recipient_learner_id: learnerId,
      token_hash: tokenHash,
      status: 'pending',
    })
    .select('id')
    .single();

  if (error || !created) throw new Error(`assignment create failed: ${error?.message}`);
  return (created as { id: string }).id;
}

export async function submitSatisfaction(formData: FormData): Promise<void> {
  const parsed = satisfactionSchema.safeParse({
    dossierId: formData.get('dossierId'),
    nps: formData.get('nps'),
    overallRating: formData.get('overallRating'),
    pedagogyRating: formData.get('pedagogyRating'),
    organizationRating: formData.get('organizationRating'),
    whatWorked: formData.get('whatWorked'),
    whatToImprove: formData.get('whatToImprove'),
  });

  if (!parsed.success) {
    const dId = (formData.get('dossierId') as string | null) ?? 'invalid';
    redirect(`/questionnaire/satisfaction/${dId}?error=invalid`);
  }
  const data = parsed.data;

  const sb = admin();

  // Récup dossier
  const { data: dossierRow } = await sb
    .schema('app')
    .from('dossiers')
    .select('id, organization_id, learner_id')
    .eq('id', data.dossierId)
    .maybeSingle();

  if (!dossierRow) {
    redirect(`/questionnaire/satisfaction/${data.dossierId}?error=not_found`);
  }
  const dossier = dossierRow as { id: string; organization_id: string; learner_id: string };

  const templateId = await ensureSystemTemplate(sb);
  const assignmentId = await ensureAssignment(sb, templateId, dossier.id, dossier.organization_id, dossier.learner_id);

  // Vérifier qu'il n'y a pas déjà une réponse
  const { data: existingResponse } = await sb
    .schema('app')
    .from('questionnaire_responses')
    .select('id')
    .eq('assignment_id', assignmentId)
    .maybeSingle();

  if (existingResponse) {
    redirect(`/questionnaire/satisfaction/${data.dossierId}/merci?status=already`);
  }

  const h = headers();
  const ip = h.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null;
  const ua = h.get('user-agent') ?? null;

  const avgRating = (data.overallRating + data.pedagogyRating + data.organizationRating) / 3;

  const { error: insertErr } = await sb
    .schema('app')
    .from('questionnaire_responses')
    .insert({
      organization_id: dossier.organization_id,
      assignment_id: assignmentId,
      template_id: templateId,
      dossier_id: dossier.id,
      answers: {
        nps: data.nps,
        overallRating: data.overallRating,
        pedagogyRating: data.pedagogyRating,
        organizationRating: data.organizationRating,
        whatWorked: data.whatWorked || null,
        whatToImprove: data.whatToImprove || null,
      },
      score: avgRating * 20, // /100
      nps: data.nps,
      submitter_ip: ip,
      submitter_user_agent: ua,
    });

  if (insertErr) {
    console.error('[submitSatisfaction] insert failed', insertErr);
    redirect(`/questionnaire/satisfaction/${data.dossierId}?error=db`);
  }

  await sb
    .schema('app')
    .from('questionnaire_assignments')
    .update({ status: 'completed' })
    .eq('id', assignmentId);

  redirect(`/questionnaire/satisfaction/${data.dossierId}/merci`);
}
