'use server';

import { revalidatePath } from 'next/cache';
import { requireAccess } from '@/shared/lib/auth/require-access';
import { supabaseServer } from '@/shared/lib/supabase/server';

type Result = { ok: true } | { ok: false; error: string };

/** Met à jour la description (bio) d'un formateur. Staff de l'org (RLS). */
export async function updateTrainerBio(trainerId: string, bio: string): Promise<Result> {
  await requireAccess('dossiers', 'manage');
  const sb = supabaseServer();
  const { error } = await sb
    .schema('app')
    .from('trainers')
    .update({ bio: bio.trim() || null } as never)
    .eq('id', trainerId)
    .is('deleted_at', null);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/formateurs/${trainerId}`);
  revalidatePath('/formateurs');
  return { ok: true };
}
