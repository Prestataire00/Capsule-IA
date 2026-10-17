'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { getCurrentMember } from '@/shared/lib/auth/current-member';
import { can } from '@/shared/lib/auth/permissions';
import { supabaseAdmin } from '@/shared/lib/supabase/admin';
import { requireMyTrainerDossier } from '@/features/trainer-space/my-dossiers';
import { RESULTATS } from './resultat';

const Schema = z.object({
  dossierId: z.string().uuid(),
  learnerId: z.string().uuid(),
  /** null : retirer le résultat. */
  resultat: z.enum(RESULTATS).nullable(),
  sessionId: z.string().uuid().optional(),
});

/**
 * Réussite ou échec d'un apprenant (0235). L'équipe qui gère les dossiers, ou
 * un formateur du dossier ; écrit en service role après l'une de ces
 * vérifications.
 */
export async function enregistrerResultat(brut: z.input<typeof Schema>): Promise<{ ok: true } | { ok: false; error: string }> {
  const p = Schema.safeParse(brut);
  if (!p.success) return { ok: false, error: 'Saisie invalide.' };
  const me = await getCurrentMember();
  const parLEquipe = Boolean(me && can(me.role, 'dossiers') === 'manage');
  if (!parLEquipe && !(await requireMyTrainerDossier(p.data.dossierId)).ok) return { ok: false, error: 'Vous ne pouvez pas modifier ce dossier.' };

  const admin = supabaseAdmin();
  const { data } = await admin.schema('app').from('dossiers').select('organization_id, resultats' as never).eq('id', p.data.dossierId).maybeSingle();
  const d = data as { organization_id: string; resultats: Record<string, string> | null } | null;
  if (!d || (parLEquipe && me && d.organization_id !== me.organizationId)) return { ok: false, error: 'Dossier introuvable.' };

  const resultats = { ...(d.resultats ?? {}) };
  if (p.data.resultat) resultats[p.data.learnerId] = p.data.resultat;
  else delete resultats[p.data.learnerId];
  const { error } = await admin.schema('app').from('dossiers').update({ resultats } as never).eq('id', p.data.dossierId);
  if (error) return { ok: false, error: 'Le résultat n’a pas pu être enregistré.' };

  if (p.data.sessionId) revalidatePath(`/sessions/${p.data.sessionId}/apprenants`);
  revalidatePath(`/dossiers/${p.data.dossierId}`);
  return { ok: true };
}
