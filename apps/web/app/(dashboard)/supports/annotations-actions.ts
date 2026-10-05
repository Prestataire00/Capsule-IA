'use server';

import { revalidatePath } from 'next/cache';
import { getCurrentMember } from '@/shared/lib/auth/current-member';
import { supabaseAdmin } from '@/shared/lib/supabase/admin';
import { peutValiderPourMembre } from '@/features/trainer-space/validation-recipients';
import { peutValiderSupports } from '@/features/trainer-space/support-status';
import { annotationSchema, type AnnotationInput } from '@/features/pedagogie/annotations.schema';
import { COULEUR_LABELS, demandeModification } from '@/features/pedagogie/annotations';
import {
  ajouterAnnotation,
  annotationParId,
  contenuAnnote,
  demanderModification,
  majAnnotation,
} from '@/features/pedagogie/annotations-store';

/**
 * Annoter ce qu'un formateur a préparé : ceux qui valident (propriétaires et
 * administrateurs) marquent en couleur ce qui est à revoir. Le formateur en
 * est prévenu dans son espace.
 */

export type AnnotationResult = { ok: true } | { ok: false; error: string };

function rafraichir(cible: { sessionId: string | null; dossierId: string | null }) {
  revalidatePath('/supports');
  if (cible.sessionId) {
    revalidatePath(`/sessions/${cible.sessionId}/cours`);
    revalidatePath(`/seance/${cible.sessionId}/cours`);
    revalidatePath(`/seance/${cible.sessionId}/supports`);
  }
  if (cible.dossierId) revalidatePath(`/mes-dossiers/${cible.dossierId}/cours`);
}

export async function annoterContenu(input: AnnotationInput): Promise<AnnotationResult> {
  const p = annotationSchema.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? 'Annotation invalide.' };

  const me = await getCurrentMember();
  if (!me) return { ok: false, error: 'Votre session a expiré, reconnectez-vous.' };
  if (!(await peutValiderPourMembre(me))) {
    return { ok: false, error: 'Seuls les propriétaires et administrateurs annotent les contenus.' };
  }

  const cible = await contenuAnnote(p.data.targetKind, p.data.targetId);
  if (!cible || cible.organizationId !== me.organizationId) return { ok: false, error: 'Contenu introuvable.' };

  const ok = await ajouterAnnotation({
    ...p.data,
    organizationId: me.organizationId,
    authorUserId: me.userId,
    authorName: me.fullName,
  });
  if (!ok) return { ok: false, error: "L'annotation n'a pas été enregistrée." };
  // Un point à revoir rend le contenu « à corriger » : il repartira en validation une fois corrigé.
  if (demandeModification(p.data.couleur)) await demanderModification(p.data.targetKind, p.data.targetId);

  if (cible.auteurUserId && cible.auteurUserId !== me.userId) {
    const { error } = await supabaseAdmin()
      .schema('app')
      .from('notifications')
      .insert({
        organization_id: me.organizationId,
        channel: 'in_app',
        template_code: 'support.annotated',
        recipient_user_id: cible.auteurUserId,
        subject: `${COULEUR_LABELS[p.data.couleur]} : ${cible.title}`,
        payload: {
          title: cible.title,
          session_id: cible.sessionId,
          dossier_id: cible.dossierId,
          nature: p.data.targetKind,
          commentaire: p.data.commentaire,
        },
        status: 'sent',
        sent_at: new Date().toISOString(),
        related_aggregate_type: p.data.targetKind === 'cours' ? 'exercise' : 'session_resource',
        related_aggregate_id: p.data.targetId,
      } as never);
    if (error) console.error('[annotations] formateur non prévenu', error.message);
  }

  rafraichir(cible);
  return { ok: true };
}

export async function supprimerAnnotation(annotationId: string): Promise<AnnotationResult> {
  const me = await getCurrentMember();
  if (!me) return { ok: false, error: 'Votre session a expiré, reconnectez-vous.' };
  const a = await annotationParId(annotationId);
  if (!a || a.organizationId !== me.organizationId) return { ok: false, error: 'Annotation introuvable.' };
  // Son auteur la retire, ou la direction.
  if (a.authorUserId !== me.userId && !peutValiderSupports(me.role)) {
    return { ok: false, error: 'Seul son auteur ou la direction retire une annotation.' };
  }
  const maj = await majAnnotation(annotationId, me.organizationId, { deleted_at: new Date().toISOString() });
  if (!maj) return { ok: false, error: "L'annotation n'a pas été retirée." };
  const cible = await contenuAnnote(maj.targetKind, maj.targetId);
  if (cible) rafraichir(cible);
  return { ok: true };
}
