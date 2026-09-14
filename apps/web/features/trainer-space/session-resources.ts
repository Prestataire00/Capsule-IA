import 'server-only';
import { supabaseAdmin } from '@/shared/lib/supabase/admin';

/**
 * Supports de cours d'une séance (0164).
 *
 * Deux natures : un fichier déposé dans le bucket privé `pedagogical`, ou un
 * lien externe. Le formateur héberge souvent ses vidéos et ses quiz ailleurs —
 * lui imposer l'upload reviendrait à lui interdire la moitié de son matériel.
 *
 * Un support non publié est un brouillon : il reste invisible dans l'espace
 * apprenant tant que le formateur ne l'a pas ouvert.
 */

export const SUPPORT_BUCKET = 'pedagogical';
export const SUPPORT_MAX_BYTES = 50 * 1024 * 1024;

export const SUPPORT_MIME_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'image/png',
  'image/jpeg',
] as const;

export type SessionResource = {
  readonly id: string;
  readonly title: string;
  readonly description: string | null;
  readonly kind: 'fichier' | 'lien';
  readonly url: string | null;
  readonly mimeType: string | null;
  readonly fileSizeBytes: number | null;
  readonly isPublished: boolean;
  readonly createdAt: string;
};

type Row = {
  id: string;
  title: string;
  description: string | null;
  kind: 'fichier' | 'lien';
  storage_path: string | null;
  external_url: string | null;
  mime_type: string | null;
  file_size_bytes: number | string | null;
  is_published: boolean;
  created_at: string;
};

const SIGNED_URL_TTL = 3600;

/**
 * @param publishedOnly réservé à l'espace apprenant : un brouillon du formateur
 * n'a pas à fuiter côté élève.
 */
export async function loadSessionResources(
  sessionId: string,
  options: { publishedOnly?: boolean } = {},
): Promise<SessionResource[]> {
  const admin = supabaseAdmin();
  let q = admin
    .schema('app')
    .from('session_resources' as never)
    .select('id, title, description, kind, storage_path, external_url, mime_type, file_size_bytes, is_published, created_at')
    .eq('session_id', sessionId)
    .is('deleted_at', null)
    .order('position', { ascending: true })
    .order('created_at', { ascending: true });
  if (options.publishedOnly) q = q.eq('is_published', true);

  const { data, error } = await q;
  if (error) {
    console.error('[supports] lecture impossible', sessionId, error.message);
    return [];
  }
  const rows = (data ?? []) as unknown as Row[];

  // Une URL signée par fichier : le bucket est privé, et les liens de partage
  // ne doivent pas survivre à la session de travail.
  const signed = await Promise.all(
    rows.map(async (r) => {
      if (r.kind !== 'fichier' || !r.storage_path) return r.external_url;
      const { data: s } = await admin.storage.from(SUPPORT_BUCKET).createSignedUrl(r.storage_path, SIGNED_URL_TTL);
      return s?.signedUrl ?? null;
    }),
  );

  return rows.map((r, i) => ({
    id: r.id,
    title: r.title,
    description: r.description,
    kind: r.kind,
    url: signed[i] ?? null,
    mimeType: r.mime_type,
    fileSizeBytes: r.file_size_bytes === null ? null : Number(r.file_size_bytes),
    isPublished: r.is_published,
    createdAt: r.created_at,
  }));
}

export async function addFileResource(input: {
  organizationId: string;
  sessionId: string;
  userId: string;
  title: string;
  description?: string | null;
  storagePath: string;
  mimeType: string;
  fileSizeBytes: number;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await supabaseAdmin()
    .schema('app')
    .from('session_resources' as never)
    .insert({
      organization_id: input.organizationId,
      session_id: input.sessionId,
      title: input.title,
      description: input.description ?? null,
      kind: 'fichier',
      storage_path: input.storagePath,
      mime_type: input.mimeType,
      file_size_bytes: input.fileSizeBytes,
      created_by: input.userId,
    } as never);
  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function addLinkResource(input: {
  organizationId: string;
  sessionId: string;
  userId: string;
  title: string;
  description?: string | null;
  url: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await supabaseAdmin()
    .schema('app')
    .from('session_resources' as never)
    .insert({
      organization_id: input.organizationId,
      session_id: input.sessionId,
      title: input.title,
      description: input.description ?? null,
      kind: 'lien',
      external_url: input.url,
      created_by: input.userId,
    } as never);
  return error ? { ok: false, error: error.message } : { ok: true };
}

/** Les mises à jour restent bornées à la séance : un identifiant seul ne suffit pas. */
export async function setResourcePublished(sessionId: string, resourceId: string, isPublished: boolean): Promise<boolean> {
  const { error } = await supabaseAdmin()
    .schema('app')
    .from('session_resources' as never)
    .update({ is_published: isPublished, updated_at: new Date().toISOString() } as never)
    .eq('id', resourceId)
    .eq('session_id', sessionId);
  return !error;
}

export async function deleteResource(sessionId: string, resourceId: string): Promise<boolean> {
  const { error } = await supabaseAdmin()
    .schema('app')
    .from('session_resources' as never)
    .update({ deleted_at: new Date().toISOString() } as never)
    .eq('id', resourceId)
    .eq('session_id', sessionId);
  return !error;
}
