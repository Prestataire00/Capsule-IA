import 'server-only';
import { supabaseServer } from '@/shared/lib/supabase/server';

// Garde d'accès pour les routes PDF de dossier (jusqu'ici non authentifiées) :
// l'utilisateur doit être connecté ET avoir accès au dossier. On s'appuie sur la
// RLS de `app.dossiers` (staff / comptable / formateur du dossier) : si la requête
// RLS ne renvoie aucune ligne, l'accès est refusé.
export async function canAccessDossier(dossierId: string): Promise<boolean> {
  const sb = supabaseServer();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return false;
  const { data } = await sb
    .schema('app')
    .from('dossiers')
    .select('id')
    .eq('id', dossierId)
    .maybeSingle();
  return Boolean(data);
}
