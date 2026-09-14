import 'server-only';
import { supabaseAdmin } from '@/shared/lib/supabase/admin';
import { type SupportStatus, isSupportStatus } from './support-status';

/**
 * Supports de cours d'une séance (0164).
 *
 * Deux natures : un fichier déposé dans le bucket privé `pedagogical`, ou un
 * lien externe. Le formateur héberge souvent ses vidéos et ses quiz ailleurs —
 * lui imposer l'upload reviendrait à lui interdire la moitié de son matériel.
 *
 * Deux verrous avant l'apprenant (0165) : le formateur propose son support, et
 * la direction le valide. L'organisme répond de ce qu'il diffuse, donc aucun
 * fichier ne sort sur la seule décision d'un intervenant extérieur.
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
  readonly validationStatus: SupportStatus;
  readonly rejectionReason: string | null;
  readonly validatedAt: string | null;
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
  validation_status: string | null;
  rejection_reason: string | null;
  validated_at: string | null;
};

const SIGNED_URL_TTL = 3600;

const SUPPORT_COLUMNS =
  'id, title, description, kind, storage_path, external_url, mime_type, file_size_bytes, is_published, created_at, validation_status, rejection_reason, validated_at';

/**
 * @param diffusablesSeulement réservé à l'espace apprenant : ni un brouillon du
 * formateur, ni un support que l'administration n'a pas encore validé.
 */
export async function loadSessionResources(
  sessionId: string,
  options: { diffusablesSeulement?: boolean } = {},
): Promise<SessionResource[]> {
  const admin = supabaseAdmin();
  let q = admin
    .schema('app')
    .from('session_resources' as never)
    .select(SUPPORT_COLUMNS)
    .eq('session_id', sessionId)
    .is('deleted_at', null)
    .order('position', { ascending: true })
    .order('created_at', { ascending: true });
  if (options.diffusablesSeulement) q = q.eq('is_published', true).eq('validation_status', 'valide');

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
    // Une valeur inconnue (migration pas encore jouée, donnée bricolée) est
    // traitée comme « à valider » : on ne diffuse jamais par défaut.
    validationStatus: isSupportStatus(r.validation_status) ? r.validation_status : 'en_attente',
    rejectionReason: r.rejection_reason,
    validatedAt: r.validated_at,
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
}): Promise<{ ok: true; resourceId: string } | { ok: false; error: string }> {
  const { data, error } = await supabaseAdmin()
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
    } as never)
    .select('id')
    .single();
  if (error || !data) return { ok: false, error: error?.message ?? 'insert_failed' };
  return { ok: true, resourceId: (data as { id: string }).id };
}

export async function addLinkResource(input: {
  organizationId: string;
  sessionId: string;
  userId: string;
  title: string;
  description?: string | null;
  url: string;
}): Promise<{ ok: true; resourceId: string } | { ok: false; error: string }> {
  const { data, error } = await supabaseAdmin()
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
    } as never)
    .select('id')
    .single();
  if (error || !data) return { ok: false, error: error?.message ?? 'insert_failed' };
  return { ok: true, resourceId: (data as { id: string }).id };
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

/** Après un refus : le formateur corrige, puis remet son support dans la file. */
export async function resubmitResource(sessionId: string, resourceId: string): Promise<boolean> {
  const { error } = await supabaseAdmin()
    .schema('app')
    .from('session_resources' as never)
    .update({
      validation_status: 'en_attente',
      rejection_reason: null,
      validated_by: null,
      validated_at: null,
      submitted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    } as never)
    .eq('id', resourceId)
    .eq('session_id', sessionId)
    .eq('validation_status', 'refuse');
  return !error;
}

// ── File de validation de l'administration ──────────────────────────────────

export type SupportAValider = SessionResource & {
  readonly sessionId: string;
  readonly sessionTitle: string | null;
  readonly sessionStartsAt: string | null;
  readonly authorName: string;
  readonly authorUserId: string | null;
  readonly submittedAt: string;
};

/**
 * Les supports en attente d'une organisation, le plus ancien dépôt d'abord :
 * un formateur bloqué la veille de sa séance est le vrai coût d'un retard.
 */
export async function loadSupportsAValider(organizationId: string): Promise<SupportAValider[]> {
  const admin = supabaseAdmin();
  const { data, error } = await admin
    .schema('app')
    .from('session_resources' as never)
    .select(`${SUPPORT_COLUMNS}, session_id, created_by, submitted_at`)
    .eq('organization_id', organizationId)
    .eq('validation_status', 'en_attente')
    .is('deleted_at', null)
    .order('submitted_at', { ascending: true })
    .limit(200);
  if (error) {
    console.error('[supports] file de validation illisible', organizationId, error.message);
    return [];
  }
  const rows = (data ?? []) as unknown as Array<Row & { session_id: string; created_by: string | null; submitted_at: string }>;
  if (rows.length === 0) return [];

  const [sessions, auteurs, liens] = await Promise.all([
    admin
      .schema('app')
      .from('sessions')
      .select('id, title, starts_at')
      .in('id', [...new Set(rows.map((r) => r.session_id))]),
    admin
      .schema('app')
      .from('profiles')
      .select('user_id, full_name')
      .in('user_id', [...new Set(rows.map((r) => r.created_by).filter((x): x is string => Boolean(x)))]),
    Promise.all(
      rows.map(async (r) => {
        if (r.kind !== 'fichier' || !r.storage_path) return r.external_url;
        const { data: s } = await admin.storage.from(SUPPORT_BUCKET).createSignedUrl(r.storage_path, SIGNED_URL_TTL);
        return s?.signedUrl ?? null;
      }),
    ),
  ]);

  const seances = new Map(
    ((sessions.data ?? []) as Array<{ id: string; title: string | null; starts_at: string }>).map((s) => [s.id, s]),
  );
  const noms = new Map(
    ((auteurs.data ?? []) as Array<{ user_id: string; full_name: string | null }>).map((p) => [p.user_id, p.full_name]),
  );

  return rows.map((r, i) => {
    const seance = seances.get(r.session_id) ?? null;
    return {
      id: r.id,
      title: r.title,
      description: r.description,
      kind: r.kind,
      url: liens[i] ?? null,
      mimeType: r.mime_type,
      fileSizeBytes: r.file_size_bytes === null ? null : Number(r.file_size_bytes),
      isPublished: r.is_published,
      createdAt: r.created_at,
      validationStatus: 'en_attente' as const,
      rejectionReason: r.rejection_reason,
      validatedAt: r.validated_at,
      sessionId: r.session_id,
      sessionTitle: seance?.title ?? null,
      sessionStartsAt: seance?.starts_at ?? null,
      authorName: (r.created_by ? noms.get(r.created_by) : null) ?? 'Formateur',
      authorUserId: r.created_by,
      submittedAt: r.submitted_at,
    };
  });
}

export async function countSupportsAValider(organizationId: string): Promise<number> {
  const { count, error } = await supabaseAdmin()
    .schema('app')
    .from('session_resources' as never)
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', organizationId)
    .eq('validation_status', 'en_attente')
    .is('deleted_at', null);
  return error ? 0 : (count ?? 0);
}

export type SupportDecide = {
  readonly id: string;
  readonly sessionId: string;
  readonly title: string;
  readonly authorUserId: string | null;
};

/**
 * Valide ou refuse un support. L'organisation est dans le filtre, pas seulement
 * dans la garde de l'appelant : une Server Action reçoit un identifiant du
 * client, jamais une preuve d'appartenance.
 */
export async function decideSupport(input: {
  organizationId: string;
  resourceId: string;
  decision: 'valide' | 'refuse';
  reviewerUserId: string;
  reason?: string | null;
}): Promise<SupportDecide | null> {
  const { data, error } = await supabaseAdmin()
    .schema('app')
    .from('session_resources' as never)
    .update({
      validation_status: input.decision,
      validated_by: input.reviewerUserId,
      validated_at: new Date().toISOString(),
      rejection_reason: input.decision === 'refuse' ? (input.reason ?? null) : null,
      updated_at: new Date().toISOString(),
    } as never)
    .eq('id', input.resourceId)
    .eq('organization_id', input.organizationId)
    .eq('validation_status', 'en_attente')
    .is('deleted_at', null)
    .select('id, session_id, title, created_by')
    .maybeSingle();
  if (error || !data) {
    if (error) console.error('[supports] décision non enregistrée', input.resourceId, error.message);
    return null;
  }
  const r = data as unknown as { id: string; session_id: string; title: string; created_by: string | null };
  return { id: r.id, sessionId: r.session_id, title: r.title, authorUserId: r.created_by };
}
