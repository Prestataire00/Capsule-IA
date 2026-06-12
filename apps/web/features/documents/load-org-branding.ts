import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

export type OrgBranding = {
  representativeName: string | null;
  representativeTitle: string | null;
  signaturePng: Uint8Array | null;
  stampPng: Uint8Array | null;
};

async function downloadPng(sb: SupabaseClient, path: string | null): Promise<Uint8Array | null> {
  if (!path) return null;
  const { data, error } = await sb.storage.from('org_assets').download(path);
  if (error || !data) return null;
  return new Uint8Array(await data.arrayBuffer());
}

export async function loadOrgBranding(
  sb: SupabaseClient,
  organizationId: string,
): Promise<OrgBranding> {
  const { data } = await sb
    .schema('app')
    .from('organizations')
    .select('representative_name, representative_title, signature_path, stamp_path')
    .eq('id', organizationId)
    .maybeSingle();
  const row = (data ?? {}) as {
    representative_name?: string | null;
    representative_title?: string | null;
    signature_path?: string | null;
    stamp_path?: string | null;
  };
  return {
    representativeName: row.representative_name ?? null,
    representativeTitle: row.representative_title ?? null,
    signaturePng: await downloadPng(sb, row.signature_path ?? null),
    stampPng: await downloadPng(sb, row.stamp_path ?? null),
  };
}
