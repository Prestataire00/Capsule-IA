'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createClient } from '@supabase/supabase-js';
import { env } from '@/env.mjs';

const admin = () =>
  createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

const str = (fd: FormData, k: string) => {
  const v = fd.get(k);
  return typeof v === 'string' && v.trim() ? v.trim() : null;
};

const FUNDER_KINDS = [
  'opco',
  'cpf',
  'pole_emploi',
  'region',
  'autofinancement',
  'entreprise',
  'autre',
] as const;

export async function createFunder(fd: FormData): Promise<void> {
  const sb = admin();
  const { data: org } = await sb
    .schema('app')
    .from('organizations')
    .select('id')
    .limit(1)
    .maybeSingle();
  const orgId = (org as { id?: string } | null)?.id;
  if (!orgId) redirect('/financeurs?error=no_org');

  const name = str(fd, 'name');
  if (!name) redirect('/financeurs/nouveau?error=missing');

  // Multi-types : cases à cocher partageant le name "kind".
  const kinds = fd
    .getAll('kind')
    .map(String)
    .filter((k): k is (typeof FUNDER_KINDS)[number] =>
      (FUNDER_KINDS as readonly string[]).includes(k),
    );
  if (kinds.length === 0) redirect('/financeurs/nouveau?error=no_kind');

  const { error } = await sb.schema('app').from('funders').insert({
    organization_id: orgId,
    name,
    kind: kinds[0], // type principal (rétro-compat)
    kinds,
    contact_email: str(fd, 'email'),
    external_id: str(fd, 'externalId'),
  });
  if (error) redirect(`/financeurs/nouveau?error=${encodeURIComponent(error.message)}`);

  revalidatePath('/financeurs');
  redirect('/financeurs');
}
