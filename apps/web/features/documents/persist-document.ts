import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { sha256Hex } from './file-hash';

export type PersistArgs = {
  organizationId: string;
  dossierId: string | null;
  kind: string;
  title: string;
  bytes: Uint8Array;
  generationInput: unknown;
};

export async function persistGeneratedDocument(
  sb: SupabaseClient,
  args: PersistArgs,
): Promise<{ documentId: string; created: boolean }> {
  const fileHash = sha256Hex(args.bytes);

  const { data: existing } = await sb
    .schema('app')
    .from('documents')
    .select('id')
    .eq('organization_id', args.organizationId)
    .eq('file_hash', fileHash)
    .is('deleted_at', null)
    .maybeSingle();
  if (existing) {
    return { documentId: (existing as { id: string }).id, created: false };
  }

  const storagePath = `${args.organizationId}/${args.dossierId ?? 'org'}/${args.kind}/${fileHash}.pdf`;
  const { error: upErr } = await sb.storage
    .from('documents')
    .upload(storagePath, args.bytes, { contentType: 'application/pdf', upsert: true });
  if (upErr) throw new Error(`document_upload_failed: ${upErr.message}`);

  const { data: inserted, error: insErr } = await sb
    .schema('app')
    .from('documents')
    .insert({
      organization_id: args.organizationId,
      dossier_id: args.dossierId,
      kind: args.kind,
      title: args.title,
      status: 'ready',
      storage_path: storagePath,
      mime_type: 'application/pdf',
      file_size_bytes: args.bytes.byteLength,
      file_hash: fileHash,
      generated_at: new Date().toISOString(),
      generation_input: args.generationInput,
    })
    .select('id')
    .single();
  if (insErr) throw new Error(`document_insert_failed: ${insErr.message}`);

  return { documentId: (inserted as { id: string }).id, created: true };
}
