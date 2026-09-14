'use server';

import { revalidatePath } from 'next/cache';
import { supabaseAdmin } from '@/shared/lib/supabase/admin';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { can } from '@/shared/lib/auth/permissions';
import { ENTITES, estEntite } from './entities';

export type CorbeilleResult = { ok: true } | { ok: false; error: string };

/** Organisation et rôle du membre connecté (service_role : la garde est ici). */
async function membreCourant(): Promise<{ orgId: string; role: string } | null> {
  const {
    data: { user },
  } = await supabaseServer().auth.getUser();
  if (!user) return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (supabaseAdmin() as any)
    .schema('app')
    .from('members')
    .select('organization_id, role')
    .eq('user_id', user.id)
    .is('deleted_at', null)
    .order('is_default_org', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data?.organization_id) return null;
  return { orgId: data.organization_id as string, role: data.role as string };
}

async function basculer(entite: string, id: string, versCorbeille: boolean): Promise<CorbeilleResult> {
  if (!estEntite(entite)) return { ok: false, error: 'entite_inconnue' };
  const def = ENTITES[entite]!;

  const membre = await membreCourant();
  if (!membre) return { ok: false, error: 'unauthenticated' };
  if (can(membre.role, def.section) !== 'manage') return { ok: false, error: 'forbidden' };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = supabaseAdmin() as any;
  const { data: existant } = await admin
    .schema('app')
    .from(def.table)
    .select('id')
    .eq('id', id)
    .eq('organization_id', membre.orgId)
    .maybeSingle();
  if (!existant) return { ok: false, error: 'not_found' };

  const { error } = await admin
    .schema('app')
    .from(def.table)
    .update({ deleted_at: versCorbeille ? new Date().toISOString() : null })
    .eq('id', id)
    .eq('organization_id', membre.orgId);
  if (error) {
    console.error(`[corbeille] ${versCorbeille ? 'suppression' : 'restauration'} ${def.table} :`, error.message);
    return { ok: false, error: versCorbeille ? 'suppression_impossible' : 'restauration_impossible' };
  }

  for (const chemin of [...def.revalider, '/corbeille']) revalidatePath(chemin);
  return { ok: true };
}

/** Met un objet à la corbeille (rien n'est effacé : `deleted_at` est posé). */
export async function supprimerEntite(entite: string, id: string): Promise<CorbeilleResult> {
  return basculer(entite, id, true);
}

/** Sort un objet de la corbeille. */
export async function restaurerEntite(entite: string, id: string): Promise<CorbeilleResult> {
  return basculer(entite, id, false);
}
