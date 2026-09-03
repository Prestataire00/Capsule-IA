'use server';

import { randomInt } from 'crypto';
import { revalidatePath } from 'next/cache';
import { authActionClient } from '@/shared/lib/safe-action';
import type { AuthCtx } from '@/shared/lib/safe-action';
import { supabaseAdmin } from '@/shared/lib/supabase/admin';
import {
  AddMemberSchema,
  ChangeMemberRoleSchema,
  DeactivateMemberSchema,
  SetMemberPasswordSchema,
} from './members-schema';

/** Mot de passe temporaire conforme (≥10, 1 maj, 1 min, 1 chiffre, 1 spécial), sans caractère ambigu. */
function genTempPassword(): string {
  const sets = ['abcdefghijkmnpqrstuvwxyz', 'ABCDEFGHJKLMNPQRSTUVWXYZ', '23456789', '!@#$%-_=+'];
  const all = sets.join('');
  const chars = sets.map((s) => s[randomInt(s.length)] as string);
  while (chars.length < 14) chars.push(all[randomInt(all.length)] as string);
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j] as string, chars[i] as string];
  }
  return chars.join('');
}

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

export const setMemberPasswordAction = authActionClient
  .schema(SetMemberPasswordSchema)
  .action(async ({ parsedInput, ctx }) => {
    const { currentRole, members } = await loadContext(ctx);
    if (!isAdminOrOwner(currentRole)) return { ok: false as const, error: 'forbidden' };

    const target = members.find((m) => m.id === parsedInput.memberId);
    if (!target) return { ok: false as const, error: 'not_found' };

    // Mot de passe fourni, sinon on en génère un temporaire (renvoyé à l'admin).
    const provided = parsedInput.password?.trim();
    const password = provided && provided.length >= 8 ? provided : genTempPassword();
    const generated = !(provided && provided.length >= 8);

    const { error } = await supabaseAdmin().auth.admin.updateUserById(target.user_id, { password });
    if (error) return { ok: false as const, error: 'update_failed', details: error.message };

    revalidatePath('/parametres/membres');
    // On ne renvoie le mot de passe que s'il a été généré (pour le communiquer au membre).
    return { ok: true as const, password: generated ? password : null };
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
    // L'erreur était relancée : l'écran affichait « Échec de la désactivation »
    // sans jamais dire pourquoi, et la cause partait dans les journaux du serveur,
    // hors de portée de l'utilisateur (audit CAP-31).
    if (error) {
      console.error('[membres] désactivation refusée', error);
      return { ok: false as const, error: 'update_failed', details: error.message };
    }

    // Une règle de sécurité qui refuse en LECTURE ne lève pas d'erreur : elle met
    // simplement zéro ligne à jour. Sans ce contrôle, l'écran annonçait un succès
    // alors que rien n'avait bougé.
    const { data: apres } = await ctx.supabase
      .schema('app')
      .from('members')
      .select('deleted_at')
      .eq('id', parsedInput.memberId)
      .maybeSingle();
    if (apres && (apres as { deleted_at: string | null }).deleted_at === null) {
      return { ok: false as const, error: 'rls_denied' };
    }

    revalidatePath('/parametres/membres');
    return { ok: true as const };
  });

/**
 * Ajoute un membre à l'organisation : crée le compte auth (mot de passe temporaire,
 * email confirmé), le profil et la ligne `members`. Owner/admin uniquement.
 * Org + rôle résolus via service_role (robuste même si le JWT courant est périmé).
 */
export const addMemberAction = authActionClient
  .schema(AddMemberSchema)
  .action(async ({ parsedInput, ctx }) => {
    const admin = supabaseAdmin();

    const { data: me } = await admin
      .schema('app')
      .from('members')
      .select('organization_id, role')
      .eq('user_id', ctx.userId)
      .is('deleted_at', null)
      .order('is_default_org', { ascending: false })
      .limit(1)
      .maybeSingle();
    const meRow = me as { organization_id: string; role: string } | null;
    if (!meRow) return { ok: false as const, error: 'organization_not_found' };
    if (meRow.role !== 'owner' && meRow.role !== 'admin') return { ok: false as const, error: 'forbidden' };
    const orgId = meRow.organization_id;

    const tempPassword = genTempPassword();
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email: parsedInput.email,
      password: tempPassword,
      email_confirm: true,
      user_metadata: { full_name: parsedInput.fullName },
    });
    if (createErr || !created?.user) {
      if (/already|registered|exists/i.test(createErr?.message ?? '')) {
        return { ok: false as const, error: 'email_already_registered' };
      }
      return { ok: false as const, error: 'create_user_failed' };
    }
    const userId = created.user.id;

    const { error: profileErr } = await admin
      .schema('app')
      .from('profiles')
      .upsert(
        { user_id: userId, full_name: parsedInput.fullName, email: parsedInput.email } as never,
        { onConflict: 'user_id' },
      );
    if (profileErr) return { ok: false as const, error: 'profile_failed' };

    const { error: memberErr } = await admin
      .schema('app')
      .from('members')
      .insert({
        organization_id: orgId,
        user_id: userId,
        role: parsedInput.role,
        invited_by: ctx.userId,
      } as never);
    if (memberErr) {
      if (memberErr.code === '23505') return { ok: false as const, error: 'already_member' };
      return { ok: false as const, error: 'add_member_failed' };
    }

    revalidatePath('/parametres/membres');
    return { ok: true as const, email: parsedInput.email, tempPassword };
  });
