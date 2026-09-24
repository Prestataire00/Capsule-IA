'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createClient } from '@supabase/supabase-js';
import { env } from '@/env.mjs';
import { guardAction } from '@/shared/lib/auth/guard-action';

/**
 * Modifier une fiche entreprise.
 *
 * La fiche était en lecture seule depuis toujours : on pouvait créer un client,
 * jamais corriger son SIRET, son adresse ou le nom de son responsable. Les
 * seules écritures venaient de la conversion d'une demande et de l'import d'une
 * convention, qui complètent les champs vides sans jamais rien remplacer — une
 * faute de frappe à la création restait donc définitive, et elle part ensuite
 * sur les conventions et les factures.
 *
 * Même garde et même écriture en service role que `createCompany`, avec une
 * vérification de plus : l'entreprise doit appartenir à l'organisation du
 * membre connecté. Une Server Action reçoit un identifiant du client et rien
 * d'autre.
 */

const admin = () =>
  createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

const str = (fd: FormData, k: string): string | null => {
  const v = fd.get(k);
  return typeof v === 'string' && v.trim() ? v.trim() : null;
};

export async function updateCompany(fd: FormData): Promise<void> {
  const guard = await guardAction('crm');
  if (!guard.ok) redirect(`/entreprises?error=${guard.error}`);

  const id = str(fd, 'id');
  if (!id) redirect('/entreprises');

  const name = str(fd, 'name');
  if (!name) redirect(`/entreprises/${id}?error=name`);

  const sb = admin();

  // L'entreprise est-elle bien celle de l'organisation du membre ?
  const { data: existante } = await sb
    .schema('app')
    .from('companies')
    .select('id, organization_id')
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle();
  const c = existante as { organization_id: string } | null;
  if (!c || c.organization_id !== guard.member.organizationId) {
    redirect('/entreprises?error=forbidden');
  }

  const address: Record<string, string> = {};
  const line = str(fd, 'address');
  const pc = str(fd, 'postalCode');
  const city = str(fd, 'city');
  if (line) address.line1 = line;
  if (pc) address.postal_code = pc;
  if (city) address.city = city;

  const { error } = await sb
    .schema('app')
    .from('companies')
    .update({
      name,
      legal_name: str(fd, 'legalName'),
      siret: str(fd, 'siret'),
      contact_email: str(fd, 'email'),
      contact_phone: str(fd, 'phone'),
      contact_name: str(fd, 'contactName'),
      convention_collective: str(fd, 'conventionCollective'),
      opco: str(fd, 'opco'),
      address,
      updated_at: new Date().toISOString(),
    } as never)
    .eq('id', id);
  // Le vrai message de la base plutôt qu'un « échec » qui n'apprend rien.
  if (error) redirect(`/entreprises/${id}?error=${encodeURIComponent(error.message)}`);

  revalidatePath(`/entreprises/${id}`);
  revalidatePath('/entreprises');
  redirect(`/entreprises/${id}?saved=1`);
}
