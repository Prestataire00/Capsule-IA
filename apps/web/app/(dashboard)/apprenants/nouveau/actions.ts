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

const STATUTS = ['salarie', 'dirigeant', 'independant'] as const;

export async function createLearner(fd: FormData): Promise<void> {
  const sb = admin();
  const { data: org } = await sb.schema('app').from('organizations').select('id').limit(1).maybeSingle();
  const orgId = (org as { id?: string } | null)?.id;
  if (!orgId) redirect('/apprenants?error=no_org');

  const firstName = str(fd, 'firstName');
  const lastName = str(fd, 'lastName');
  const email = str(fd, 'email');
  if (!firstName || !lastName || !email) redirect('/apprenants/nouveau?error=missing');

  const statutRaw = str(fd, 'statut');
  const statut = statutRaw && (STATUTS as readonly string[]).includes(statutRaw) ? statutRaw : null;

  const { error } = await sb.schema('app').from('learners').insert({
    organization_id: orgId,
    first_name: firstName,
    last_name: lastName,
    email,
    phone: str(fd, 'phone'),
    birth_date: str(fd, 'birthDate'),
    company_id: str(fd, 'companyId'),
    position: str(fd, 'position'),
    statut,
    rqth: fd.get('rqth') === 'on',
    accessibility_notes: str(fd, 'accessibilityNotes'),
  });
  if (error) redirect(`/apprenants/nouveau?error=${encodeURIComponent(error.message)}`);
  redirect('/apprenants');
}
