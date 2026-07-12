import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { escapeHtml } from './render-template';
import { loadOrgLogoDataUri } from '@/features/documents/load-org-branding';

type AddressJson = {
  line1?: string;
  line2?: string;
  city?: string;
  postal_code?: string;
  country?: string;
};

function composeAddress(addr: AddressJson | null | undefined): string {
  if (!addr || typeof addr !== 'object') return '';
  return [
    [addr.line1, addr.line2].filter(Boolean).join(' '),
    [addr.postal_code, addr.city].filter(Boolean).join(' '),
    addr.country,
  ]
    .filter((p) => p && p.trim().length > 0)
    .join(', ');
}

// Résout uniquement les variables liées à l'ORGANISME (pas de dossier), pour la
// génération de documents autonomes. Les slugs propres au dossier/apprenant
// restent vides.
export async function resolveOrgVariables(
  sb: SupabaseClient,
  organizationId: string,
): Promise<Record<string, string>> {
  const [{ data: orgData }, logoDataUri] = await Promise.all([
    sb
      .schema('app')
      .from('organizations')
      .select('name, siret, declaration_activite, address, contact_email, legal_name')
      .eq('id', organizationId)
      .maybeSingle(),
    loadOrgLogoDataUri(sb, organizationId),
  ]);

  const org = (orgData as {
    name: string;
    siret: string | null;
    declaration_activite: string | null;
    address: AddressJson | null;
    contact_email: string | null;
    legal_name: string | null;
  } | null) ?? null;

  const e = escapeHtml;
  const logoImg = logoDataUri
    ? `<img src="${logoDataUri}" alt="Logo" style="max-height:64px;max-width:200px;object-fit:contain;" />`
    : '';

  return {
    organisme_nom: e(org?.legal_name || org?.name || ''),
    organisme_siret: e(org?.siret ?? ''),
    organisme_nda: e(org?.declaration_activite ?? ''),
    organisme_adresse: e(composeAddress(org?.address)),
    organisme_representant: e(org?.contact_email ?? ''),
    organisme_logo: logoImg,
    date_du_jour: new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long' }).format(new Date()),
  };
}
