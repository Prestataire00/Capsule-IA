'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { getCurrentMember } from '@/shared/lib/auth/current-member';
import { can } from '@/shared/lib/auth/permissions';
import { supabaseAdmin } from '@/shared/lib/supabase/admin';

/**
 * Supprimer un document, archivé ou non (réunion avec Laurie, 16/10/2026) :
 * il disparaît pour tout le monde — équipe, espace entreprise, espace
 * apprenant. Ses demandes de signature en attente sont closes, pour que le
 * lien reçu par mail ne mène plus nulle part. Suppression logique : le
 * journal d'audit des documents garde qui l'a retiré et quand.
 */
export async function supprimerDocument(documentId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const me = await getCurrentMember();
  if (!me) return { ok: false, error: 'Votre session a expiré, reconnectez-vous.' };
  if (can(me.role, 'dossiers') !== 'manage' && can(me.role, 'qualiopi') !== 'manage') {
    return { ok: false, error: 'Votre rôle ne permet pas de supprimer un document.' };
  }
  if (!z.string().uuid().safeParse(documentId).success) return { ok: false, error: 'Document introuvable.' };

  const admin = supabaseAdmin();
  const { data } = await admin
    .schema('app')
    .from('documents')
    .select('organization_id, dossier_id')
    .eq('id', documentId)
    .is('deleted_at', null)
    .maybeSingle();
  const doc = data as { organization_id: string; dossier_id: string | null } | null;
  if (!doc || doc.organization_id !== me.organizationId) return { ok: false, error: 'Document introuvable.' };

  const maintenant = new Date().toISOString();
  const { error } = await admin
    .schema('app')
    .from('documents')
    .update({ deleted_at: maintenant, visible_entreprise: false, updated_at: maintenant } as never)
    .eq('id', documentId)
    .eq('organization_id', me.organizationId);
  if (error) {
    console.error('[document] suppression impossible', documentId, error.message);
    return { ok: false, error: 'Le document n’a pas pu être supprimé.' };
  }

  const { error: sigErr } = await admin
    .schema('app')
    .from('document_signatures')
    .update({ status: 'expired', request_expires_at: maintenant } as never)
    .eq('document_id', documentId)
    .eq('status', 'pending');
  if (sigErr) console.error('[document] demandes de signature non closes', documentId, sigErr.message);

  revalidatePath('/documents');
  if (doc.dossier_id) {
    revalidatePath(`/dossiers/${doc.dossier_id}/documents`);
    revalidatePath(`/dossiers/${doc.dossier_id}/espace-entreprise`);
  }
  return { ok: true };
}
