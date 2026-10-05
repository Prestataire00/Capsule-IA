import 'server-only';
import { supabaseAdmin } from '@/shared/lib/supabase/admin';
import { destinatairesValidation, peutValiderSupports } from './support-status';

/**
 * Qui relit ce que les formateurs préparent : la direction (propriétaires et
 * administrateurs) valide, l'un suffit ; les gestionnaires sont en copie.
 */

type Admin = ReturnType<typeof supabaseAdmin>;

export type Personne = { readonly userId: string; readonly nom: string; readonly email: string | null };

/** Membres actifs de l'organisme et leur rôle. */
export async function membresParRole(
  admin: Admin,
  organizationId: string,
  roles: readonly string[],
): Promise<Array<{ userId: string; role: string }>> {
  const { data, error } = await admin
    .schema('app')
    .from('members')
    .select('user_id, role')
    .eq('organization_id', organizationId)
    .in('role', [...roles] as never)
    .is('deleted_at', null);
  if (error) throw new Error(`[validation] membres illisibles : ${error.message}`);
  return ((data ?? []) as Array<{ user_id: string; role: string }>).map((m) => ({ userId: m.user_id, role: m.role }));
}

export async function personnes(admin: Admin, userIds: readonly string[]): Promise<Personne[]> {
  if (userIds.length === 0) return [];
  const { data } = await admin
    .schema('app')
    .from('profiles')
    .select('user_id, full_name, email')
    .in('user_id', [...userIds]);
  const parId = new Map(
    ((data ?? []) as Array<{ user_id: string; full_name: string | null; email: string | null }>).map((p) => [
      p.user_id,
      p,
    ]),
  );
  return userIds.map((id) => {
    const p = parId.get(id);
    return { userId: id, nom: p?.full_name?.trim() || p?.email || 'Membre', email: p?.email ?? null };
  });
}

export async function loadDestinatairesValidation(
  organizationId: string,
): Promise<{ validateurs: Personne[]; copie: Personne[] }> {
  const admin = supabaseAdmin();
  const { validateurs, copie } = destinatairesValidation(
    await membresParRole(admin, organizationId, ['owner', 'admin', 'gestionnaire']),
  );
  const [v, c] = await Promise.all([personnes(admin, validateurs), personnes(admin, copie)]);
  return { validateurs: v, copie: c };
}

/** La règle de `peutValiderSupports`, pour le membre connecté. */
export async function peutValiderPourMembre(me: { role: string } | null): Promise<boolean> {
  return me !== null && peutValiderSupports(me.role);
}
