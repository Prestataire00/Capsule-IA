import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { contactReferent, decouperNom, type ContactClient } from './referent-du-client';

/**
 * Le référent d'un dossier d'entreprise : celui qu'on a désigné, sinon le
 * contact référent du client (fiche entreprise). Demande d'Ismael le
 * 07/10/2026 : « le référent est le contact référent du client » — un dossier
 * sans référent désigné n'ouvrait pas d'espace entreprise.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Client = SupabaseClient<any, any, any>;

export type ReferentPropose = {
  readonly contactId: string | null;
  readonly nom: string;
  readonly email: string | null;
  /** `dossier` : désigné sur le dossier ; `client` : repris de la fiche entreprise. */
  readonly source: 'dossier' | 'client';
};

type Dossier = { organization_id: string; company_id: string | null; contact_id: string | null };

async function lireClient(sb: Client, d: Dossier) {
  const [{ data: entreprise }, { data: contacts }] = await Promise.all([
    sb.schema('app').from('companies').select('contact_name, contact_email, contact_phone').eq('id', d.company_id!).maybeSingle(),
    sb
      .schema('app')
      .from('contacts')
      .select('id, first_name, last_name, email, is_primary')
      .eq('company_id', d.company_id!)
      .is('deleted_at', null),
  ]);
  const e = entreprise as { contact_name: string | null; contact_email: string | null; contact_phone: string | null } | null;
  const liste: ContactClient[] = ((contacts ?? []) as Array<{
    id: string;
    first_name: string | null;
    last_name: string | null;
    email: string | null;
    is_primary: boolean | null;
  }>).map((c) => ({ id: c.id, prenom: c.first_name, nom: c.last_name, email: c.email, principal: Boolean(c.is_primary) }));
  const responsable = { nom: e?.contact_name ?? null, email: e?.contact_email ?? null };
  return { entreprise: e, choisi: contactReferent(liste, responsable), responsable };
}

const nomDe = (prenom: string | null, nom: string | null) => `${prenom ?? ''} ${nom ?? ''}`.trim();

/** Lecture seule : qui sera le référent de ce dossier. */
export async function referentPropose(sb: Client, dossierId: string): Promise<ReferentPropose | null> {
  const { data } = await sb.schema('app').from('dossiers').select('organization_id, company_id, contact_id').eq('id', dossierId).maybeSingle();
  const d = data as Dossier | null;
  if (!d) return null;
  if (d.contact_id) {
    const { data: c } = await sb.schema('app').from('contacts').select('first_name, last_name, email').eq('id', d.contact_id).is('deleted_at', null).maybeSingle();
    const contact = c as { first_name: string | null; last_name: string | null; email: string | null } | null;
    if (contact) return { contactId: d.contact_id, nom: nomDe(contact.first_name, contact.last_name) || 'Sans nom', email: contact.email, source: 'dossier' };
  }
  if (!d.company_id) return null;
  const { choisi, responsable } = await lireClient(sb, d);
  if (choisi) return { contactId: choisi.id, nom: nomDe(choisi.prenom, choisi.nom) || 'Sans nom', email: choisi.email, source: 'client' };
  if (responsable.email || responsable.nom) {
    return { contactId: null, nom: responsable.nom?.trim() || responsable.email || 'Responsable', email: responsable.email, source: 'client' };
  }
  return null;
}

/**
 * Rattache le référent du client au dossier — et aux dossiers du même client
 * qui n'en ont pas, pour que son espace les montre tous. Crée la fiche contact
 * du responsable de l'entreprise quand elle n'existe pas encore. À appeler en
 * service role, après la vérification des droits sur le dossier.
 */
export async function attacherReferent(admin: Client, dossierId: string): Promise<string | null> {
  const { data } = await admin.schema('app').from('dossiers').select('organization_id, company_id, contact_id').eq('id', dossierId).maybeSingle();
  const d = data as Dossier | null;
  if (!d) return null;
  if (d.contact_id) return d.contact_id;
  if (!d.company_id) return null;

  const { choisi, responsable, entreprise } = await lireClient(admin, d);
  let contactId = choisi?.id ?? null;
  if (!contactId && (responsable.email || responsable.nom)) {
    const { prenom, nom } = decouperNom(responsable.nom);
    const { data: cree, error } = await admin
      .schema('app')
      .from('contacts')
      .insert({
        organization_id: d.organization_id,
        company_id: d.company_id,
        first_name: prenom ?? '',
        last_name: nom ?? responsable.email ?? 'Responsable',
        email: responsable.email,
        phone: entreprise?.contact_phone ?? null,
        is_primary: true,
      } as never)
      .select('id')
      .single();
    if (error) throw new Error(`[référent] fiche du responsable non créée : ${error.message}`);
    contactId = (cree as { id: string }).id;
  }
  if (!contactId) return null;

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
