import 'server-only';
import { supabaseAdmin } from '@/shared/lib/supabase/admin';
import { estCouleur, MOTIF_MODIFICATIONS, pointsOuverts, type Couleur } from './annotations';
import type { AnnotationInput } from './annotations.schema';

/**
 * Lecture et écriture des annotations (0204), en service role : chaque
 * appelant a vérifié avant qui il est et ce qu'il annote.
 */

export type Annotation = {
  readonly id: string;
  readonly targetKind: 'support' | 'cours';
  readonly targetId: string;
  readonly questionId: string | null;
  readonly extrait: string | null;
  readonly couleur: Couleur;
  readonly commentaire: string;
  readonly authorUserId: string | null;
  readonly authorName: string;
  readonly resolvedAt: string | null;
  readonly createdAt: string;
};

type Row = {
  id: string;
  target_kind: 'support' | 'cours';
  target_id: string;
  question_id: string | null;
  extrait: string | null;
  couleur: string;
  commentaire: string;
  author_user_id: string | null;
  author_name: string;
  resolved_at: string | null;
  created_at: string;
};

/** Annotations des contenus donnés, regroupées par contenu. */
export async function loadAnnotations(
  targetKind: 'support' | 'cours',
  targetIds: readonly string[],
): Promise<Map<string, Annotation[]>> {
  const parContenu = new Map<string, Annotation[]>();
  if (targetIds.length === 0) return parContenu;
  const { data, error } = await supabaseAdmin()
    .schema('app')
    .from('content_annotations' as never)
    .select('id, target_kind, target_id, question_id, extrait, couleur, commentaire, author_user_id, author_name, resolved_at, created_at')
    .eq('target_kind', targetKind)
    .in('target_id', [...targetIds])
    .is('deleted_at', null)
    .order('created_at', { ascending: true });
  if (error) throw new Error(`[annotations] lecture impossible : ${error.message}`);
  for (const r of (data ?? []) as unknown as Row[]) {
    if (!estCouleur(r.couleur)) continue;
    const a: Annotation = {
      id: r.id,
      targetKind: r.target_kind,
      targetId: r.target_id,
      questionId: r.question_id,
      extrait: r.extrait,
      couleur: r.couleur,
      commentaire: r.commentaire,
      authorUserId: r.author_user_id,
      authorName: r.author_name,
      resolvedAt: r.resolved_at,
      createdAt: r.created_at,
    };
    parContenu.set(r.target_id, [...(parContenu.get(r.target_id) ?? []), a]);
  }
  return parContenu;
}

/** Le contenu annoté : son organisme, son auteur, et où le formateur le retrouve. */
export async function contenuAnnote(
  targetKind: 'support' | 'cours',
  targetId: string,
): Promise<{ organizationId: string; auteurUserId: string | null; title: string; sessionId: string | null; dossierId: string | null } | null> {
  const admin = supabaseAdmin();
  if (targetKind === 'support') {
    const { data } = await admin
      .schema('app')
      .from('session_resources' as never)
      .select('organization_id, created_by, title, session_id')
      .eq('id', targetId)
      .maybeSingle();
    const r = data as unknown as { organization_id: string; created_by: string | null; title: string; session_id: string } | null;
    return r ? { organizationId: r.organization_id, auteurUserId: r.created_by, title: r.title, sessionId: r.session_id, dossierId: null } : null;
  }
  const { data } = await admin
    .schema('app')
    .from('exercises' as never)
    .select('organization_id, created_by, title, session_id, dossier_id')
    .eq('id', targetId)
    .maybeSingle();
  const r = data as unknown as {
    organization_id: string;
    created_by: string | null;
    title: string;
    session_id: string | null;
    dossier_id: string | null;
  } | null;
  return r
    ? { organizationId: r.organization_id, auteurUserId: r.created_by, title: r.title, sessionId: r.session_id, dossierId: r.dossier_id }
    : null;
}

export async function ajouterAnnotation(
  input: AnnotationInput & { organizationId: string; authorUserId: string; authorName: string },
): Promise<boolean> {
  const { error } = await supabaseAdmin()
    .schema('app')
    .from('content_annotations' as never)
    .insert({
      organization_id: input.organizationId,
      target_kind: input.targetKind,
      target_id: input.targetId,
      question_id: input.questionId || null,
      extrait: input.extrait || null,
      couleur: input.couleur,
      commentaire: input.commentaire,
      author_user_id: input.authorUserId,
      author_name: input.authorName,
    } as never);
  if (error) console.error('[annotations] ajout refusé', input.targetId, error.message);
  return !error;
}

export async function majAnnotation(
  annotationId: string,
  organizationId: string,
  patch: { resolved_at?: string | null; deleted_at?: string },
): Promise<{ targetKind: 'support' | 'cours'; targetId: string } | null> {
  const { data, error } = await supabaseAdmin()
    .schema('app')
    .from('content_annotations' as never)
    .update(patch as never)
    .eq('id', annotationId)
    .eq('organization_id', organizationId)
    .is('deleted_at', null)
    .select('target_kind, target_id')
    .maybeSingle();
  if (error) console.error('[annotations] mise à jour refusée', annotationId, error.message);
  const r = data as unknown as { target_kind: 'support' | 'cours'; target_id: string } | null;
  return r ? { targetKind: r.target_kind, targetId: r.target_id } : null;
}

export async function annotationParId(
  annotationId: string,
): Promise<{ organizationId: string; targetKind: 'support' | 'cours'; targetId: string; authorUserId: string | null } | null> {
  const { data } = await supabaseAdmin()
    .schema('app')
    .from('content_annotations' as never)
    .select('organization_id, target_kind, target_id, author_user_id')
    .eq('id', annotationId)
    .is('deleted_at', null)
    .maybeSingle();
  const r = data as unknown as {
    organization_id: string;
    target_kind: 'support' | 'cours';
    target_id: string;
    author_user_id: string | null;
  } | null;
  return r
    ? { organizationId: r.organization_id, targetKind: r.target_kind, targetId: r.target_id, authorUserId: r.author_user_id }
    : null;
}

/** Points à corriger encore ouverts sur un contenu. */
export async function pointsOuvertsDe(targetKind: 'support' | 'cours', targetId: string): Promise<number> {
  const annotations = (await loadAnnotations(targetKind, [targetId])).get(targetId) ?? [];
  return pointsOuverts(annotations);
}

/**
 * Une modification est demandée : le contenu n'est plus validé ni en attente,
 * il est « à corriger » — retiré aux stagiaires s'il l'était, jusqu'à ce que
 * le formateur corrige et le renvoie en validation.
 */
export async function demanderModification(targetKind: 'support' | 'cours', targetId: string): Promise<void> {
  const table = targetKind === 'support' ? 'session_resources' : 'exercises';
  const { error } = await supabaseAdmin()
    .schema('app')
    .from(table as never)
    .update({
      validation_status: 'refuse',
      rejection_reason: MOTIF_MODIFICATIONS,
      validated_at: null,
      updated_at: new Date().toISOString(),
    } as never)
    .eq('id', targetId)
    .neq('validation_status', 'refuse');
  if (error) console.error('[annotations] contenu non repassé à corriger', targetId, error.message);
}
