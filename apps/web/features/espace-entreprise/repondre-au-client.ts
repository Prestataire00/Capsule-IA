import 'server-only';
import { env } from '@/env.mjs';
import { supabaseAdmin } from '@/shared/lib/supabase/admin';
import { generateEntrepriseUrl } from '@/shared/lib/entreprise-token';
import { reponseEspaceEntrepriseEmail } from '@/shared/lib/email/templates';
import { envoyerSousOrganisme } from './envoi';
import { ecrireMessage, marquerLusParLOrganisme } from './messages-store';

/**
 * L'équipe répond au référent d'un client : le message rejoint son espace,
 * un e-mail l'en prévient avec son lien. Le même geste depuis le dossier et
 * depuis la messagerie. L'appelant a vérifié les droits du membre et que le
 * contact appartient à son organisme.
 */
export async function repondreAuContact(input: {
  organizationId: string;
  contactId: string;
  dossierId: string | null;
  auteurNom: string;
  auteurUserId: string;
  /** Le fil direct où l'on répond ; null : le fil général. */
  interlocuteurUserId?: string | null;
  body: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const interlocuteur = input.interlocuteurUserId ?? null;
  const ok = await ecrireMessage({
    organizationId: input.organizationId,
    contactId: input.contactId,
    dossierId: input.dossierId,
    auteur: 'organisme',
    auteurNom: input.auteurNom,
    auteurUserId: input.auteurUserId,
    interlocuteurUserId: interlocuteur,
    body: input.body,
  });
  if (!ok) return { ok: false, error: 'Le message n’a pas été enregistré.' };
  await marquerLusParLOrganisme(input.organizationId, input.contactId, interlocuteur);

  const admin = supabaseAdmin();
  const [{ data: c }, { data: o }] = await Promise.all([
    admin.schema('app').from('contacts').select('first_name, last_name, email').eq('id', input.contactId).maybeSingle(),
    admin.schema('app').from('organizations').select('name').eq('id', input.organizationId).maybeSingle(),
  ]);
  const contact = c as { first_name: string | null; last_name: string | null; email: string | null } | null;
  if (contact?.email && env.PUBLIC_APP_URL) {
    const { url } = await generateEntrepriseUrl({ contactId: input.contactId, organizationId: input.organizationId }, env.PUBLIC_APP_URL);
    const { subject, html } = reponseEspaceEntrepriseEmail({
      prenom: contact.first_name ?? contact.last_name ?? '',
      organisme: (o as { name: string | null } | null)?.name ?? 'Votre organisme de formation',
      auteur: input.auteurNom,
      message: input.body,
      lien: `${url}?onglet=echanges${interlocuteur ? `&fil=${interlocuteur}` : ''}`,
    });
    await envoyerSousOrganisme({
      organizationId: input.organizationId,
      dossierId: input.dossierId ?? undefined,
      to: contact.email,
      subject,
      html,
      kind: 'reponse_espace_entreprise',
    });
  }
  return { ok: true };
}
