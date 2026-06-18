'use server';

import { createHash } from 'node:crypto';
import { headers } from 'next/headers';
import { supabaseAdmin } from '@/shared/lib/supabase/admin';
import { verifyDocumentSignatureToken } from '@/shared/lib/document-signature-token';

export type SignResult = { ok: true } | { ok: false; error: string };

const MAX_PNG_BYTES = 512 * 1024;

export async function submitDocumentSignature(input: {
  token: string;
  dataUrl: string;
}): Promise<SignResult> {
  const verified = await verifyDocumentSignatureToken(input.token);
  if (!verified.ok) {
    return { ok: false, error: verified.error === 'expired_token' ? 'expired' : 'invalid' };
  }
  const { signatureId, documentId } = verified.value;

  const match = /^data:image\/png;base64,(.+)$/.exec(input.dataUrl);
  if (!match) return { ok: false, error: 'invalid_format' };
  const buffer = Buffer.from(match[1], 'base64');
  if (buffer.length === 0 || buffer.length > MAX_PNG_BYTES) return { ok: false, error: 'invalid_size' };

  const admin = supabaseAdmin();

  const { data: sigRow } = await admin
    .schema('app')
    .from('document_signatures')
    .select('id, status, request_token_hash, request_expires_at, document_id')
    .eq('id', signatureId)
    .maybeSingle();
  const sig = sigRow as {
    id: string;
    status: string;
    request_token_hash: string | null;
    request_expires_at: string | null;
    document_id: string;
  } | null;
  if (!sig || sig.document_id !== documentId) return { ok: false, error: 'not_found' };
  if (sig.status === 'signed') return { ok: true };
  if (sig.status !== 'pending') return { ok: false, error: 'invalid' };

  // Anti-rejeu : le hash du token présenté doit correspondre à celui enregistré.
  const tokenHash = createHash('sha256').update(input.token).digest('hex');
  if (!sig.request_token_hash || sig.request_token_hash !== tokenHash) {
    return { ok: false, error: 'invalid' };
  }
  if (sig.request_expires_at && new Date(sig.request_expires_at).getTime() < Date.now()) {
    await admin
      .schema('app')
      .from('document_signatures')
      .update({ status: 'expired' } as never)
      .eq('id', signatureId);
    return { ok: false, error: 'expired' };
  }

  const { data: docRow } = await admin
    .schema('app')
    .from('documents')
    .select('file_hash')
    .eq('id', documentId)
    .maybeSingle();
  const fileHash = (docRow as { file_hash: string | null } | null)?.file_hash ?? null;

  const h = headers();
  const ip = h.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null;
  const ua = h.get('user-agent') ?? null;
  const signedAt = new Date().toISOString();

  const imagePath = `documents/${documentId}/sig/${signatureId}.png`;
  const { error: upErr } = await admin.storage
    .from('signatures')
    .upload(imagePath, buffer, { contentType: 'image/png', upsert: true });
  if (upErr) return { ok: false, error: 'upload_failed' };

  const { error: updErr } = await admin
    .schema('app')
    .from('document_signatures')
    .update({
      status: 'signed',
      signed_at: signedAt,
      signer_ip: ip,
      signer_user_agent: ua,
      signature_image_path: imagePath,
      document_hash_at_signature: fileHash,
    } as never)
    .eq('id', signatureId);
  if (updErr) return { ok: false, error: 'db_update_failed' };

  return { ok: true };
}
