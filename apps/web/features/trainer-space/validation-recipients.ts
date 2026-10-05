import 'server-only';
import { supabaseAdmin } from '@/shared/lib/supabase/admin';
import { destinatairesValidation, peutValiderSupports, type RoleValidation } from './support-status';

/**
 * Qui relit ce que les formateurs préparent (0203).
 *
 * L'organisme désigne ses validateurs et les personnes en copie dans les
 * paramètres. Tant que personne n'est désigné, la direction (owner/admin)
 * valide, comme avant : la file ne doit jamais rester sans lecteur.
 */

type Admin = ReturnType<typeof supabaseAdmin>;

export type Personne = { readonly userId: string; readonly nom: string; readonly email: string | null };

export type Designation = { readonly userId: string; readonly role: RoleValidation };

export async function loadDesignations(admin: Admin, organizationId: string): Promise<Designation[]> {
  const { data, error } = await admin
    .schema('app')
    .from('course_validation_recipients' as never)
    .select('user_id, role')
    .eq('organization_id', organizationId);
  if (error) throw new Error(`[validation] destinataires illisibles : ${error.message}`);
  return ((data ?? []) as unknown as Array<{ user_id: string; role: RoleValidation }>).map((d) => ({
    userId: d.user_id,
    role: d.role,
  }));
}

async function direction(admin: Admin, organizationId: string): Promise<string[]> {
  const { data } = await admin
    .schema('app')
    .from('members')
    .select('user_id')
    .eq('organization_id', organizationId)
    .in('role', ['owner', 'admin'])
    .is('deleted_at', null);
  return [...new Set(((data ?? []) as Array<{ user_id: string }>).map((m) => m.user_id))];
}

async function personnes(admin: Admin, userIds: readonly string[]): Promise<Personne[]> {
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
  const designations = await loadDesignations(admin, organizationId);
  const { validateurs, copie } = destinatairesValidation(designations, await direction(admin, organizationId));
  const [v, c] = await Promise.all([personnes(admin, validateurs), personnes(admin, copie)]);
  return { validateurs: v, copie: c };
}

export async function estValidateurDesigne(organizationId: string, userId: string): Promise<boolean> {
  const designations = await loadDesignations(supabaseAdmin(), organizationId);
  return designations.some((d) => d.userId === userId && d.role === 'validateur');
}

/** La règle de `peutValiderSupports`, désignations comprises, pour le membre connecté. */
export async function peutValiderPourMembre(
  me: { role: string; organizationId: string; userId: string } | null,
): Promise<boolean> {
  if (!me) return false;
  if (peutValiderSupports(me.role)) return true;
  return estValidateurDesigne(me.organizationId, me.userId);
}

const ROLES_EQUIPE = ['owner', 'admin', 'gestionnaire', 'commercial', 'referent', 'comptable'];

/** L'équipe, avec le rôle de chacun dans la validation — pour le réglage. */
export async function loadEquipeValidation(
  organizationId: string,
): Promise<Array<Personne & { role: string; choix: RoleValidation | null }>> {
  const admin = supabaseAdmin();
  const { data } = await admin
    .schema('app')
    .from('members')
    .select('user_id, role')
    .eq('organization_id', organizationId)
    .in('role', ROLES_EQUIPE as never)
    .is('deleted_at', null);
  const membres = (data ?? []) as Array<{ user_id: string; role: string }>;
  const designations = new Map((await loadDesignations(admin, organizationId)).map((d) => [d.userId, d.role]));
  const gens = await personnes(admin, membres.map((m) => m.user_id));
  return gens
    .map((g, i) => ({ ...g, role: membres[i]!.role, choix: designations.get(g.userId) ?? null }))
    .sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
}
