import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { referentDuDossier } from '@/features/sessions/invites-visio';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Sb = SupabaseClient<any, any, any>;

export type ReferentDossier = { readonly email: string; readonly prenom: string; readonly contactId: string | null };

const un = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null));

/**
 * À qui écrire pour chaque dossier : son référent, sinon le contact de
 * l'entreprise. C'est l'entreprise qui transmet à ses stagiaires — on n'a pas
 * toujours leur adresse, et elle reçoit un seul e-mail pour tous.
 */
export async function referentsDesDossiers(sb: Sb, dossierIds: readonly string[]): Promise<Map<string, ReferentDossier>> {
  const out = new Map<string, ReferentDossier>();
  if (dossierIds.length === 0) return out;
  const { data, error } = await sb
    .schema('app')
    .from('dossiers')
    .select('id, contact_id, contact:contacts(email, first_name), company:companies(contact_email, contact_name)')
    .in('id', [...new Set(dossierIds)]);
  if (error) throw new Error(`[référents] lecture impossible : ${error.message}`);
  for (const d of (data ?? []) as unknown as Array<{
    id: string;
    contact_id: string | null;
    contact: { email: string | null; first_name: string | null } | Array<{ email: string | null; first_name: string | null }> | null;
    company: { contact_email: string | null; contact_name: string | null } | Array<{ contact_email: string | null; contact_name: string | null }> | null;
  }>) {
    const contact = un(d.contact);
    const entreprise = un(d.company);
    const email = referentDuDossier({ referentEmail: contact?.email, companyEmail: entreprise?.contact_email });
    if (!email) continue;
    const parLeReferent = Boolean(contact?.email && email === contact.email.trim().toLowerCase());
    out.set(d.id, {
      email,
      prenom: (parLeReferent ? contact?.first_name : entreprise?.contact_name) ?? '',
      contactId: parLeReferent ? d.contact_id : null,
    });
  }
  return out;
}
