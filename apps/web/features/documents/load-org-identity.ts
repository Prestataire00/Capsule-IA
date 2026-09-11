import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { OrgIdentity } from './legal/org-identity';

// Identité de l'organisme telle qu'elle figure sur tous les documents.
// Une seule lecture, un seul format : les générateurs n'ont plus à composer
// l'adresse ni à deviner quelles colonnes afficher.

type AddressJson = { line1?: string; line2?: string; city?: string; postal_code?: string; country?: string };

export function composeOrgAddress(addr: unknown): string | null {
  if (!addr || typeof addr !== 'object') return typeof addr === 'string' && addr.trim() ? addr : null;
  const a = addr as AddressJson;
  const parts = [
    [a.line1, a.line2].filter(Boolean).join(' '),
    [a.postal_code, a.city].filter(Boolean).join(' '),
    a.country,
  ].filter((p) => p && p.trim().length > 0);
  return parts.length ? parts.join(', ') : null;
}

export const ORG_IDENTITY_COLUMNS =
  'name, legal_name, siret, declaration_activite, certifications, address, contact_email, contact_phone';

export type OrgIdentityRow = {
  name?: string | null;
  legal_name?: string | null;
  siret?: string | null;
  declaration_activite?: string | null;
  certifications?: string | null;
  address?: unknown;
  contact_email?: string | null;
  contact_phone?: string | null;
};

/** Construit l'identité depuis une ligne `organizations` déjà chargée. */
export function orgIdentityFromRow(row: OrgIdentityRow | null | undefined): OrgIdentity {
  const r = row ?? {};
  return {
    name: (r.legal_name || r.name || 'Organisme de formation').trim(),
    address: composeOrgAddress(r.address),
    phone: r.contact_phone ?? null,
    email: r.contact_email ?? null,
    siret: r.siret ?? null,
    nda: r.declaration_activite ?? null,
    certifications: r.certifications ?? null,
  };
}

export async function loadOrgIdentity(sb: SupabaseClient, organizationId: string): Promise<OrgIdentity> {
  const { data } = await sb
    .schema('app')
    .from('organizations')
    .select(ORG_IDENTITY_COLUMNS)
    .eq('id', organizationId)
    .maybeSingle();
  return orgIdentityFromRow(data as OrgIdentityRow | null);
}
