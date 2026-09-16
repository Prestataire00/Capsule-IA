'use server';

import { revalidatePath } from 'next/cache';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { supabaseAdmin } from '@/shared/lib/supabase/admin';

/**
 * Notifications d'un formateur.
 *
 * Celles de l'organisme sont marquées lues par organisation (`members`) : un
 * formateur externe n'en a pas, et le clic serait resté sans effet. Ici la
 * portée est la bonne — les notifications qui lui sont adressées, et elles
 * seules.
 */

async function moi(): Promise<string | null> {
  const { data } = await supabaseServer().auth.getUser();
  return data.user?.id ?? null;
}

export async function marquerMesNotificationsLues(): Promise<void> {
  const userId = await moi();
  if (!userId) return;

  await supabaseAdmin()
    .schema('app')
    .from('notifications')
    .update({ read_at: new Date().toISOString() } as never)
    .eq('recipient_user_id', userId)
    .eq('channel', 'in_app')
    .is('read_at', null);

  revalidatePath('/mes-notifications');
}

export async function marquerMaNotificationLue(id: string): Promise<void> {
  if (!id) return;
  const userId = await moi();
  if (!userId) return;

  await supabaseAdmin()
    .schema('app')
    .from('notifications')
    .update({ read_at: new Date().toISOString() } as never)
    .eq('id', id)
    // Le destinataire est dans le filtre : un identifiant venu du client ne
    // doit pas permettre de marquer lue la notification d'un autre.
    .eq('recipient_user_id', userId);

  revalidatePath('/mes-notifications');
}
