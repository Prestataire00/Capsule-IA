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
        // Vide plutôt que null, l'index unique compterait deux chaînes vides
        // comme un doublon (0176).
        //
        // Le cast est là parce que `shared/types/database.ts` date d'avant la
        // 0176 et annonce encore `email: string` : la base accepte NULL, les
        // types non. À lever au prochain `pnpm db:types`.
        email: (parsedInput.email?.trim() || null) as unknown as string,
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
