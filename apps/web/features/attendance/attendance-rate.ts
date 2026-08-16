import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Taux d'assiduité d'un dossier, en % : signatures effectivement signées sur
 * signatures attendues, toutes feuilles d'émargement du dossier confondues.
 * Retourne 100 quand aucune feuille n'existe (dossier sans émargement attendu).
 */
export async function computeDossierAttendanceRate(
  sb: SupabaseClient,
  dossierId: string,
): Promise<number> {
  const { data: sheets } = await sb
    .schema('app')
    .from('attendance_sheets')
    .select('id')
    .eq('dossier_id', dossierId);

  const sheetIds = (sheets ?? []).map((s: { id: string }) => s.id);
  if (sheetIds.length === 0) return 100;

  const [{ count: totalCount }, { count: signedCount }] = await Promise.all([
    sb
      .schema('app')
      .from('attendance_signatures')
      .select('id', { count: 'exact', head: true })
      .in('attendance_sheet_id', sheetIds),
    sb
      .schema('app')
      .from('attendance_signatures')
      .select('id', { count: 'exact', head: true })
      .in('attendance_sheet_id', sheetIds)
      .not('signed_at', 'is', null),
  ]);

  const total = totalCount ?? 0;
  const signed = signedCount ?? 0;
  return total > 0 ? (signed / total) * 100 : 100;
}
