import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

export type OrgBranding = {
  representativeName: string | null;
  representativeTitle: string | null;
  signaturePng: Uint8Array | null;
  stampPng: Uint8Array | null;
  logoPng: Uint8Array | null;
};

async function downloadPng(sb: SupabaseClient, path: string | null): Promise<Uint8Array | null> {
  if (!path) return null;
  const { data, error } = await sb.storage.from('org_assets').download(path);
  if (error || !data) return null;
  return new Uint8Array(await data.arrayBuffer());
}

// Charge le logo de l'organisme sous forme de data URI base64, prêt à être
// injecté dans un <img> HTML (documents générés IA/modèles). Renvoie '' si absent.
export async function loadOrgLogoDataUri(
  sb: SupabaseClient,
  organizationId: string,
): Promise<string> {
  const { data } = await sb
    .schema('app')
    .from('organizations')
    .select('logo_path')
    .eq('id', organizationId)
    .maybeSingle();
  const path = (data as { logo_path?: string | null } | null)?.logo_path ?? null;
  const bytes = await downloadPng(sb, path);
  if (!bytes) return '';
  const base64 = Buffer.from(bytes).toString('base64');
  return `data:image/png;base64,${base64}`;
}

export async function loadOrgBranding(
  sb: SupabaseClient,
  organizationId: string,
): Promise<OrgBranding> {
  const { data } = await sb
    .schema('app')
    .from('organizations')
    .select('representative_name, representative_title, signature_path, stamp_path, logo_path')
    .eq('id', organizationId)
    .maybeSingle();
  const row = (data ?? {}) as {
    representative_name?: string | null;
    representative_title?: string | null;
    signature_path?: string | null;
    stamp_path?: string | null;
    logo_path?: string | null;
  };
  const [signaturePng, stampPng, logoPng] = await Promise.all([
    downloadPng(sb, row.signature_path ?? null),
    downloadPng(sb, row.stamp_path ?? null),
    downloadPng(sb, row.logo_path ?? null),
  ]);
  return {
    representativeName: row.representative_name ?? null,
    representativeTitle: row.representative_title ?? null,
    signaturePng,
    stampPng,
    logoPng,
  };
}
