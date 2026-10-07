import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '@/shared/lib/supabase/admin';
import { membresParRole } from '@/features/trainer-space/validation-recipients';
import type { PieceJointe } from './pieces-jointes';

/**
 * Les échanges de l'espace entreprise (0218, 0221). Un fil = un client et un
 * interlocuteur : `null` pour le fil général (toute l'équipe), un membre de
 * l'équipe pour un fil direct. Écritures en service role : le référent a
 * prouvé son lien, le membre de l'équipe ses droits.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = SupabaseClient<any, any, any>;
const admin = () => supabaseAdmin() as unknown as Admin;

/** Qui l'entreprise peut joindre : la direction et la gestion. */
const ROLES_JOIGNABLES = ['owner', 'admin', 'gestionnaire'] as const;
const FONCTION: Record<string, string> = { owner: 'Direction', admin: 'Direction', gestionnaire: 'Gestion' };

export type MembreJoignable = { readonly userId: string; readonly nom: string; readonly fonction: string };

export async function equipeJoignable(organizationId: string): Promise<MembreJoignable[]> {
  const membres = await membresParRole(admin() as never, organizationId, [...ROLES_JOIGNABLES]);
  const ids = [...new Set(membres.map((m) => m.userId))];
  if (ids.length === 0) return [];
  const { data } = await admin().schema('app').from('profiles').select('user_id, full_name, email').in('user_id', ids);
  const profil = new Map(((data ?? []) as Array<{ user_id: string; full_name: string | null; email: string | null }>).map((p) => [p.user_id, p]));
  const role = new Map(membres.map((m) => [m.userId, m.role]));
  return ids
    .map((id) => ({ userId: id, nom: profil.get(id)?.full_name?.trim() || profil.get(id)?.email || 'Membre', fonction: FONCTION[role.get(id) ?? ''] ?? 'Équipe' }))
    .sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
}

export type MessageEntreprise = {
  readonly id: string;
  readonly auteur: 'entreprise' | 'organisme';
  readonly auteurNom: string;
  readonly body: string;
  readonly createdAt: string;
  readonly luLe: string | null;
  readonly auteurUserId: string | null;
  readonly interlocuteurUserId: string | null;
  readonly pieces: readonly PieceJointe[];
};

type Ligne = {
  id: string;
  auteur: 'entreprise' | 'organisme';
  auteur_nom: string;
  auteur_user_id: string | null;
  interlocuteur_user_id: string | null;
  body: string;
  created_at: string;
  lu_le: string | null;
  pieces: PieceJointe[] | null;
};
const COLONNES = 'id, auteur, auteur_nom, auteur_user_id, interlocuteur_user_id, body, created_at, lu_le, pieces';
const versMessage = (m: Ligne): MessageEntreprise => ({
  id: m.id,
  auteur: m.auteur,
  auteurNom: m.auteur_nom,
  auteurUserId: m.auteur_user_id,
  interlocuteurUserId: m.interlocuteur_user_id,
  body: m.body,
  createdAt: m.created_at,
  luLe: m.lu_le,
  pieces: m.pieces ?? [],
});

/** Tous les messages d'un client, tous fils confondus — pour SON espace, qui les voit tous. */
export async function messagesDuContact(organizationId: string, contactId: string): Promise<MessageEntreprise[]> {
  const { data, error } = await admin()
    .schema('app')
    .from('espace_entreprise_messages')
    .select(COLONNES)
    .eq('organization_id', organizationId)
    .eq('contact_id', contactId)
    .order('created_at', { ascending: true })
    .limit(500);
  if (error) throw new Error(`[espace entreprise] échanges illisibles : ${error.message}`);
  return ((data ?? []) as Ligne[]).map(versMessage);
}

/** Les messages d'un fil : général (`null`) ou direct avec ce membre. */
export async function messagesDuFil(organizationId: string, contactId: string, interlocuteur: string | null): Promise<MessageEntreprise[]> {
  let q = admin()
    .schema('app')
    .from('espace_entreprise_messages')
    .select(COLONNES)
    .eq('organization_id', organizationId)
    .eq('contact_id', contactId);
  q = interlocuteur ? q.eq('interlocuteur_user_id', interlocuteur) : q.is('interlocuteur_user_id', null);
  const { data, error } = await q.order('created_at', { ascending: true }).limit(500);
  if (error) throw new Error(`[espace entreprise] fil illisible : ${error.message}`);
  return ((data ?? []) as Ligne[]).map(versMessage);
}

export async function ecrireMessage(input: {
  organizationId: string;
  contactId: string;
  dossierId: string | null;
  auteur: 'entreprise' | 'organisme';
  auteurNom: string;
  auteurUserId?: string | null;
  interlocuteurUserId?: string | null;
  body: string;
  pieces?: readonly PieceJointe[];
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
      interlocuteur_user_id: input.interlocuteurUserId ?? null,
      body: input.body,
      pieces: input.pieces ?? [],
    });
  if (error) console.error('[espace entreprise] message non enregistré', error.message);
  return !error;
}

/** L'équipe a lu les messages du référent dans ce fil. */
export async function marquerLusParLOrganisme(organizationId: string, contactId: string, interlocuteur: string | null = null): Promise<void> {
  let q = admin()
    .schema('app')
    .from('espace_entreprise_messages')
    .update({ lu_le: new Date().toISOString() })
    .eq('organization_id', organizationId)
    .eq('contact_id', contactId)
    .eq('auteur', 'entreprise')
    .is('lu_le', null);
  q = interlocuteur ? q.eq('interlocuteur_user_id', interlocuteur) : q.is('interlocuteur_user_id', null);
  const { error } = await q;
  if (error) console.error('[espace entreprise] lecture non notée', error.message);
}

export async function contactDeLOrganisme(organizationId: string, contactId: string): Promise<boolean> {
  const { data } = await admin()
    .schema('app')
    .from('contacts')
    .select('id')
    .eq('id', contactId)
    .eq('organization_id', organizationId)
    .is('deleted_at', null)
    .maybeSingle();
  return Boolean(data);
}

/** Le référent client d'un dossier de l'organisme, s'il en a un. */
export async function referentDuDossier(organizationId: string, dossierId: string): Promise<{ contactId: string; nom: string } | null> {
  const { data } = await admin()
    .schema('app')
    .from('dossiers')
    .select('contact_id, contact:contacts(first_name, last_name)')
    .eq('id', dossierId)
    .eq('organization_id', organizationId)
    .maybeSingle();
  const d = data as { contact_id: string | null; contact: { first_name: string | null; last_name: string | null } | Array<{ first_name: string | null; last_name: string | null }> | null } | null;
  if (!d?.contact_id) return null;
  const c = Array.isArray(d.contact) ? d.contact[0] : d.contact;
  return { contactId: d.contact_id, nom: `${c?.first_name ?? ''} ${c?.last_name ?? ''}`.trim() || 'Client' };
}

/** L'adresse d'un fil dans la messagerie de l'équipe. */
export const lienDuFilClient = (contactId: string, interlocuteur: string | null): string =>
  `/messagerie?client=${contactId}${interlocuteur ? `&avec=${interlocuteur}` : ''}`;

/**
 * La cloche : toute l'équipe (direction et gestion) pour le fil général, la
 * seule personne visée pour un fil direct.
 */
export async function prevenirLEquipe(input: {
  organizationId: string;
  contactId: string;
  interlocuteurUserId: string | null;
  dossierId: string | null;
  auteurNom: string;
  entreprise: string | null;
  body: string;
}): Promise<void> {
  const destinataires = input.interlocuteurUserId
    ? [input.interlocuteurUserId]
    : (await membresParRole(admin() as never, input.organizationId, [...ROLES_JOIGNABLES])).map((m) => m.userId);
  if (destinataires.length === 0) return;
  const maintenant = new Date().toISOString();
  const { error } = await admin()
    .schema('app')
    .from('notifications')
    .insert(
      [...new Set(destinataires)].map((userId) => ({
        organization_id: input.organizationId,
        channel: 'in_app',
        template_code: 'espace_entreprise.message',
        recipient_user_id: userId,
        subject: `${input.auteurNom}${input.entreprise ? ` (${input.entreprise})` : ''} vous a écrit${input.interlocuteurUserId ? ' personnellement' : ''}`,
        payload: {
          dossier_id: input.dossierId,
          extrait: input.body.slice(0, 280),
          lien: lienDuFilClient(input.contactId, input.interlocuteurUserId),
        },
        status: 'sent',
        sent_at: maintenant,
        related_aggregate_type: input.dossierId ? 'dossier' : null,
        related_aggregate_id: input.dossierId,
      })),
    );
  if (error) console.error('[espace entreprise] équipe non prévenue', error.message);
}

/** Un message réduit à une ligne : son texte, ou le document qu'il porte. */
export const resume = (body: string, pieces: readonly PieceJointe[]): string =>
  body.trim() || (pieces[0] ? `Document : ${pieces[0].nom}` : '');

export type FilClient = {
  readonly contactId: string;
  /** `null` : fil général ; sinon le membre du fil direct (toujours « moi » ici). */
  readonly interlocuteurUserId: string | null;
  readonly nom: string;
  readonly entreprise: string | null;
  /** Le dossier dont parle le fil : le plus récent cité par ses messages. */
  readonly dossierId: string | null;
  readonly dernier: { auteurNom: string; body: string; createdAt: string };
  readonly nonLus: number;
};

/**
 * Les fils clients visibles par ce membre, le plus récent d'abord : les fils
 * généraux, et ses fils directs — jamais ceux d'un collègue.
 */
export async function filsClients(organizationId: string, moiUserId: string): Promise<FilClient[]> {
  const { data, error } = await admin()
    .schema('app')
    .from('espace_entreprise_messages')
    .select('contact_id, interlocuteur_user_id, dossier_id, auteur, auteur_nom, body, pieces, created_at, lu_le')
    .eq('organization_id', organizationId)
    .or(`interlocuteur_user_id.is.null,interlocuteur_user_id.eq.${moiUserId}`)
    .order('created_at', { ascending: false })
    .limit(2000);
  if (error) throw new Error(`[espace entreprise] fils illisibles : ${error.message}`);
  const lignes = (data ?? []) as Array<{
    contact_id: string;
    interlocuteur_user_id: string | null;
    dossier_id: string | null;
    auteur: string;
    auteur_nom: string;
    body: string;
    pieces: PieceJointe[] | null;
    created_at: string;
    lu_le: string | null;
  }>;
  const cle = (l: { contact_id: string; interlocuteur_user_id: string | null }) => `${l.contact_id}|${l.interlocuteur_user_id ?? ''}`;
  const fils = [...new Set(lignes.map(cle))];
  const ids = [...new Set(lignes.map((l) => l.contact_id))];
  if (ids.length === 0) return [];
  const { data: contacts } = await admin()
    .schema('app')
    .from('contacts')
    .select('id, first_name, last_name, company:companies(name)')
    .in('id', ids)
    .eq('organization_id', organizationId);
  const parId = new Map(
    ((contacts ?? []) as unknown as Array<{ id: string; first_name: string | null; last_name: string | null; company: { name: string | null } | Array<{ name: string | null }> | null }>).map((c) => [
      c.id,
      { nom: `${c.first_name ?? ''} ${c.last_name ?? ''}`.trim() || 'Client', entreprise: (Array.isArray(c.company) ? c.company[0]?.name : c.company?.name) ?? null },
    ]),
  );
  return fils.flatMap((k) => {
    const duFil = lignes.filter((l) => cle(l) === k);
    const d = duFil[0];
    const c = d ? parId.get(d.contact_id) : undefined;
    if (!d || !c) return [];
    return [
      {
        contactId: d.contact_id,
        interlocuteurUserId: d.interlocuteur_user_id,
        nom: c.nom,
        entreprise: c.entreprise,
        dossierId: duFil.find((l) => l.dossier_id)?.dossier_id ?? null,
        dernier: { auteurNom: d.auteur_nom, body: resume(d.body, d.pieces ?? []), createdAt: d.created_at },
        nonLus: duFil.filter((l) => l.auteur === 'entreprise' && !l.lu_le).length,
      },
    ];
  });
}
