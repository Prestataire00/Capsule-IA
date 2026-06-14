import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { env } from '@/env.mjs';

export type PublicFormation = { id: string; code: string; title: string; category: string | null };

export async function getPublicCatalog(): Promise<PublicFormation[]> {
  const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: org } = await sb
    .schema('app')
    .from('organizations')
    .select('id')
    .is('deleted_at', null)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  const orgId = (org as { id: string } | null)?.id;
  if (!orgId) return [];
  const { data } = await sb
    .schema('app')
    .from('formations')
    .select('id, code, title, category')
    .eq('organization_id', orgId)
    .eq('is_published', true)
    .is('deleted_at', null)
    .order('title', { ascending: true });
  return (data ?? []) as unknown as PublicFormation[];
}
