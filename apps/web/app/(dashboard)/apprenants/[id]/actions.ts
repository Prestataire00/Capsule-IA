'use server';

import { revalidatePath } from 'next/cache';
import { authActionClient } from '@/shared/lib/safe-action';
import { UpdateLearnerSchema } from './schema';

type UpdateLearnerResult = { ok: true } | { ok: false; error: string };

export const updateLearner = authActionClient
  .schema(UpdateLearnerSchema)
  .action(async ({ parsedInput, ctx }): Promise<UpdateLearnerResult> => {
    const { error } = await ctx.supabase
      .schema('app')
      .from('learners')
      .update({
        first_name: parsedInput.firstName,
        last_name: parsedInput.lastName,
        email: parsedInput.email,
        phone: parsedInput.phone ?? null,
        position: parsedInput.position ?? null,
        statut: parsedInput.statut ?? null,
        rqth: parsedInput.rqth,
        accessibility_notes: parsedInput.accessibilityNotes ?? null,
      })
      .eq('id', parsedInput.learnerId)
      .is('deleted_at', null);

    if (error) return { ok: false, error: error.message };

    revalidatePath(`/apprenants/${parsedInput.learnerId}`);
    revalidatePath('/apprenants');
    return { ok: true };
  });
