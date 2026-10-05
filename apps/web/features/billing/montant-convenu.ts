import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Sb = SupabaseClient<any, any, any>;

/**
 * Le montant du dossier vient d'être saisi à la main : c'est désormais un prix
 * convenu, que la grille tarifaire (0208) ne recalcule plus.
 */
export async function marquerMontantConvenu(sb: Sb, dossierId: string): Promise<void> {
  const { data } = await sb.schema('app').from('dossiers').select('metadata').eq('id', dossierId).maybeSingle();
  const metadata = ((data as { metadata: Record<string, unknown> | null } | null)?.metadata ?? {}) as Record<string, unknown>;
  if (metadata.montant_source === 'saisi') return;
  const { error } = await sb
    .schema('app')
    .from('dossiers')
    .update({ metadata: { ...metadata, montant_source: 'saisi' } } as never)
    .eq('id', dossierId);
  if (error) console.error('[dossier] origine du montant non notée', dossierId, error.message);
}
