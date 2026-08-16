import 'server-only';
import { getCurrentMember, type CurrentMember } from './current-member';
import { supabaseAdmin } from '@/shared/lib/supabase/admin';
import { can, type Access, type Section } from './permissions';

/**
 * Garde des Server Actions qui utilisent `service_role`.
 *
 * Une Server Action est un endpoint POST appelable par quiconque connaît son
 * identifiant (extractible du bundle client) : le rendu conditionnel d'un bouton
 * ne protège rien. Et `service_role` contourne la RLS, donc la vérification
 * d'organisation doit être explicite.
 *
 * Les actions qui passent par `supabaseServer()` (RLS active) n'en ont pas besoin.
 */
export type GuardError = 'unauthenticated' | 'forbidden' | 'not_found';

export type GuardResult =
  | { ok: true; member: CurrentMember }
  | { ok: false; error: GuardError };

/** Session + niveau d'accès requis sur une section. */
export async function guardAction(section: Section, min: Access = 'manage'): Promise<GuardResult> {
  const member = await getCurrentMember();
  if (!member) return { ok: false, error: 'unauthenticated' };

  const level = can(member.role, section);
  const granted = min === 'manage' ? level === 'manage' : level !== 'none';
  return granted ? { ok: true, member } : { ok: false, error: 'forbidden' };
}

/**
 * Idem, plus la vérification que la ligne visée appartient bien à
 * l'organisation du membre — sans quoi un UUID suffit à agir sur le tenant voisin.
 */
export async function guardRowAction(
  table: 'dossiers' | 'sessions' | 'complaints' | 'dossier_funder_tasks',
  rowId: string,
  section: Section,
  min: Access = 'manage',
): Promise<GuardResult> {
  const guard = await guardAction(section, min);
  if (!guard.ok) return guard;

  const { data } = await supabaseAdmin()
    .schema('app')
    .from(table)
    .select('organization_id')
    .eq('id', rowId)
    .maybeSingle();

  const organizationId = (data as { organization_id: string } | null)?.organization_id;
  if (!organizationId) return { ok: false, error: 'not_found' };
  if (organizationId !== guard.member.organizationId) return { ok: false, error: 'forbidden' };

  return guard;
}
