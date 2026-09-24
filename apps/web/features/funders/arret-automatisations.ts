import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { financementArrete } from './prise-en-charge';

/**
 * Les dossiers dont le financement est arrêté, parmi ceux qu'on examine.
 *
 * Une requête pour tout un lot : le cron traite des dizaines de dossiers par
 * passage, et une lecture par dossier le rendrait plus lent que la fenêtre qui
 * le déclenche.
 *
 * En cas d'échec de lecture, on rend un ensemble vide — donc on n'arrête rien.
 * C'est le bon sens du repli : taire des convocations parce que le compteur est
 * cassé ferait plus de dégâts qu'en envoyer une de trop.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function dossiersAuFinancementArrete(sb: SupabaseClient<any, any, any>, dossierIds: readonly string[]) {
  const arretes = new Set<string>();
  if (dossierIds.length === 0) return arretes;

  const { data, error } = await sb
    .schema('app')
    .from('dossier_funders')
    .select('dossier_id, status')
    .in('dossier_id', [...new Set(dossierIds)]);
  if (error) {
    console.error('[financement] statuts illisibles, aucun envoi arrêté', error.message);
    return arretes;
  }

  const parDossier = new Map<string, string[]>();
  for (const l of (data ?? []) as Array<{ dossier_id: string; status: string }>) {
    parDossier.set(l.dossier_id, [...(parDossier.get(l.dossier_id) ?? []), l.status]);
  }
  for (const [id, statuts] of parDossier) if (financementArrete(statuts)) arretes.add(id);
  return arretes;
}
