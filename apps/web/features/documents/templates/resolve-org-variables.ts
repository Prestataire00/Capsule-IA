import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { escapeHtml } from './render-template';
import { loadOrgAssetDataUris } from '@/features/documents/load-org-branding';

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
  // Même raison que resolveDossierVariables : le client de contexte porte le
  // type `Database` généré, incompatible avec le défaut de `SupabaseClient`.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sb: SupabaseClient<any, any, any>,
  organizationId: string,
): Promise<Record<string, string>> {
  const [{ data: orgData }, assets] = await Promise.all([
    sb
      .schema('app')
      .from('organizations')
      .select('name, siret, declaration_activite, certifications, address, contact_email, contact_phone, legal_name, representative_name, representative_title')
      .eq('id', organizationId)
      .maybeSingle(),
    loadOrgAssetDataUris(sb, organizationId),
  ]);

  const org = (orgData as {
    name: string;
    siret: string | null;
    declaration_activite: string | null;
    certifications: string | null;
    address: AddressJson | null;
    contact_email: string | null;
    contact_phone: string | null;
    legal_name: string | null;
    representative_name: string | null;
    representative_title: string | null;
  } | null) ?? null;

  const e = escapeHtml;
  const logoImg = assets.logo
    ? `<img src="${assets.logo}" alt="Logo" style="max-height:64px;max-width:200px;object-fit:contain;" />`
    : '';
  const cachetImg = assets.stamp
    ? `<img src="${assets.stamp}" alt="Cachet de l'organisme" style="max-height:96px;max-width:200px;object-fit:contain;" />`
    : '';
  const signatureImg = assets.signature
    ? `<img src="${assets.signature}" alt="Signature" style="max-height:72px;max-width:200px;object-fit:contain;" />`
    : '';

  return {
    organisme_nom: e(org?.legal_name || org?.name || ''),
    organisme_siret: e(org?.siret ?? ''),
    organisme_nda: e(org?.declaration_activite ?? ''),
    organisme_agrements: e(org?.certifications ?? ''),
    organisme_adresse: e(composeAddress(org?.address)),
    organisme_representant: e(org?.representative_name || org?.contact_email || ''),
    organisme_representant_qualite: e(org?.representative_title ?? ''),
    organisme_email: e(org?.contact_email ?? ''),
    organisme_telephone: e(org?.contact_phone ?? ''),
    organisme_logo: logoImg,
    organisme_cachet: cachetImg,
    organisme_signature: signatureImg,
    date_du_jour: new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long' }).format(new Date()),
  };
}
