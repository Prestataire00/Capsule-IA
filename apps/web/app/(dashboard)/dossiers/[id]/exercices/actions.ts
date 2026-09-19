'use server';

import { revalidatePath } from 'next/cache';
import { authActionClient } from '@/shared/lib/safe-action';
import {
  createExerciseSchema,
  gradeSubmissionSchema,
  toggleExercisePublishSchema,
  deleteExerciseSchema,
} from '@/features/exercices/exercise.schema';
import { getCurrentMember } from '@/shared/lib/auth/current-member';

/**
 * Résout l'organization_id du membre connecté.
 *
 * Interrogeait `app.memberships` — table qui n'existe pas (audit CAP-16) : la
 * requête échouait, `data` restait null, et la fonctionnalité était morte sans
 * le moindre message. La table réelle est `app.members`, déjà lue par
 * `getCurrentMember()`.
 */
async function resolveOrgId(): Promise<string | null> {
  const me = await getCurrentMember();
  return me?.organizationId ?? null;
}

export const createExercise = authActionClient
  .schema(createExerciseSchema)
  .action(async ({ parsedInput, ctx }) => {
    const orgId = await resolveOrgId();
    if (!orgId) throw new Error('Organisation introuvable');

    const { error } = await ctx.supabase
      .schema('app')
      .from('exercises' as never)
      .insert({
        organization_id: orgId,
        dossier_id: parsedInput.dossierId,
        module_id: parsedInput.moduleId ?? null,
        title: parsedInput.title,
        instructions: parsedInput.instructions ?? null,
        attachment_path: parsedInput.attachmentPath ?? null,
        due_at: parsedInput.dueAt ?? null,
        created_by: ctx.userId as string,
        is_published: false,
      } as never);

    if (error) throw new Error(error.message);

    revalidatePath(`/dossiers/${parsedInput.dossierId}/exercices`);
    return { ok: true };
  });

export const gradeSubmission = authActionClient
  .schema(gradeSubmissionSchema)
  .action(async ({ parsedInput, ctx }) => {
    const { error } = await ctx.supabase
      .schema('app')
      .from('exercise_submissions' as never)
      .update({
        grade: parsedInput.grade ?? null,
        feedback: parsedInput.feedback ?? null,
        status: 'graded',
        graded_at: new Date().toISOString(),
        graded_by: ctx.userId as string,
      } as never)
      .eq('id', parsedInput.submissionId);

    if (error) throw new Error(error.message);

    return { ok: true };
  });

export const toggleExercisePublish = authActionClient
  .schema(toggleExercisePublishSchema)
  .action(async ({ parsedInput, ctx }) => {
    const { error } = await ctx.supabase
      .schema('app')
      .from('exercises' as never)
      .update({
        is_published: parsedInput.isPublished,
        updated_at: new Date().toISOString(),
      } as never)
      .eq('id', parsedInput.exerciseId);

    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteExercise = authActionClient
  .schema(deleteExerciseSchema)
  .action(async ({ parsedInput, ctx }) => {
    const { error } = await ctx.supabase
      .schema('app')
      .from('exercises' as never)
      .update({
        deleted_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      } as never)
      .eq('id', parsedInput.exerciseId);

    if (error) throw new Error(error.message);
    return { ok: true };
  });
