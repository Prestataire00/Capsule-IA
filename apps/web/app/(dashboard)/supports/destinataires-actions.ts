'use server';

import { revalidatePath } from 'next/cache';
import { getCurrentMember } from '@/shared/lib/auth/current-member';
import { supabaseAdmin } from '@/shared/lib/supabase/admin';
import { peutValiderSupports } from '@/features/trainer-space/support-status';
import { destinatairesSchema, type DestinatairesInput } from '@/features/trainer-space/validation-recipients.schema';

/**
 * Qui relit les contenus des formateurs, et qui est en copie (0203).
 *
 * Réservé à la direction : déléguer la validation revient à décider ce que
 * l'organisme diffuse. Un validateur doit pouvoir ouvrir la file, donc il est
 * choisi dans la direction ; la copie peut être n'importe quel membre de l'équipe.
 */

const ROLES_VALIDATEUR = ['owner', 'admin'];
const ROLES_COPIE = ['owner', 'admin', 'gestionnaire', 'commercial', 'referent', 'comptable'];

export type DestinatairesResult = { ok: true } | { ok: false; error: string };

export async function enregistrerDestinataires(input: DestinatairesInput): Promise<DestinatairesResult> {
  const p = destinatairesSchema.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? 'Choix invalide.' };

  const me = await getCurrentMember();
  if (!me) return { ok: false, error: 'Votre session a expiré, reconnectez-vous.' };
  if (!peutValiderSupports(me.role)) {
    return { ok: false, error: 'Seule la direction désigne qui valide les contenus.' };
  }

  const admin = supabaseAdmin();
  const { data: membres, error: erreurMembres } = await admin
    .schema('app')
    .from('members')
    .select('user_id, role')
    .eq('organization_id', me.organizationId)
    .is('deleted_at', null);
  if (erreurMembres) return { ok: false, error: "L'équipe n'a pas pu être lue. Réessayez." };
  const roles = new Map(((membres ?? []) as Array<{ user_id: string; role: string }>).map((m) => [m.user_id, m.role]));

  if (p.data.validateurs.some((id) => !ROLES_VALIDATEUR.includes(roles.get(id) ?? ''))) {
    return { ok: false, error: 'Un validateur doit être propriétaire ou administrateur.' };
  }
  if (p.data.copie.some((id) => !ROLES_COPIE.includes(roles.get(id) ?? ''))) {
    return { ok: false, error: "La copie se choisit parmi les membres de l'équipe." };
  }

  const { error: erreurSuppression } = await admin
    .schema('app')
    .from('course_validation_recipients' as never)
    .delete()
    .eq('organization_id', me.organizationId);
  if (erreurSuppression) return { ok: false, error: "Le réglage n'a pas été enregistré." };

  const lignes = [
    ...p.data.validateurs.map((userId) => ({ organization_id: me.organizationId, user_id: userId, role: 'validateur' })),
    ...p.data.copie.map((userId) => ({ organization_id: me.organizationId, user_id: userId, role: 'copie' })),
  ];
  if (lignes.length > 0) {
    const { error } = await admin.schema('app').from('course_validation_recipients' as never).insert(lignes as never);
    if (error) return { ok: false, error: "Le réglage n'a pas été enregistré." };
  }

  revalidatePath('/supports');
  return { ok: true };
}
