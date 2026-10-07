import 'server-only';
import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '@/shared/lib/supabase/admin';
import { PROOF_MAX_BYTES, PROOF_MIME_TYPES } from '@/features/qualiopi/status';

/**
 * Les documents joints aux échanges de l'espace entreprise (0222). Rangés dans
 * le bucket privé `documents` ; on ne les lit que par une URL signée, après
 * que l'appelant a prouvé qu'il voit le fil.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = SupabaseClient<any, any, any>;
const admin = () => supabaseAdmin() as unknown as Admin;

const BUCKET = 'documents';

export type PieceJointe = { readonly path: string; readonly nom: string; readonly mime: string; readonly taille: number };

export type ErreurPiece = 'fichier_vide' | 'trop_lourd' | 'type_refuse' | 'depot_impossible';

export const MESSAGE_ERREUR_PIECE: Record<ErreurPiece, string> = {
  fichier_vide: 'Le fichier est vide.',
  trop_lourd: 'Le fichier dépasse 20 Mo.',
  type_refuse: 'Format accepté : PDF, image, Word, Excel, PowerPoint ou texte.',
  depot_impossible: 'Le document n’a pas pu être déposé. Réessayez.',
};

export async function deposerPiece(
  organizationId: string,
  contactId: string,
  fichier: File,
): Promise<{ ok: true; value: PieceJointe } | { ok: false; error: ErreurPiece }> {
  if (fichier.size === 0) return { ok: false, error: 'fichier_vide' };
  if (fichier.size > PROOF_MAX_BYTES) return { ok: false, error: 'trop_lourd' };
  if (!(PROOF_MIME_TYPES as readonly string[]).includes(fichier.type)) return { ok: false, error: 'type_refuse' };
  const ext = fichier.name.includes('.') ? (fichier.name.split('.').pop() ?? 'bin').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 8) : 'bin';
  const path = `echanges/${organizationId}/${contactId}/${randomUUID()}.${ext || 'bin'}`;
  const { error } = await admin()
    .storage.from(BUCKET)
    .upload(path, new Uint8Array(await fichier.arrayBuffer()), { contentType: fichier.type, upsert: false });
  if (error) {
    console.error('[espace entreprise] pièce non déposée', error.message);
    return { ok: false, error: 'depot_impossible' };
  }
  return { ok: true, value: { path, nom: fichier.name.slice(0, 200), mime: fichier.type, taille: fichier.size } };
}

/** Le fichier retiré quand le message qui le porte n'a pas été enregistré. */
export async function retirerPiece(piece: PieceJointe): Promise<void> {
  const { error } = await admin().storage.from(BUCKET).remove([piece.path]);
  if (error) console.error('[espace entreprise] pièce orpheline', piece.path, error.message);
}

type LignePieces = { contact_id: string; organization_id: string; interlocuteur_user_id: string | null; pieces: PieceJointe[] | null };

async function ligne(messageId: string): Promise<LignePieces | null> {
  const { data } = await admin()
    .schema('app')
    .from('espace_entreprise_messages')
    .select('contact_id, organization_id, interlocuteur_user_id, pieces')
    .eq('id', messageId)
    .maybeSingle();
  return (data as LignePieces | null) ?? null;
}

async function urlSignee(piece: PieceJointe): Promise<string | null> {
  const { data, error } = await admin().storage.from(BUCKET).createSignedUrl(piece.path, 300, { download: piece.nom });
  if (error) console.error('[espace entreprise] lien de pièce impossible', error.message);
  return data?.signedUrl ?? null;
}

/** Côté référent : tout fil de SON contact. */
export async function pieceDuReferent(messageId: string, index: number, acces: { contactId: string; organizationId: string }): Promise<string | null> {
  const m = await ligne(messageId);
  if (!m || m.contact_id !== acces.contactId || m.organization_id !== acces.organizationId) return null;
  const piece = (m.pieces ?? [])[index];
  return piece ? urlSignee(piece) : null;
}

/** Côté équipe : le fil général, ou un fil direct qui vous est adressé. */
export async function pieceDeLEquipe(messageId: string, index: number, acces: { userId: string; organizationId: string }): Promise<string | null> {
  const m = await ligne(messageId);
  if (!m || m.organization_id !== acces.organizationId) return null;
  if (m.interlocuteur_user_id && m.interlocuteur_user_id !== acces.userId) return null;
  const piece = (m.pieces ?? [])[index];
  return piece ? urlSignee(piece) : null;
}

/** Ce que l'écran montre d'une pièce : jamais son chemin de stockage. */
export type PieceAffichee = { readonly nom: string; readonly taille: number; readonly lien: string };

export const piecesAffichees = (messageId: string, pieces: readonly PieceJointe[], base: string): PieceAffichee[] =>
  pieces.map((p, i) => ({ nom: p.nom, taille: p.taille, lien: `${base}/${messageId}?i=${i}` }));
