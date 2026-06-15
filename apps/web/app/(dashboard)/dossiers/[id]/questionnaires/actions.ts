'use server';

import { z } from 'zod';
import { createHash, randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { authActionClient } from '@/shared/lib/safe-action';
import { generateQuestionnaireToken } from '@/shared/lib/questionnaire-token';

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
      .select('id, organization_id, learner_id, learner:learners(first_name, last_name, email)')
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

    revalidatePath(`/dossiers/${parsedInput.dossierId}/questionnaires`);
    return { ok: true as const, link: `/questionnaire/financeur/${signed.token}` };
  });
