'use server';

import { env } from '@/env.mjs';
import { guardRowAction } from '@/shared/lib/auth/guard-action';
import { supabaseAdmin } from '@/shared/lib/supabase/admin';
import { generateEntrepriseUrl } from '@/shared/lib/entreprise-token';
import { espaceEntrepriseEmail, reponseEspaceEntrepriseEmail } from '@/shared/lib/email/templates';
import { revalidatePath } from 'next/cache';
import { getCurrentMember } from '@/shared/lib/auth/current-member';
import { messageEntrepriseSchema } from '@/features/espace-entreprise/message.schema';
import { ecrireMessage, marquerLusParLOrganisme } from '@/features/espace-entreprise/messages-store';
import { envoyerSousOrganisme } from '@/features/espace-entreprise/envoi';
import { attacherReferent } from '@/features/espace-entreprise/referent-dossier';

/**
 * L'espace entreprise du référent d'un dossier : générer son lien, le lui
 * envoyer, ou le couper. Le lien vaut pour le contact — il y retrouve tous
 * les dossiers dont il est le référent.
 */

export type EspaceResult = { ok: true; url?: string } | { ok: false; error: string };

async function referentDuDossier(dossierId: string): Promise<
  { ok: true; organizationId: string; contactId: string; prenom: string; email: string | null } | { ok: false; error: string }
> {
  const guard = await guardRowAction('dossiers', dossierId, 'dossiers');
  if (!guard.ok) return { ok: false, error: 'Votre rôle ne permet pas de gérer ce dossier.' };
  const admin = supabaseAdmin();
  // Sans référent désigné, celui du client (fiche entreprise) devient le référent du dossier.
  const contactId = await attacherReferent(admin as never, dossierId);
  const { data } = await admin.schema('app').from('dossiers').select('organization_id, contact_id').eq('id', dossierId).maybeSingle();
  const d = data as { organization_id: string; contact_id: string | null } | null;
  if (!d || !contactId || !d.contact_id) {
    return { ok: false, error: 'Ce client n’a pas de contact référent : renseignez son responsable sur la fiche entreprise, ou désignez un référent sur le dossier.' };
  }
  const { data: c } = await admin
    .schema('app')
    .from('contacts')
    .select('first_name, last_name, email')
    .eq('id', d.contact_id)
    .is('deleted_at', null)
    .maybeSingle();
  const contact = c as { first_name: string | null; last_name: string | null; email: string | null } | null;
  if (!contact) return { ok: false, error: 'Le référent de ce dossier n’existe plus : désignez-en un autre.' };
  return {
    ok: true,
    organizationId: d.organization_id,
    contactId: d.contact_id,
    prenom: contact.first_name ?? contact.last_name ?? '',
    email: contact.email,
  };
}

export async function genererLienEntreprise(dossierId: string): Promise<EspaceResult> {
  const r = await referentDuDossier(dossierId);
  if (!r.ok) return r;
  if (!env.PUBLIC_APP_URL) return { ok: false, error: 'L’adresse publique de la plateforme n’est pas configurée.' };
  const { url } = await generateEntrepriseUrl({ contactId: r.contactId, organizationId: r.organizationId }, env.PUBLIC_APP_URL);
  return { ok: true, url };
}

export async function envoyerLienEntreprise(dossierId: string): Promise<EspaceResult> {
  const r = await referentDuDossier(dossierId);
  if (!r.ok) return r;
  if (!r.email) return { ok: false, error: 'Le référent n’a pas d’adresse e-mail : ajoutez-la sur sa fiche.' };
  if (!env.PUBLIC_APP_URL) return { ok: false, error: 'L’adresse publique de la plateforme n’est pas configurée.' };
  const { url } = await generateEntrepriseUrl({ contactId: r.contactId, organizationId: r.organizationId }, env.PUBLIC_APP_URL);
  const { data: o } = await supabaseAdmin().schema('app').from('organizations').select('name').eq('id', r.organizationId).maybeSingle();
  const { subject, html } = espaceEntrepriseEmail({
    prenom: r.prenom,
    organisme: (o as { name: string | null } | null)?.name ?? 'Votre organisme de formation',
    lien: url,
  });
  const envoi = await envoyerSousOrganisme({
    organizationId: r.organizationId,
    dossierId,
    to: r.email,
    subject,
    html,
    kind: 'espace_entreprise',
  });
  return envoi ? { ok: true, url } : { ok: false, error: 'L’e-mail n’est pas parti. Copiez le lien et envoyez-le vous-même.' };
}

export async function couperLiensEntreprise(dossierId: string): Promise<EspaceResult> {
  const r = await referentDuDossier(dossierId);
  if (!r.ok) return r;
  const { error } = await supabaseAdmin()
    .schema('app')
    .from('contacts')
    .update({ espace_revoked_at: new Date().toISOString() } as never)
    .eq('id', r.contactId);
  return error ? { ok: false, error: 'Les liens n’ont pas été coupés.' } : { ok: true };
}

/** L'équipe répond au référent : le message rejoint son espace, et un e-mail l'en prévient. */
export async function repondreAuReferent(dossierId: string, input: { body: string }): Promise<EspaceResult> {
  const p = messageEntrepriseSchema.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? 'Message invalide.' };
  const r = await referentDuDossier(dossierId);
  if (!r.ok) return r;
  const me = await getCurrentMember();
  if (!me) return { ok: false, error: 'Votre session a expiré.' };
  const ok = await ecrireMessage({
    organizationId: r.organizationId,
    contactId: r.contactId,
    dossierId,
    auteur: 'organisme',
    auteurNom: me.fullName,
    auteurUserId: me.userId,
    body: p.data.body,
  });
  if (!ok) return { ok: false, error: 'Le message n’a pas été enregistré.' };
  await marquerLusParLOrganisme(r.organizationId, r.contactId);
  if (r.email && env.PUBLIC_APP_URL) {
    const { url } = await generateEntrepriseUrl({ contactId: r.contactId, organizationId: r.organizationId }, env.PUBLIC_APP_URL);
    const { data: o } = await supabaseAdmin().schema('app').from('organizations').select('name').eq('id', r.organizationId).maybeSingle();
    const { subject, html } = reponseEspaceEntrepriseEmail({
      prenom: r.prenom,
      organisme: (o as { name: string | null } | null)?.name ?? 'Votre organisme de formation',
      auteur: me.fullName,
      message: p.data.body,
      lien: `${url}?onglet=echanges`,
    });
    await envoyerSousOrganisme({ organizationId: r.organizationId, dossierId, to: r.email, subject, html, kind: 'reponse_espace_entreprise' });
  }
  revalidatePath(`/dossiers/${dossierId}/espace-entreprise`);
  return { ok: true };
}
