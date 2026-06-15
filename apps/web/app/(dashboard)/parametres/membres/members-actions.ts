'use server';

import { revalidatePath } from 'next/cache';
import { authActionClient } from '@/shared/lib/safe-action';
import type { AuthCtx } from '@/shared/lib/safe-action';
import { ChangeMemberRoleSchema, DeactivateMemberSchema } from './members-schema';

type MemberRow = {
  id: string;
  organization_id: string;
  user_id: string;
  role: string;
};

// Membres actifs de l'org de l'utilisateur courant + rôle de cet utilisateur.
async function loadContext(ctx: AuthCtx): Promise<{
  orgId: string;
  currentRole: string | null;
  members: MemberRow[];
}> {
  const { data: me } = await ctx.supabase
    .schema('app')
    .from('members')
    .select('organization_id, role')
    .eq('user_id', ctx.userId)
    .is('deleted_at', null)
    .order('is_default_org', { ascending: false })
    .limit(1)
    .maybeSingle();
  const meRow = me as { organization_id: string; role: string } | null;
  if (!meRow) throw new Error('organization_not_found');

  const { data: membersData } = await ctx.supabase
    .schema('app')
    .from('members')
    .select('id, organization_id, user_id, role')
    .eq('organization_id', meRow.organization_id)
    .is('deleted_at', null);

  return {
    orgId: meRow.organization_id,
    currentRole: meRow.role,
    members: (membersData as unknown as MemberRow[] | null) ?? [],
  };
}

const isAdminOrOwner = (role: string | null): boolean => role === 'owner' || role === 'admin';

export const changeMemberRoleAction = authActionClient
  .schema(ChangeMemberRoleSchema)
  .action(async ({ parsedInput, ctx }) => {
    const { orgId, currentRole, members } = await loadContext(ctx);
    if (!isAdminOrOwner(currentRole)) return { ok: false as const, error: 'forbidden' };

    const target = members.find((m) => m.id === parsedInput.memberId);
    if (!target) return { ok: false as const, error: 'not_found' };

    // Empêche de rétrograder le dernier owner.
    const owners = members.filter((m) => m.role === 'owner');
    if (target.role === 'owner' && parsedInput.role !== 'owner' && owners.length <= 1) {
      return { ok: false as const, error: 'last_owner' };
    }

    const { error } = await ctx.supabase
      .schema('app')
      .from('members')
      .update({ role: parsedInput.role })
      .eq('id', parsedInput.memberId)
      .eq('organization_id', orgId);
    if (error) throw new Error(`change_role_failed: ${error.message}`);
    revalidatePath('/parametres/membres');
    return { ok: true as const };
  });

export const deactivateMemberAction = authActionClient
  .schema(DeactivateMemberSchema)
  .action(async ({ parsedInput, ctx }) => {
    const { orgId, currentRole, members } = await loadContext(ctx);
    if (!isAdminOrOwner(currentRole)) return { ok: false as const, error: 'forbidden' };

    const target = members.find((m) => m.id === parsedInput.memberId);
    if (!target) return { ok: false as const, error: 'not_found' };

    // Empêche de désactiver le dernier owner.
    const owners = members.filter((m) => m.role === 'owner');
    if (target.role === 'owner' && owners.length <= 1) {
      return { ok: false as const, error: 'last_owner' };
    }

    const { error } = await ctx.supabase
      .schema('app')
      .from('members')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', parsedInput.memberId)
      .eq('organization_id', orgId);
    if (error) throw new Error(`deactivate_member_failed: ${error.message}`);
    revalidatePath('/parametres/membres');
    return { ok: true as const };
  });
