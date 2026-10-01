import type { supabaseServer } from '@/shared/lib/supabase/server';
import type { EntrepriseCrm, Interlocuteur } from './demande-form.client';

/**
 * Les entreprises déjà au CRM, pour rattacher la demande à l'une d'elles.
 *
 * La conversion retrouve l'entreprise par son SIRET, sinon par son nom : en
 * recopiant les deux depuis la fiche, la demande se rattache à cette fiche au
 * lieu d'en créer une seconde.
 */
export async function chargerEntreprisesCrm(sb: ReturnType<typeof supabaseServer>): Promise<EntrepriseCrm[]> {
  const [{ data, error }, { data: contactsData }, { data: dossiersData }] = await Promise.all([
    sb
      .schema('app')
      .from('companies')
      .select('id, name, siret, convention_collective, contact_name, contact_email, contact_phone')
      .is('deleted_at', null)
      .order('name', { ascending: true }),
    sb
      .schema('app')
      .from('contacts')
      .select('id, company_id, first_name, last_name, email, phone, is_primary')
      .is('deleted_at', null),
    // Référent des dossiers (0167), du plus récent au plus ancien.
    sb
      .schema('app')
      .from('dossiers')
      .select('company_id, contact_id')
      .not('company_id', 'is', null)
      .not('contact_id', 'is', null)
      .is('deleted_at', null)
      .order('created_at', { ascending: false }),
  ]);
  if (error) {
    // Sans la liste, on retombe sur l'annuaire et la saisie manuelle.
    console.error('[demande] entreprises du CRM illisibles', error.message);
    return [];
  }
  const contacts = (contactsData ?? []) as unknown as Array<{
    id: string;
    company_id: string;
    first_name: string;
    last_name: string;
    email: string | null;
    phone: string | null;
    is_primary: boolean;
  }>;
  const referentRecent = new Map<string, string>();
  for (const d of (dossiersData ?? []) as unknown as Array<{ company_id: string; contact_id: string }>) {
    if (!referentRecent.has(d.company_id)) referentRecent.set(d.company_id, d.contact_id);
  }

  // L'interlocuteur à reprendre : le référent du dernier dossier de
  // l'entreprise, sinon son contact principal, sinon un de ses contacts,
  // sinon le contact saisi sur la fiche entreprise.
  const interlocuteurDe = (c: {
    id: string;
    contact_name: string | null;
    contact_email: string | null;
    contact_phone: string | null;
  }): Interlocuteur | null => {
    const siens = contacts.filter((x) => x.company_id === c.id);
    const choisi =
      siens.find((x) => x.id === referentRecent.get(c.id)) ?? siens.find((x) => x.is_primary) ?? siens[0];
    if (choisi) {
      return {
        firstName: choisi.first_name,
        lastName: choisi.last_name,
        email: choisi.email ?? '',
        phone: choisi.phone ?? '',
      };
    }
    const nom = c.contact_name?.trim();
    if (!nom && !c.contact_email) return null;
    const [prenom, ...reste] = (nom ?? '').split(/\s+/);
    return {
      firstName: reste.length ? prenom ?? '' : '',
      lastName: reste.length ? reste.join(' ') : prenom ?? '',
      email: c.contact_email ?? '',
      phone: c.contact_phone ?? '',
    };
  };

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
    interlocuteur: interlocuteurDe(c),
  }));
}
