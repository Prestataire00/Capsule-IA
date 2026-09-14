import 'server-only';
import { supabaseAdmin } from '@/shared/lib/supabase/admin';

/**
 * Le carnet d'adresses d'une séance, vu par le formateur.
 *
 * Un formateur externe n'est pas membre de l'organisation : il ne peut pas lire
 * `companies` ni `organizations` sous RLS. La lecture se fait donc en service
 * role, APRÈS `requireMyTrainerSession` — et strictement pour cette séance.
 *
 * Trois cercles : les participants (à qui il enseigne), l'entreprise cliente et
 * son référent (qui commande et paie), l'organisme (qui l'a mandaté).
 */

export type Contact = {
  readonly name: string;
  readonly role: string;
  readonly email: string | null;
  readonly phone: string | null;
};

export type SessionContacts = {
  readonly participants: readonly Contact[];
  readonly entreprises: readonly Contact[];
  readonly organisme: Contact | null;
};

type SessionRef = {
  readonly id: string;
  readonly organization_id: string;
  readonly dossier_id: string | null;
};

const nomComplet = (first: string | null, last: string | null, secours: string): string =>
  `${first ?? ''} ${last ?? ''}`.trim() || secours;

export async function loadSessionContacts(session: SessionRef): Promise<SessionContacts> {
  const admin = supabaseAdmin();

  // Les apprenants d'une séance arrivent par trois chemins selon qu'elle est
  // individuelle (dossier direct), de groupe (dossiers liés) ou composée à la
  // main (participants). Aucun n'est redondant.
  const [participantsRows, sessionDossiers] = await Promise.all([
    admin
      .schema('app')
      .from('session_participants')
      .select('learner_id')
      .eq('session_id', session.id)
      .eq('participant_kind', 'learner'),
    admin.schema('app').from('session_dossiers' as never).select('dossier_id').eq('session_id', session.id),
  ]);

  const dossierIds = new Set<string>();
  if (session.dossier_id) dossierIds.add(session.dossier_id);
  for (const r of (sessionDossiers.data ?? []) as Array<{ dossier_id: string }>) dossierIds.add(r.dossier_id);

  const { data: dossiersData } = dossierIds.size
    ? await admin
        .schema('app')
        .from('dossiers')
        .select('id, learner_id, company_id')
        .in('id', [...dossierIds])
    : { data: [] };
  const dossiers = (dossiersData ?? []) as Array<{ id: string; learner_id: string | null; company_id: string | null }>;

  const learnerIds = new Set<string>();
  for (const r of (participantsRows.data ?? []) as Array<{ learner_id: string | null }>) {
    if (r.learner_id) learnerIds.add(r.learner_id);
  }
  for (const d of dossiers) if (d.learner_id) learnerIds.add(d.learner_id);

  const { data: learnersData } = learnerIds.size
    ? await admin
        .schema('app')
        .from('learners')
        .select('id, first_name, last_name, email, phone, company_id')
        .in('id', [...learnerIds])
        .is('deleted_at', null)
        .order('last_name', { ascending: true })
    : { data: [] };
  const learners = (learnersData ?? []) as Array<{
    id: string;
    first_name: string | null;
    last_name: string | null;
    email: string | null;
    phone: string | null;
    company_id: string | null;
  }>;

  const companyIds = new Set<string>();
  for (const d of dossiers) if (d.company_id) companyIds.add(d.company_id);
  for (const l of learners) if (l.company_id) companyIds.add(l.company_id);

  const { data: companiesData } = companyIds.size
    ? await admin
        .schema('app')
        .from('companies')
        .select('id, name, contact_name, contact_email, contact_phone')
        .in('id', [...companyIds])
        .is('deleted_at', null)
    : { data: [] };
  const companies = (companiesData ?? []) as Array<{
    id: string;
    name: string;
    contact_name: string | null;
    contact_email: string | null;
    contact_phone: string | null;
  }>;

  const { data: orgRow } = await admin
    .schema('app')
    .from('organizations')
    .select('name, contact_email, contact_phone')
    .eq('id', session.organization_id)
    .maybeSingle();
  const org = orgRow as { name: string; contact_email: string | null; contact_phone: string | null } | null;

  const parCompany = new Map(companies.map((c) => [c.id, c.name]));

  return {
    participants: learners.map((l) => ({
      name: nomComplet(l.first_name, l.last_name, 'Apprenant'),
      role: l.company_id ? (parCompany.get(l.company_id) ?? 'Salarié') : 'Particulier',
      email: l.email,
      phone: l.phone,
    })),
    entreprises: companies.map((c) => ({
      name: c.name,
      role: c.contact_name ? `Référent : ${c.contact_name}` : 'Entreprise cliente',
      email: c.contact_email,
      phone: c.contact_phone,
    })),
    organisme: org
      ? { name: org.name, role: 'Organisme de formation', email: org.contact_email, phone: org.contact_phone }
      : null,
  };
}
