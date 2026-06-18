'use server';

import { revalidatePath } from 'next/cache';
import { authActionClient } from '@/shared/lib/safe-action';
import { UpdateLearnerSchema } from './schema';

export const updateLearner = authActionClient
  .schema(UpdateLearnerSchema)
  .action(async ({ parsedInput, ctx }): Promise<{ ok: true } | { ok: false; error: string }> => {
    const { learnerId, firstName, lastName, email, phone, position, statut, rqth, accessibilityNotes } =
      parsedInput;

    const { error } = await ctx.supabase
      .schema('app')
      .from('learners')
      .update({
        first_name: firstName,
        last_name: lastName,
        email,
        phone,
        position,
        statut,
        rqth,
        accessibility_notes: accessibilityNotes,
      } as never)
      .eq('id', learnerId);

    if (error) return { ok: false, error: error.message };

    revalidatePath(`/apprenants/${learnerId}`);
    return { ok: true };
  });
