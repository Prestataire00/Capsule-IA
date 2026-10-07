import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '@/shared/lib/supabase/admin';
import { membresParRole } from '@/features/trainer-space/validation-recipients';

/**
 * Les échanges de l'espace entreprise (0218). Écritures en service role : le
 * référent a prouvé son lien, le membre de l'équipe ses droits sur le dossier.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = SupabaseClient<any, any, any>;
const admin = () => supabaseAdmin() as unknown as Admin;

export type MessageEntreprise = {
  readonly id: string;
  readonly auteur: 'entreprise' | 'organisme';
  readonly auteurNom: string;
  readonly body: string;
  readonly createdAt: string;
  readonly luLe: string | null;
};

export async function messagesDuContact(organizationId: string, contactId: string): Promise<MessageEntreprise[]> {
  const { data, error } = await admin()
    .schema('app')
    .from('espace_entreprise_messages')
    .select('id, auteur, auteur_nom, body, created_at, lu_le')
    .eq('organization_id', organizationId)
    .eq('contact_id', contactId)
    .order('created_at', { ascending: true })
    .limit(300);
  if (error) throw new Error(`[espace entreprise] échanges illisibles : ${error.message}`);
  return ((data ?? []) as Array<{ id: string; auteur: 'entreprise' | 'organisme'; auteur_nom: string; body: string; created_at: string; lu_le: string | null }>).map(
    (m) => ({ id: m.id, auteur: m.auteur, auteurNom: m.auteur_nom, body: m.body, createdAt: m.created_at, luLe: m.lu_le }),
  );
}

export async function ecrireMessage(input: {
  organizationId: string;
  contactId: string;
  dossierId: string | null;
  auteur: 'entreprise' | 'organisme';
  auteurNom: string;
  auteurUserId?: string | null;
  body: string;
}): Promise<boolean> {
  const { error } = await admin()
    .schema('app')
    .from('espace_entreprise_messages')
    .insert({
      organization_id: input.organizationId,
      contact_id: input.contactId,
      dossier_id: input.dossierId,
      auteur: input.auteur,
      auteur_nom: input.auteurNom,
      auteur_user_id: input.auteurUserId ?? null,
      body: input.body,
    });
  if (error) console.error('[espace entreprise] message non enregistré', error.message);
  return !error;
}

/** L'équipe a lu les messages du référent. */
export async function marquerLusParLOrganisme(organizationId: string, contactId: string): Promise<void> {
  const { error } = await admin()
    .schema('app')
    .from('espace_entreprise_messages')
    .update({ lu_le: new Date().toISOString() })
    .eq('organization_id', organizationId)
    .eq('contact_id', contactId)
    .eq('auteur', 'entreprise')
    .is('lu_le', null);
  if (error) console.error('[espace entreprise] lecture non notée', error.message);
}

/** La cloche de l'équipe (direction et gestion) : un client a écrit. */
export async function prevenirLEquipe(input: {
  organizationId: string;
  dossierId: string | null;
  auteurNom: string;
  entreprise: string | null;
  body: string;
}): Promise<void> {
  const membres = await membresParRole(admin() as never, input.organizationId, ['owner', 'admin', 'gestionnaire']);
  if (membres.length === 0) return;
  const maintenant = new Date().toISOString();
  const { error } = await admin()
    .schema('app')
    .from('notifications')
    .insert(
      membres.map((m) => ({
        organization_id: input.organizationId,
        channel: 'in_app',
        template_code: 'espace_entreprise.message',
        recipient_user_id: m.userId,
        subject: `${input.auteurNom}${input.entreprise ? ` (${input.entreprise})` : ''} vous a écrit`,
        payload: {
          dossier_id: input.dossierId,
          extrait: input.body.slice(0, 280),
          lien: input.dossierId ? `/dossiers/${input.dossierId}/espace-entreprise` : null,
        },
        status: 'sent',
        sent_at: maintenant,
        related_aggregate_type: input.dossierId ? 'dossier' : null,
        related_aggregate_id: input.dossierId,
      })),
    );
  if (error) console.error('[espace entreprise] équipe non prévenue', error.message);
}
