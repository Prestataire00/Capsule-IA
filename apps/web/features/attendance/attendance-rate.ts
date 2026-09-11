import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Taux d'assiduité d'un dossier, en % : heures réellement suivies sur heures
 * dispensées, demi-journée par demi-journée, retards et départs anticipés
 * déduits (`app.recompute_dossier_hours`, 0146).
 *
 * L'ancien calcul divisait les signatures posées par les lignes existantes —
 * or une ligne n'existait qu'une fois signée : ≈ 100 % en toutes
 * circonstances, reporté tel quel sur les attestations.
 *
 * Tant qu'aucune séance n'a été dispensée, rien n'était attendu : 100.
 */
export async function computeDossierAttendanceRate(sb: SupabaseClient, dossierId: string): Promise<number> {
  const { error } = await sb.schema('app').rpc('recompute_dossier_hours' as never, { p_dossier_id: dossierId } as never);
  if (error) console.error('[assiduité] recalcul des heures impossible', error.message);

  const { data } = await sb
    .schema('app')
    .from('dossier_hours_tracking' as never)
    .select('hours_delivered, attendance_rate')
    .eq('dossier_id' as never, dossierId as never)
    .maybeSingle();
  const h = data as { hours_delivered: number | string; attendance_rate: number | string } | null;
  if (!h || Number(h.hours_delivered) <= 0) return 100;
  return Number(h.attendance_rate);
}
