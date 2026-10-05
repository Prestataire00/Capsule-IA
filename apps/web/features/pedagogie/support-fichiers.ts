import 'server-only';
import { supabaseAdmin } from '@/shared/lib/supabase/admin';

/** Ce qu'il faut d'un support pour le convertir ou y joindre une version annotée. */
export type SupportFichier = {
  readonly id: string;
  readonly organizationId: string;
  readonly sessionId: string;
  readonly title: string;
  readonly kind: 'fichier' | 'lien';
  readonly storagePath: string | null;
  readonly mimeType: string | null;
  readonly wordPath: string | null;
  readonly annotatedPath: string | null;
  readonly createdBy: string | null;
};

export async function supportFichier(id: string): Promise<SupportFichier | null> {
  const { data } = await supabaseAdmin()
    .schema('app')
    .from('session_resources' as never)
    .select('id, organization_id, session_id, title, kind, storage_path, mime_type, word_path, annotated_path, created_by')
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle();
  const r = data as unknown as {
    id: string;
    organization_id: string;
    session_id: string;
    title: string;
    kind: 'fichier' | 'lien';
    storage_path: string | null;
    mime_type: string | null;
    word_path: string | null;
    annotated_path: string | null;
    created_by: string | null;
  } | null;
  return r
    ? {
        id: r.id,
        organizationId: r.organization_id,
        sessionId: r.session_id,
        title: r.title,
        kind: r.kind,
        storagePath: r.storage_path,
        mimeType: r.mime_type,
        wordPath: r.word_path,
        annotatedPath: r.annotated_path,
        createdBy: r.created_by,
      }
    : null;
}

export const estPdf = (s: Pick<SupportFichier, 'kind' | 'mimeType' | 'storagePath'>): boolean =>
  s.kind === 'fichier' &&
  (s.mimeType === 'application/pdf' || (s.storagePath ?? '').toLowerCase().endsWith('.pdf'));

/** Nom de fichier sûr pour un en-tête Content-Disposition. */
export const nomDeFichier = (titre: string, extension: string): string =>
  `${titre.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w.-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 80) || 'support'}.${extension}`;
