'use server';

import { redirect } from 'next/navigation';
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

export async function createCompany(fd: FormData): Promise<void> {
  const sb = admin();
  const { data: org } = await sb.schema('app').from('organizations').select('id').limit(1).maybeSingle();
  const orgId = (org as { id?: string } | null)?.id;
  if (!orgId) redirect('/entreprises?error=no_org');

  const name = str(fd, 'name');
  if (!name) redirect('/entreprises/nouvelle?error=name');

  const address: Record<string, string> = {};
  const line = str(fd, 'address');
  const pc = str(fd, 'postalCode');
  const city = str(fd, 'city');
  if (line) address.line1 = line;
  if (pc) address.postal_code = pc;
  if (city) address.city = city;

  const { error } = await sb.schema('app').from('companies').insert({
    organization_id: orgId,
    name,
    legal_name: str(fd, 'legalName'),
    siret: str(fd, 'siret'),
    contact_email: str(fd, 'email'),
    contact_phone: str(fd, 'phone'),
    contact_name: str(fd, 'contactName'),
    convention_collective: str(fd, 'conventionCollective'),
    opco: str(fd, 'opco'),
    address,
  });
  if (error) redirect(`/entreprises/nouvelle?error=${encodeURIComponent(error.message)}`);
  redirect('/entreprises');
}
