import 'server-only';
import { supabaseAdmin } from '@/shared/lib/supabase/admin';
import { acquisDesObjectifs, type NiveauAcquis } from '../acquis-objectifs';

/** Objectifs du programme du dossier et niveau atteint (appelant déjà autorisé sur le dossier). */
export async function chargerAcquis(dossierId: string): Promise<Array<{ objectif: string; niveau: NiveauAcquis }>> {
  const { data } = await supabaseAdmin()
    .schema('app')
    .from('dossiers')
    .select('acquis_objectifs, formation:formations(objectives)' as never)
    .eq('id', dossierId)
    .maybeSingle();
  const d = data as { acquis_objectifs?: unknown; formation?: { objectives: string[] | null } | Array<{ objectives: string[] | null }> | null } | null;
  const f = Array.isArray(d?.formation) ? d?.formation[0] : d?.formation;
  return acquisDesObjectifs(f?.objectives ?? [], d?.acquis_objectifs);
}
