import 'server-only';
import { supabaseAdmin } from '@/shared/lib/supabase/admin';
import { lireGrille, type GrilleTarifaire } from './grille-tarifaire';

/** La grille de l'organisme (0208), ou celle de départ s'il n'a rien réglé. */
export async function chargerGrille(organizationId: string): Promise<GrilleTarifaire> {
  const { data, error } = await supabaseAdmin()
    .schema('app')
    .from('organizations')
    .select('grille_tarifaire' as never)
    .eq('id', organizationId)
    .maybeSingle();
  if (error) console.error('[grille] lecture impossible, grille de départ appliquée', organizationId, error.message);
  return lireGrille((data as { grille_tarifaire?: unknown } | null)?.grille_tarifaire ?? null);
}
