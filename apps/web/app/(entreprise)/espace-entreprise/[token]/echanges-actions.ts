'use server';

import { revalidatePath } from 'next/cache';
import { supabaseAdmin } from '@/shared/lib/supabase/admin';
import { verifyEntrepriseToken } from '@/shared/lib/entreprise-token';
import { messageEntrepriseSchema } from '@/features/espace-entreprise/message.schema';
import { ecrireMessage, prevenirLEquipe } from '@/features/espace-entreprise/messages-store';

/** Le référent écrit à l'organisme depuis son espace. Son lien est sa seule preuve. */
export async function envoyerMessageEntreprise(token: string, input: { body: string }): Promise<{ ok: true } | { ok: false; error: string }> {
  const p = messageEntrepriseSchema.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? 'Message invalide.' };
  const lien = await verifyEntrepriseToken(token);
  if (!lien.ok) return { ok: false, error: 'Ce lien n’est plus valable. Demandez-en un nouveau à votre organisme.' };
  const { contactId, organizationId } = lien.value;

  const admin = supabaseAdmin();
  const [{ data: c }, { data: d }] = await Promise.all([
    admin.schema('app').from('contacts').select('first_name, last_name, company:companies(name)').eq('id', contactId).eq('organization_id', organizationId).maybeSingle(),
    admin
      .schema('app')
      .from('dossiers')
      .select('id')
      .eq('organization_id', organizationId)
      .eq('contact_id' as never, contactId as never)
      .is('deleted_at', null)
      .order('start_date', { ascending: false })
      .limit(1),
  ]);
  const contact = c as unknown as { first_name: string | null; last_name: string | null; company: { name: string | null } | Array<{ name: string | null }> | null } | null;
  if (!contact) return { ok: false, error: 'Ce lien n’est plus valable.' };
  const auteurNom = `${contact.first_name ?? ''} ${contact.last_name ?? ''}`.trim() || 'Votre client';
  const entreprise = Array.isArray(contact.company) ? (contact.company[0]?.name ?? null) : (contact.company?.name ?? null);
  const dossierId = ((d ?? []) as Array<{ id: string }>)[0]?.id ?? null;

  const ok = await ecrireMessage({ organizationId, contactId, dossierId, auteur: 'entreprise', auteurNom, body: p.data.body });
  if (!ok) return { ok: false, error: 'Le message n’est pas parti. Réessayez.' };
  await prevenirLEquipe({ organizationId, dossierId, auteurNom, entreprise, body: p.data.body });
  revalidatePath(`/espace-entreprise/${token}`);
  return { ok: true };
}
