'use server';

import { revalidatePath } from 'next/cache';
import { authActionClient } from '@/shared/lib/safe-action';
import { UpdateProfileSchema } from '@/features/identity/trainer-self/ui/schemas';
import { SupabaseTrainerSelfRepository } from '@/features/identity/trainer-self/infrastructure/supabase-trainer-self.repository';
import { UpdateTrainerProfile } from '@/features/identity/trainer-self/application/commands/update-trainer-profile';
import { TrainerId } from '@/features/dossier/domain/ids';

export const updateProfileAction = authActionClient
  .schema(UpdateProfileSchema)
  .action(async ({ parsedInput, ctx }) => {
    const repo = new SupabaseTrainerSelfRepository(ctx.supabase);
    const cmd = new UpdateTrainerProfile(repo);
    await cmd.execute({
      trainerIds: parsedInput.trainerIds.map(TrainerId),
      patch: {
        firstName: parsedInput.patch.firstName,
        lastName: parsedInput.patch.lastName,
        phone: parsedInput.patch.phone,
        bio: parsedInput.patch.bio,
        specialties: parsedInput.patch.specialties,
        avatarPath: parsedInput.patch.avatarPath,
      },
    });
    revalidatePath('/profil');
    return { ok: true };
  });
