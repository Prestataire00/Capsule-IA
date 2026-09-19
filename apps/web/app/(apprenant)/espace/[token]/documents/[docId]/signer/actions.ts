'use server';

import { createHash } from 'crypto';
import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { verifyApprenantToken } from '@/shared/lib/apprenant-token';
import { supabaseAdmin } from '@/shared/lib/supabase/admin';
import { SIGNABLE_DOCUMENT_KINDS } from './signable';

export type SignDocumentResult =
  | { ok: true; signedAt: string }
  | { ok: false; error: string };

const MAX_PNG_BYTES = 512 * 1024;

export async function signDocument(input: {
  token: string;
  docId: string;
  dataUrl: string;
}): Promise<SignDocumentResult> {
  const verified = await verifyApprenantToken(input.token);
  if (!verified.ok) return { ok: false, error: 'unauthenticated' };
  const { learnerId, organizationId, dossierId } = verified.value;

  const match = /^data:image\/png;base64,(.+)$/.exec(input.dataUrl);
  const base64 = match?.[1];
  if (!base64) return { ok: false, error: 'invalid_format' };
  const buffer = Buffer.from(base64, 'base64');
  if (buffer.length === 0 || buffer.length > MAX_PNG_BYTES) return { ok: false, error: 'invalid_size' };

  const admin = supabaseAdmin();

  // Charge le document + vérifie qu'il appartient bien au dossier de l'apprenant.
  const { data: doc } = await admin
    .schema('app')
    .from('documents')
    .select('id, dossier_id, kind, file_hash')
    .eq('id', input.docId)
    .is('deleted_at', null)
    .maybeSingle();
  const document = doc as { dossier_id: string; kind: string; file_hash: string | null } | null;
  if (!document || document.dossier_id !== dossierId) return { ok: false, error: 'not_found' };
  if (!SIGNABLE_DOCUMENT_KINDS.has(document.kind)) return { ok: false, error: 'not_signable' };

  // Idempotence : déjà signé par cet apprenant ?
  const { data: existing } = await admin
    .schema('app')
    .from('document_signatures')
    .select('id, status')
    .eq('document_id', input.docId)
    .eq('signer_learner_id', learnerId)
    .maybeSingle();
  const existingRow = existing as { id: string; status: string } | null;
  if (existingRow?.status === 'signed') return { ok: true, signedAt: new Date().toISOString() };

  const h = headers();
  const ip = h.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null;
  const ua = h.get('user-agent') ?? null;
  const signedAt = new Date().toISOString();
  const hash = createHash('sha256')
    .update(Buffer.concat([buffer, Buffer.from(`${ip ?? ''}|${ua ?? ''}|${signedAt}`)]))
    .digest('hex');

  const imagePath = `documents/${input.docId}/learner/${learnerId}.png`;
  const { error: uploadErr } = await admin.storage
    .from('signatures')
    .upload(imagePath, buffer, { contentType: 'image/png', upsert: true });
  if (uploadErr) return { ok: false, error: 'upload_failed' };

  const payload = {
    status: 'signed' as const,
    signed_at: signedAt,
    signer_ip: ip,
    signer_user_agent: ua,
    signature_image_path: imagePath,
    document_hash_at_signature: document.file_hash,
    // Preuve d'intégrité (0183) : elle était calculée puis jetée, faute de
    // colonne pour la recevoir. Toute retouche de l'image, de l'adresse, du
    // navigateur ou de l'horodatage la fait diverger.
    signature_hash: hash,
  };

  if (existingRow) {
    const { error } = await admin
      .schema('app')
      .from('document_signatures')
      // `signature_hash` vient de la 0183, absente des types générés.
      .update(payload as never)
      .eq('id', existingRow.id);
    if (error) return { ok: false, error: 'db_update_failed' };
  } else {
    const { error } = await admin
      .schema('app')
      .from('document_signatures')
      .insert({
        organization_id: organizationId,
        document_id: input.docId,
        signer_kind: 'learner',
        signer_learner_id: learnerId,
        ...payload,
      } as never);
    if (error) return { ok: false, error: 'db_insert_failed' };
  }

  revalidatePath(`/espace/${input.token}/documents`);
  return { ok: true, signedAt };
}
