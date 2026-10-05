import 'server-only';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { supabaseAdmin } from '@/shared/lib/supabase/admin';

// Garde d'accès pour les routes PDF de dossier (convention, programme,
// attestations, convocation) : connecté, dossier lisible sous RLS, ET membre de
// l'équipe de l'organisme. La RLS ouvre aussi le dossier au formateur qui
// l'anime (0150) ; or ces PDF portent les montants — convention, programme —
// et le formateur n'a pas à les voir. Son espace lui donne le programme sans tarif.
export async function canAccessDossier(dossierId: string): Promise<boolean> {
  const sb = supabaseServer();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return false;
  const { data } = await sb
    .schema('app')
    .from('dossiers')
    .select('id, organization_id')
    .eq('id', dossierId)
    .maybeSingle();
  const dossier = data as { id: string; organization_id: string } | null;
  if (!dossier) return false;

  const { data: membre } = await supabaseAdmin()
    .schema('app')
    .from('members')
    .select('role')
    .eq('user_id', user.id)
    .eq('organization_id', dossier.organization_id)
    .is('deleted_at', null)
    .maybeSingle();
  const role = (membre as { role: string } | null)?.role;
  return Boolean(role) && role !== 'formateur';
}
