'use server';

import { revalidatePath } from 'next/cache';
import { getCurrentMember } from '@/shared/lib/auth/current-member';
import { can } from '@/shared/lib/auth/permissions';
import { supabaseAdmin } from '@/shared/lib/supabase/admin';

/**
 * Interne ou visible dans l'espace entreprise du référent (0207). Un
 * document sans dossier n'a pas d'entreprise à qui se montrer.
 */
export async function changerVisibiliteDocument(input: {
  documentId: string;
  visible: boolean;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const me = await getCurrentMember();
  if (!me) return { ok: false, error: 'Votre session a expiré, reconnectez-vous.' };
  if (can(me.role, 'dossiers') !== 'manage' && can(me.role, 'qualiopi') !== 'manage') {
    return { ok: false, error: 'Votre rôle ne permet pas de modifier ce document.' };
  }

  const admin = supabaseAdmin();
  const { data } = await admin
    .schema('app')
    .from('documents')
    .select('organization_id, dossier_id, storage_path, content_html')
    .eq('id', input.documentId)
    .is('deleted_at', null)
    .maybeSingle();
  const doc = data as { organization_id: string; dossier_id: string | null; storage_path: string | null; content_html: string | null } | null;
  if (!doc || doc.organization_id !== me.organizationId) return { ok: false, error: 'Document introuvable.' };
  if (input.visible && !doc.dossier_id) return { ok: false, error: 'Rattachez-le d’abord à un dossier.' };
  if (input.visible && !doc.storage_path && !doc.content_html) {
    return { ok: false, error: 'Ouvrez-le une fois pour l’enregistrer, puis rendez-le visible.' };
  }

  const { error } = await admin
    .schema('app')
    .from('documents')
    .update({ visible_entreprise: input.visible } as never)
    .eq('id', input.documentId);
  if (error) return { ok: false, error: 'Le changement n’a pas été enregistré.' };

  revalidatePath('/documents');
  if (doc.dossier_id) {
    revalidatePath(`/dossiers/${doc.dossier_id}/documents`);
    revalidatePath(`/dossiers/${doc.dossier_id}/espace-entreprise`);
  }
  return { ok: true };
}
