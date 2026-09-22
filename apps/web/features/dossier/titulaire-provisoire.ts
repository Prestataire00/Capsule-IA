import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { DOMAINE_PROVISOIRE } from './referent';

/**
 * Titulaire provisoire d'un dossier sans stagiaire nommé.
 *
 * `dossiers.learner_id` est obligatoire, mais un dossier s'ouvre souvent avant
 * que les noms soient connus : une commande d'entreprise, ou une demande
 * passée par un responsable qui ne suivra pas lui-même la formation. On pose
 * alors un titulaire sur une adresse en `.invalid` (RFC 2606) — aucun envoi ne
 * partira vers un destinataire inventé, et les écrans affichent le référent à
 * sa place (`nomDuDossier`).
 *
 * Extrait de l'assistant de création : la conversion d'une demande en avait
 * besoin à son tour, et deux copies auraient divergé sur l'adresse réservée —
 * celle-là même qui empêche les envois.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Client = SupabaseClient<any, any, any>;

/**
 * Un seul titulaire provisoire par entreprise : le réutiliser évite d'empiler
 * des « Stagiaires à désigner » dans la liste des apprenants.
 */
export async function titulaireProvisoire(
  sb: Client,
  organizationId: string,
  companyId: string | null,
): Promise<string | null> {
  const email = `stagiaires-a-designer.${(companyId ?? organizationId).slice(0, 8)}${DOMAINE_PROVISOIRE}`;

  const { data: existant } = await sb
    .schema('app')
    .from('learners')
    .select('id')
    .eq('organization_id', organizationId)
    .eq('email', email)
    .is('deleted_at', null)
    .maybeSingle();
  if (existant) return (existant as { id: string }).id;

  const { data, error } = await sb
    .schema('app')
    .from('learners')
    .insert({
      organization_id: organizationId,
      company_id: companyId,
      first_name: 'Stagiaires',
      last_name: 'à désigner',
      email,
    } as never)
    .select('id')
    .single();
  if (error || !data) {
    console.error('[dossier] titulaire provisoire non créé', error?.message);
    return null;
  }
  return (data as { id: string }).id;
}
