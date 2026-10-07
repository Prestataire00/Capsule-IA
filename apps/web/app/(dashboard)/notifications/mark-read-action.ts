'use server';

import { supabaseServer } from '@/shared/lib/supabase/server';
import { supabaseAdmin } from '@/shared/lib/supabase/admin';

/**
 * Marque comme lues les notifications in-app non lues de l'utilisateur
 * courant : les siennes et celles de toute l'organisation. Écriture via service_role (pas de policy UPDATE sur
 * notifications), scoppée à l'org résolue depuis les memberships.
 */
export async function markNotificationsRead(): Promise<void> {
  const sb = supabaseServer();
  const { data: auth } = await sb.auth.getUser();
  if (!auth.user) return;

  const admin = supabaseAdmin();
  const { data: member } = await admin
    .schema('app')
    .from('members')
    .select('organization_id')
    .eq('user_id', auth.user.id)
    .is('deleted_at', null)
    .order('is_default_org', { ascending: false })
    .limit(1)
    .maybeSingle();

  const orgId = (member as { organization_id: string } | null)?.organization_id;
  if (!orgId) return;

  await admin
    .schema('app')
    .from('notifications')
    .update({ read_at: new Date().toISOString() } as never)
    .eq('organization_id', orgId)
    .eq('channel', 'in_app')
    .is('read_at', null)
    // Les siennes et celles de tous (0225) : jamais la cloche d'un collègue.
    .or(`recipient_user_id.is.null,recipient_user_id.eq.${auth.user.id}`);
}

/**
 * Marque UNE notification comme lue (au clic). Elle disparaît alors de la liste
 * (qui n'affiche que les non-lues). Scopée à l'org de l'utilisateur courant.
 */
export async function markNotificationRead(id: string): Promise<void> {
  if (!id) return;
  const sb = supabaseServer();
  const { data: auth } = await sb.auth.getUser();
  if (!auth.user) return;

  const admin = supabaseAdmin();
  const { data: member } = await admin
    .schema('app')
    .from('members')
    .select('organization_id')
    .eq('user_id', auth.user.id)
    .is('deleted_at', null)
    .order('is_default_org', { ascending: false })
    .limit(1)
    .maybeSingle();

  const orgId = (member as { organization_id: string } | null)?.organization_id;
  if (!orgId) return;

  await admin
    .schema('app')
    .from('notifications')
    .update({ read_at: new Date().toISOString() } as never)
    .eq('organization_id', orgId)
    .eq('id', id)
    .or(`recipient_user_id.is.null,recipient_user_id.eq.${auth.user.id}`);
}
