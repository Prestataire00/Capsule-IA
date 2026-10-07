import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { LIBELLE_SOURCE, candidatsDeLaDemande, choisirReferent, decouperNom, type Candidat, type ContactClient } from './referent-du-client';

/**
 * Le référent d'un dossier d'entreprise : celui qu'on a désigné, sinon le
 * contact référent du client. Demande d'Ismael le 07/10/2026 : « le référent
 * est le contact référent du client » — un dossier sans référent désigné
 * n'ouvrait pas d'espace entreprise, même quand l'entreprise l'avait déclaré
 * dans sa demande d'inscription.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Client = SupabaseClient<any, any, any>;

export type ReferentPropose = {
  readonly contactId: string | null;
  readonly nom: string;
  readonly email: string | null;
  /** D'où il vient : désigné sur le dossier, ou repris (et de quoi). */
  readonly origine: string | null;
};

type Dossier = { organization_id: string; company_id: string | null; contact_id: string | null };

async function lireClient(sb: Client, d: Dossier & { id: string }) {
  const companyId = d.company_id!;
  const [{ data: entreprise }, { data: contacts }, { data: dossiersClient }, { data: devis }] = await Promise.all([
    sb.schema('app').from('companies').select('contact_name, contact_email, contact_phone').eq('id', companyId).maybeSingle(),
    sb.schema('app').from('contacts').select('id, first_name, last_name, email, is_primary').eq('company_id', companyId).is('deleted_at', null),
    sb.schema('app').from('dossiers').select('id').eq('company_id', companyId).is('deleted_at', null),
    sb
      .schema('app')
      .from('quotes')
      .select('recipient_name, recipient_email')
      .eq('company_id', companyId)
      .not('recipient_email', 'is', null)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(1),
  ]);
  const idsDossiers = [d.id, ...((dossiersClient ?? []) as Array<{ id: string }>).map((x) => x.id)];
  const { data: demandes } = await sb
    .schema('app')
    .from('prospects')
    .select('converted_dossier_id, first_name, last_name, email, phone, referent_name, referent_email, referent_phone, candidate_is_learner, created_at')
    .in('converted_dossier_id', [...new Set(idsDossiers)])
    .is('deleted_at', null)
    .order('created_at', { ascending: false });

  // La demande de CE dossier d'abord, puis celles des autres dossiers du client.
  const lignesDemandes = ((demandes ?? []) as Array<{
    converted_dossier_id: string;
    first_name: string | null;
    last_name: string | null;
    email: string | null;
    phone: string | null;
    referent_name: string | null;
    referent_email: string | null;
    referent_phone: string | null;
    candidate_is_learner: boolean | null;
  }>).sort((a, b) => Number(b.converted_dossier_id === d.id) - Number(a.converted_dossier_id === d.id));

  const e = entreprise as { contact_name: string | null; contact_email: string | null; contact_phone: string | null } | null;
  const q = ((devis ?? []) as Array<{ recipient_name: string | null; recipient_email: string | null }>)[0];
  const candidats: Candidat[] = [
    ...lignesDemandes.flatMap((p) => candidatsDeLaDemande(p)),
    ...(e?.contact_email || e?.contact_name ? [{ nom: e.contact_name, email: e.contact_email, telephone: e.contact_phone, source: 'fiche_entreprise' as const }] : []),
    ...(q ? [{ nom: q.recipient_name, email: q.recipient_email, source: 'devis' as const }] : []),
  ];
  const liste: ContactClient[] = ((contacts ?? []) as Array<{
    id: string;
    first_name: string | null;
    last_name: string | null;
    email: string | null;
    is_primary: boolean | null;
  }>).map((c) => ({ id: c.id, prenom: c.first_name, nom: c.last_name, email: c.email, principal: Boolean(c.is_primary) }));
  return { choix: choisirReferent(liste, candidats), candidats };
}

const nomDe = (prenom: string | null, nom: string | null) => `${prenom ?? ''} ${nom ?? ''}`.trim();

async function lireDossier(sb: Client, dossierId: string): Promise<(Dossier & { id: string }) | null> {
  const { data } = await sb.schema('app').from('dossiers').select('id, organization_id, company_id, contact_id').eq('id', dossierId).maybeSingle();
  return data as (Dossier & { id: string }) | null;
}

/** Lecture seule : qui sera le référent de ce dossier. */
export async function referentPropose(sb: Client, dossierId: string): Promise<ReferentPropose | null> {
  const d = await lireDossier(sb, dossierId);
  if (!d) return null;
  if (d.contact_id) {
    const { data: c } = await sb.schema('app').from('contacts').select('first_name, last_name, email').eq('id', d.contact_id).is('deleted_at', null).maybeSingle();
    const contact = c as { first_name: string | null; last_name: string | null; email: string | null } | null;
    if (contact) return { contactId: d.contact_id, nom: nomDe(contact.first_name, contact.last_name) || 'Sans nom', email: contact.email, origine: null };
  }
  if (!d.company_id) return null;
  const { choix, candidats } = await lireClient(sb, d);
  if (!choix) return null;
  if ('contact' in choix) {
    const source = candidats.find((c) => c.email && c.email.trim().toLowerCase() === choix.contact.email?.trim().toLowerCase())?.source ?? 'contact';
    return {
      contactId: choix.contact.id,
      nom: nomDe(choix.contact.prenom, choix.contact.nom) || 'Sans nom',
      email: choix.contact.email,
      origine: LIBELLE_SOURCE[source],
    };
  }
  return { contactId: null, nom: choix.creer.nom?.trim() || choix.creer.email || 'Référent', email: choix.creer.email, origine: LIBELLE_SOURCE[choix.creer.source] };
}

/**
 * Rattache le référent du client au dossier — et aux dossiers du même client
 * qui n'en ont pas, pour que son espace les montre tous. Crée sa fiche
 * contact quand elle n'existe pas encore. À appeler en service role, après la
 * vérification des droits sur le dossier.
 */
export async function attacherReferent(admin: Client, dossierId: string): Promise<string | null> {
  const d = await lireDossier(admin, dossierId);
  if (!d) return null;
  if (d.contact_id) return d.contact_id;
  if (!d.company_id) return null;

  const { choix } = await lireClient(admin, d);
  if (!choix) return null;
  let contactId: string;
  if ('contact' in choix) contactId = choix.contact.id;
  else {
    const { prenom, nom } = decouperNom(choix.creer.nom);
    const { data: cree, error } = await admin
      .schema('app')
      .from('contacts')
      .insert({
        organization_id: d.organization_id,
        company_id: d.company_id,
        first_name: prenom ?? '',
        last_name: nom ?? choix.creer.email ?? 'Référent',
        email: choix.creer.email,
        phone: choix.creer.telephone ?? null,
        is_primary: true,
      } as never)
      .select('id')
      .single();
    if (error) throw new Error(`[référent] fiche du référent non créée : ${error.message}`);
    contactId = (cree as { id: string }).id;
  }

  const { error } = await admin
    .schema('app')
    .from('dossiers')
    .update({ contact_id: contactId } as never)
    .eq('organization_id', d.organization_id)
    .eq('company_id', d.company_id)
    .is('contact_id', null)
    .is('deleted_at', null);
  if (error) throw new Error(`[référent] dossier non rattaché : ${error.message}`);
  return contactId;
}
