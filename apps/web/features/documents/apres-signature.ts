import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { notifyOrgStaffOfSignature } from '@/shared/lib/notifications/notify-staff';

/**
 * Un signataire vient de signer : l'équipe est prévenue (notification et
 * e-mail), quel que soit le document. Jamais bloquant pour le signataire :
 * la signature est déjà enregistrée, un échec est seulement journalisé.
 */
export async function apresSignature(sb: SupabaseClient, documentId: string, signataire: string | null): Promise<void> {
  try {
    const { data } = await sb
      .schema('app')
      .from('documents')
      .select('id, organization_id, title, dossier_id')
      .eq('id', documentId)
      .maybeSingle();
    const doc = data as { id: string; organization_id: string; title: string | null; dossier_id: string | null } | null;
    if (!doc) return;
    await notifyOrgStaffOfSignature({
      organizationId: doc.organization_id,
      documentId: doc.id,
      titre: doc.title ?? 'Document',
      signataire,
      dossierId: doc.dossier_id,
    });
  } catch (e) {
    console.error('[signature] notification impossible', documentId, e);
  }
}
