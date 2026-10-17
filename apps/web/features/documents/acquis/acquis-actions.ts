'use server';

import { revalidatePath } from 'next/cache';
import { getCurrentMember } from '@/shared/lib/auth/current-member';
import { can } from '@/shared/lib/auth/permissions';
import { supabaseAdmin } from '@/shared/lib/supabase/admin';
import { requireMyTrainerDossier } from '@/features/trainer-space/my-dossiers';
import { acquisSchema, type AcquisInput } from './acquis.schema';

/**
 * Le niveau atteint sur un objectif (0234). Modifiable par l'équipe qui gère
 * les dossiers, ou par un formateur du dossier. Écrit en service role après
 * l'une de ces deux vérifications ; « acquis » efface la saisie (c'est le défaut).
 */
export async function enregistrerAcquis(brut: AcquisInput): Promise<{ ok: true } | { ok: false; error: string }> {
  const p = acquisSchema.safeParse(brut);
  if (!p.success) return { ok: false, error: 'Saisie invalide.' };

  const me = await getCurrentMember();
  const parLEquipe = Boolean(me && can(me.role, 'dossiers') === 'manage');
  const parLeFormateur = parLEquipe ? false : (await requireMyTrainerDossier(p.data.dossierId)).ok;
  if (!parLEquipe && !parLeFormateur) return { ok: false, error: 'Vous ne pouvez pas modifier ce dossier.' };

  const admin = supabaseAdmin();
  const { data } = await admin
    .schema('app')
    .from('dossiers')
    .select('organization_id, acquis_objectifs' as never)
    .eq('id', p.data.dossierId)
    .maybeSingle();
  const d = data as { organization_id: string; acquis_objectifs: Record<string, string> | null } | null;
  if (!d || (me && parLEquipe && d.organization_id !== me.organizationId)) return { ok: false, error: 'Dossier introuvable.' };

  const acquis = { ...(d.acquis_objectifs ?? {}) };
  if (p.data.niveau === 'acquis') delete acquis[p.data.objectif];
  else acquis[p.data.objectif] = p.data.niveau;

  const { error } = await admin.schema('app').from('dossiers').update({ acquis_objectifs: acquis } as never).eq('id', p.data.dossierId);
  if (error) return { ok: false, error: 'Le niveau n’a pas pu être enregistré.' };

  revalidatePath(`/dossiers/${p.data.dossierId}/documents`);
  revalidatePath(`/mes-dossiers/${p.data.dossierId}`);
  return { ok: true };
}
