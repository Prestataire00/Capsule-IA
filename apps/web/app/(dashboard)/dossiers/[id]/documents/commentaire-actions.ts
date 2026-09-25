'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { createClient } from '@supabase/supabase-js';
import { env } from '@/env.mjs';
import { guardAction } from '@/shared/lib/auth/guard-action';

/**
 * Le commentaire d'un document déposé, après coup.
 *
 * Il se saisit au dépôt, mais ce qu'on a à dire d'une pièce vient souvent plus
 * tard : la page qui manque, la relance faite, la version attendue. Ne pouvoir
 * l'écrire qu'au moment du téléversement aurait obligé à redéposer le fichier
 * pour corriger une phrase.
 *
 * Le commentaire vit dans `documents.metadata`, déjà du JSONB. On relit la
 * valeur avant d'écrire plutôt que d'envoyer un objet neuf : un `update` sur
 * une colonne JSON remplace tout, et le nom d'origine du fichier comme le type
 * MIME disparaîtraient avec.
 */

const admin = () =>
  createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

export type CommentaireResult = { ok: true } | { ok: false; error: string };

const Schema = z.object({
  documentId: z.string().uuid(),
  dossierId: z.string().uuid(),
  texte: z.string().trim().max(1000, 'Commentaire : 1 000 caractères au plus.'),
});

export async function commenterDocument(brut: z.input<typeof Schema>): Promise<CommentaireResult> {
  const garde = await guardAction('dossiers');
  if (!garde.ok) return { ok: false, error: garde.error };
  const p = Schema.safeParse(brut);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? 'Saisie invalide.' };

  const sb = admin();
  const { data: doc } = await sb
    .schema('app')
    .from('documents')
    .select('id, metadata')
    .eq('id', p.data.documentId)
    .eq('dossier_id', p.data.dossierId)
    .eq('organization_id', garde.member.organizationId)
    .is('deleted_at', null)
    .maybeSingle();
  if (!doc) return { ok: false, error: 'Document introuvable.' };

  const metadata = ((doc as { metadata?: Record<string, unknown> | null }).metadata ?? {}) as Record<
    string,
    unknown
  >;
  const texte = p.data.texte;
  // Un commentaire effacé s'enlève, il ne devient pas une chaîne vide : sinon
  // l'écran afficherait un encadré sans rien dedans.
  if (texte === '') delete metadata.commentaire;
  else metadata.commentaire = texte;

  const { error } = await sb
    .schema('app')
    .from('documents')
    .update({ metadata } as never)
    .eq('id', p.data.documentId);
  if (error) {
    console.error('[document] commentaire non enregistré', p.data.documentId, error.message);
    return { ok: false, error: 'Le commentaire n’a pas pu être enregistré.' };
  }

  revalidatePath(`/dossiers/${p.data.dossierId}/documents`);
  return { ok: true };
}
