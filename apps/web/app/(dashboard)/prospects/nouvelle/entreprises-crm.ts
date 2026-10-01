import type { supabaseServer } from '@/shared/lib/supabase/server';
import type { EntrepriseCrm } from './demande-form.client';

/**
 * Les entreprises déjà au CRM, pour rattacher la demande à l'une d'elles.
 *
 * La conversion retrouve l'entreprise par son SIRET, sinon par son nom : en
 * recopiant les deux depuis la fiche, la demande se rattache à cette fiche au
 * lieu d'en créer une seconde.
 */
export async function chargerEntreprisesCrm(sb: ReturnType<typeof supabaseServer>): Promise<EntrepriseCrm[]> {
  const { data, error } = await sb
    .schema('app')
    .from('companies')
    .select('id, name, siret, convention_collective, contact_name, contact_email, contact_phone')
    .is('deleted_at', null)
    .order('name', { ascending: true });
  if (error) {
    // Sans la liste, on retombe sur l'annuaire et la saisie manuelle.
    console.error('[demande] entreprises du CRM illisibles', error.message);
    return [];
  }
  return (
    (data ?? []) as unknown as Array<{
      id: string;
      name: string;
      siret: string | null;
      convention_collective: string | null;
      contact_name: string | null;
      contact_email: string | null;
      contact_phone: string | null;
    }>
  ).map((c) => ({
    id: c.id,
    name: c.name,
    siret: c.siret ?? '',
    conventionCollective: c.convention_collective ?? '',
    contactName: c.contact_name ?? '',
    contactEmail: c.contact_email ?? '',
    contactPhone: c.contact_phone ?? '',
  }));
}
