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

/**
 * Membres actifs de l'org de l'utilisateur courant + rôle de cet utilisateur.
 *
 * Lu en service role, comme `addMemberAction` : les politiques RLS de `members`
 * s'appuient sur des claims du JWT (`organization_id`, `user_role`, posés par le
 * hook 0042/0091). Un jeton émis avant le hook, ou simplement périmé, ne les
 * porte pas — l'utilisateur ne se voyait alors lui-même dans aucune org et tout
 * l'écran tombait sur un « organization_not_found » illisible. Le cloisonnement
 * ne repose donc pas sur la RLS ici, mais sur cette ligne : l'org retenue est
 * celle de l'appelant authentifié, et tout ce qui suit y est borné.
 */
async function loadContext(ctx: AuthCtx): Promise<{
  orgId: string;
  currentRole: string | null;
  members: MemberRow[];
}> {
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
  if (!meRow) throw new Error('organization_not_found');

  const { data: membersData } = await admin
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
    // Règles de la base (members_update) énoncées ici, pour qu'elles se lisent à
    // l'écran au lieu de revenir en « nouvelle ligne refusée par la RLS » :
    // on ne touche pas la ligne d'un autre propriétaire, et on n'en nomme pas
    // un second (l'organisation n'en compte qu'un, cf. ADD_MEMBER_ROLES).
    if (target.role === 'owner' && target.user_id !== ctx.userId) {
      return { ok: false as const, error: 'owner_only' };
    }
    if (parsedInput.role === 'owner' && target.role !== 'owner') {
      return { ok: false as const, error: 'owner_grant' };
    }
    if (target.role === parsedInput.role) return { ok: true as const };

    // Écriture en service role, après les contrôles ci-dessus — même raison que
    // pour la désactivation : sous la session de l'utilisateur, `members_update`
    // dépend de claims du JWT qui peuvent manquer, et l'UPDATE ne touchait alors
    // AUCUNE ligne sans lever la moindre erreur. L'écran annonçait un succès et
    // le rôle revenait à sa valeur d'avant au rechargement.
    const admin = supabaseAdmin();
    const { error } = await admin
      .schema('app')
      .from('members')
      .update({ role: parsedInput.role } as never)
      .eq('id', parsedInput.memberId)
      .eq('organization_id', orgId)
      .is('deleted_at', null);
    // L'erreur était relancée : l'écran affichait « Échec de la mise à jour »
    // sans jamais dire pourquoi (même défaut que la désactivation, audit CAP-31).
    if (error) {
      console.error('[membres] changement de rôle refusé', error);
      return { ok: false as const, error: 'update_failed', details: error.message };
    }

    // Contrôle : la ligne porte bien le nouveau rôle (sinon, pas de succès annoncé).
    const { data: apres } = await admin
      .schema('app')
      .from('members')
      .select('role')
      .eq('id', parsedInput.memberId)
      .maybeSingle();
    if ((apres as { role: string } | null)?.role !== parsedInput.role) {
      return { ok: false as const, error: 'update_failed', details: 'le rôle n’a pas été enregistré' };
    }

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
    // Règles de la base (members_update) : seul un propriétaire touche à un
    // propriétaire ; et l'on ne se retire pas soi-même l'accès.
    if (target.role === 'owner' && currentRole !== 'owner') return { ok: false as const, error: 'owner_only' };
    if (target.user_id === ctx.userId) return { ok: false as const, error: 'self' };

    // Écriture en service role, après les contrôles ci-dessus.
    // Avec la session de l'utilisateur, la désactivation échouait toujours :
    // PostgREST relit la ligne modifiée, et la politique de lecture ne montre
    // que les membres actifs (`deleted_at IS NULL`) — la base refusait donc la
    // nouvelle ligne (« new row violates row-level security policy »).
    const admin = supabaseAdmin();
    const { error } = await admin
      .schema('app')
      .from('members')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', parsedInput.memberId)
      .eq('organization_id', orgId)
      .is('deleted_at', null);
    // L'erreur était relancée : l'écran affichait « Échec de la désactivation »
    // sans jamais dire pourquoi, et la cause partait dans les journaux du serveur,
    // hors de portée de l'utilisateur (audit CAP-31).
    if (error) {
      console.error('[membres] désactivation refusée', error);
      return { ok: false as const, error: 'update_failed', details: error.message };
    }

    // Contrôle : la ligne est bien désactivée (sinon, ne pas annoncer un succès).
    const { data: apres } = await admin
      .schema('app')
      .from('members')
      .select('deleted_at')
      .eq('id', parsedInput.memberId)
      .maybeSingle();
    if (!apres || (apres as { deleted_at: string | null }).deleted_at === null) {
      return { ok: false as const, error: 'update_failed', details: 'la désactivation n’a pas été enregistrée' };
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
