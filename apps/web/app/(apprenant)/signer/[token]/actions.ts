'use server';

import { headers } from 'next/headers';
import { createHash } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { env } from '@/env.mjs';
import { verifySignatureToken } from '@/shared/lib/signature-token';

const PNG_DATAURL_PREFIX = 'data:image/png;base64,';
const MAX_PNG_BYTES = 512 * 1024;

const adminClient = () =>
  createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

export type RecordSignatureInput = {
  readonly token: string;
  readonly dataUrl: string;
};

export type RecordSignatureResult =
  | { ok: true; signatureId: string; hash: string; signedAt: string }
  | { ok: false; error: string };

export const recordSignature = async (
  input: RecordSignatureInput,
): Promise<RecordSignatureResult> => {
  const verified = await verifySignatureToken(input.token);
  if (!verified.ok) {
    return { ok: false, error: verified.error };
  }
  const { attendanceSheetId, signerId, signerKind, jti } = verified.value;

  if (!input.dataUrl.startsWith(PNG_DATAURL_PREFIX)) {
    return { ok: false, error: 'invalid_image_format' };
  }
  const b64 = input.dataUrl.slice(PNG_DATAURL_PREFIX.length);
  const buffer = Buffer.from(b64, 'base64');
  if (buffer.length === 0) return { ok: false, error: 'empty_image' };
  if (buffer.length > MAX_PNG_BYTES) return { ok: false, error: 'image_too_large' };

  const h = await headers();
  const cfIp = h.get('cf-connecting-ip');
  const xff = h.get('x-forwarded-for')?.split(',')[0]?.trim();
  const xreal = h.get('x-real-ip');
  const ip = cfIp || xff || xreal || '0.0.0.0';
  const userAgent = h.get('user-agent') ?? 'unknown';
  const cfCountry = h.get('cf-ipcountry');
  const country =
    cfCountry && cfCountry !== 'XX' && cfCountry.length === 2 ? cfCountry.toUpperCase() : null;
  const signedAt = new Date().toISOString();

  const signatureHash = createHash('sha256')
    .update(buffer)
    .update('|')
    .update(ip)
    .update('|')
    .update(userAgent)
    .update('|')
    .update(signedAt)
    .update('|')
    .update(jti)
    .digest('hex');

  const sb = adminClient();
  const path = `${attendanceSheetId}/${signerKind}/${signerId}.png`;

  const upload = await sb.storage.from('signatures').upload(path, buffer, {
    contentType: 'image/png',
    upsert: true,
  });
  if (upload.error) {
    return { ok: false, error: `storage_upload_failed: ${upload.error.message}` };
  }

  const { data, error } = await sb.schema('app').rpc('record_attendance_signature' as never, {
    p_attendance_sheet_id: attendanceSheetId,
    p_signer_id: signerId,
    p_signer_kind: signerKind,
    p_image_path: path,
    p_signature_hash: signatureHash,
    p_signer_ip: ip,
    p_signer_user_agent: userAgent,
    p_signer_country: country,
    p_token_jti: jti,
    p_evidence_source: 'qr',
    p_evidence_payload: null,
  } as never);

  if (error) {
    return { ok: false, error: `rpc_failed: ${error.message}` };
  }

  return {
    ok: true,
    signatureId: data as unknown as string,
    hash: signatureHash,
    signedAt,
  };
};
