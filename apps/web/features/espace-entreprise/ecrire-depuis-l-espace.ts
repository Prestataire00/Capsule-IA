import 'server-only';
import { supabaseAdmin } from '@/shared/lib/supabase/admin';
import { ecrireMessage, equipeJoignable, prevenirLEquipe, resume } from './messages-store';
import type { PieceJointe } from './pieces-jointes';

/**
 * Le référent écrit à l'organisme depuis son espace, avec ou sans document.
 * L'appelant a vérifié son lien : `contactId` et `organizationId` en viennent.
 */
export async function ecrireDepuisLEspace(input: {
  contactId: string;
  organizationId: string;
  body: string;
  interlocuteur: string | null;
  pieces?: readonly PieceJointe[];
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const { contactId, organizationId } = input;
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

  // Un fil direct : seulement avec un membre joignable de CET organisme.
  const interlocuteurUserId = input.interlocuteur;
  if (interlocuteurUserId && !(await equipeJoignable(organizationId)).some((m) => m.userId === interlocuteurUserId)) {
    return { ok: false, error: 'Cette personne ne fait pas partie de l’équipe.' };
  }
  const pieces = input.pieces ?? [];
  const ok = await ecrireMessage({ organizationId, contactId, dossierId, auteur: 'entreprise', auteurNom, interlocuteurUserId, body: input.body, pieces });
  if (!ok) return { ok: false, error: 'Le message n’est pas parti. Réessayez.' };
  await prevenirLEquipe({ organizationId, contactId, interlocuteurUserId, dossierId, auteurNom, entreprise, body: resume(input.body, pieces) });
  return { ok: true };
}
