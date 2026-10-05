'use server';

import { revalidatePath } from 'next/cache';
import { requireMyTrainerSession } from '@/features/trainer-space/guard';
import { requireMyTrainerDossier } from '@/features/trainer-space/my-dossiers';
import { annotationParId, contenuAnnote, majAnnotation } from '@/features/pedagogie/annotations-store';

/**
 * Le formateur marque une annotation corrigée (ou la rouvre). Il ne la
 * supprime pas : elle reste la trace de la relecture.
 */
export async function marquerAnnotationCorrigee(input: {
  annotationId: string;
  corrigee: boolean;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const a = await annotationParId(input.annotationId);
  if (!a) return { ok: false, error: 'Annotation introuvable.' };
  const cible = await contenuAnnote(a.targetKind, a.targetId);
  if (!cible || cible.organizationId !== a.organizationId) return { ok: false, error: 'Annotation introuvable.' };

  const acces = cible.sessionId
    ? await requireMyTrainerSession(cible.sessionId)
    : cible.dossierId
      ? await requireMyTrainerDossier(cible.dossierId)
      : { ok: false as const };
  if (!acces.ok) return { ok: false, error: 'Ce contenu ne vous est pas confié.' };

  const maj = await majAnnotation(input.annotationId, a.organizationId, {
    resolved_at: input.corrigee ? new Date().toISOString() : null,
  });
  if (!maj) return { ok: false, error: "La correction n'a pas été enregistrée." };

  if (cible.sessionId) {
    revalidatePath(`/seance/${cible.sessionId}/cours`);
    revalidatePath(`/seance/${cible.sessionId}/supports`);
    revalidatePath(`/sessions/${cible.sessionId}/cours`);
  }
  if (cible.dossierId) revalidatePath(`/mes-dossiers/${cible.dossierId}/cours`);
  revalidatePath('/supports');
  return { ok: true };
}
