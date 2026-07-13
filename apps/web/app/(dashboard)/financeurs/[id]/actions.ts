'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireAccess } from '@/shared/lib/auth/require-access';
import { supabaseServer } from '@/shared/lib/supabase/server';

const FUNDER_KINDS = [
  'opco',
  'cpf',
  'pole_emploi',
  'region',
  'autofinancement',
  'entreprise',
  'autre',
] as const;

const str = (fd: FormData, k: string) => {
  const v = fd.get(k);
  return typeof v === 'string' && v.trim() ? v.trim() : null;
};

/** Édite un financeur (staff de l'org via RLS `funders_update`). */
export async function updateFunder(fd: FormData): Promise<void> {
  await requireAccess('catalogue', 'manage');

  const id = str(fd, 'id');
  if (!id) redirect('/financeurs');

  const name = str(fd, 'name');
  if (!name) redirect(`/financeurs/${id}?error=missing`);

  const kinds = fd
    .getAll('kind')
    .map(String)
    .filter((k): k is (typeof FUNDER_KINDS)[number] =>
      (FUNDER_KINDS as readonly string[]).includes(k),
    );
  if (kinds.length === 0) redirect(`/financeurs/${id}?error=no_kind`);

  const sb = supabaseServer();
  const { error } = await sb
    .schema('app')
    .from('funders')
    .update({
      name,
      kind: kinds[0], // type principal (rétro-compat)
      kinds,
      contact_email: str(fd, 'email'),
      contact_phone: str(fd, 'phone'),
      external_id: str(fd, 'externalId'),
    } as never)
    .eq('id', id)
    .is('deleted_at', null);
  if (error) redirect(`/financeurs/${id}?error=${encodeURIComponent(error.message)}`);

  revalidatePath(`/financeurs/${id}`);
  revalidatePath('/financeurs');
  redirect(`/financeurs/${id}?saved=1`);
}

/** Archive un financeur (soft-delete) — refusé s'il est rattaché à des dossiers. */
export async function deleteFunder(fd: FormData): Promise<void> {
  await requireAccess('catalogue', 'manage');

  const id = str(fd, 'id');
  if (!id) redirect('/financeurs');

  const sb = supabaseServer();
  const { count } = await sb
    .schema('app')
    .from('dossier_funders')
    .select('id', { count: 'exact', head: true })
    .eq('funder_id', id);
  if ((count ?? 0) > 0) redirect(`/financeurs/${id}?error=has_dossiers`);

  const { error } = await sb
    .schema('app')
    .from('funders')
    .update({ deleted_at: new Date().toISOString() } as never)
    .eq('id', id)
    .is('deleted_at', null);
  if (error) redirect(`/financeurs/${id}?error=${encodeURIComponent(error.message)}`);

  revalidatePath('/financeurs');
  redirect('/financeurs');
}
