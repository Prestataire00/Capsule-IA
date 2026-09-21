import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { etatFinancement, type EtatFinancement, type LigneFinanceur } from './prise-en-charge';

/**
 * État du financement de plusieurs dossiers, en une requête.
 *
 * La bannière d'un dossier et la liste doivent afficher le même chiffre : un
 * chargeur commun l'assure, là où deux requêtes écrites séparément finiraient
 * par diverger.
 *
 * Lecture tolérante : si la table n'est pas lisible, on renvoie une carte vide
 * plutôt que de faire tomber l'écran. Un dossier sans ligne de financement est
 * légitime — le client règle alors la totalité.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Client = SupabaseClient<any, any, any>;

export async function chargerEtatsFinancement(
  sb: Client,
  dossiers: readonly { id: string; total_amount_cents?: number | null }[],
): Promise<Map<string, EtatFinancement>> {
  const ids = [...new Set(dossiers.map((d) => d.id))];
  if (ids.length === 0) return new Map();

  const { data, error } = await sb
    .schema('app')
    .from('dossier_funders')
    .select('dossier_id, status, amount_cents, granted_cents')
    .in('dossier_id', ids);
  if (error) {
    console.error('[financement] états illisibles', error.message);
    return new Map();
  }

  const parDossier = new Map<string, LigneFinanceur[]>();
  for (const l of (data ?? []) as Array<{
    dossier_id: string;
    status: string;
    amount_cents: number | string;
    granted_cents: number | string | null;
  }>) {
    const liste = parDossier.get(l.dossier_id) ?? [];
    liste.push({
      status: l.status,
      amountCents: Number(l.amount_cents ?? 0),
      grantedCents: l.granted_cents == null ? null : Number(l.granted_cents),
    });
    parDossier.set(l.dossier_id, liste);
  }

  return new Map(
    dossiers.map((d) => [d.id, etatFinancement(d.total_amount_cents ?? 0, parDossier.get(d.id) ?? [])]),
  );
}
