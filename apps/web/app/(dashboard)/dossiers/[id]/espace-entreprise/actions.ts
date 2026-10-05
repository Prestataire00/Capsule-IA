'use server';

import { env } from '@/env.mjs';
import { guardRowAction } from '@/shared/lib/auth/guard-action';
import { supabaseAdmin } from '@/shared/lib/supabase/admin';
import { generateEntrepriseUrl } from '@/shared/lib/entreprise-token';
import { espaceEntrepriseEmail } from '@/shared/lib/email/templates';
import { envoyerSousOrganisme } from '@/features/espace-entreprise/envoi';

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
  const { data } = await admin.schema('app').from('dossiers').select('organization_id, contact_id').eq('id', dossierId).maybeSingle();
  const d = data as { organization_id: string; contact_id: string | null } | null;
  if (!d?.contact_id) return { ok: false, error: 'Désignez d’abord le référent du client sur la fiche du dossier.' };
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
