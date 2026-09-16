'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { getCurrentMember } from '@/shared/lib/auth/current-member';
import { peutValiderSupports } from '@/features/trainer-space/support-status';
import { notifySupportDecide } from '@/features/trainer-space/support-notifications';
import { decideCours } from '@/features/pedagogie/validation';

/**
 * Décision de la direction sur un contenu pédagogique (quiz, texte à trou,
 * cartes, vidéo, exercice). Même garde et même règle de rôle que les supports :
 * l'organisme répond de ce qu'il diffuse, la décision revient à la direction.
 */

const schema = z.object({
  exerciseId: z.string().uuid(),
  decision: z.enum(['valide', 'refuse']),
  reason: z.string().trim().max(1000).optional(),
});

export type DecisionCoursResult = { ok: true } | { ok: false; error: string };

export async function deciderCours(input: {
  exerciseId: string;
  decision: 'valide' | 'refuse';
  reason?: string;
}): Promise<DecisionCoursResult> {
  const p = schema.safeParse(input);
  if (!p.success) return { ok: false, error: 'Décision invalide.' };

  const me = await getCurrentMember();
  if (!me) return { ok: false, error: 'Votre session a expiré, reconnectez-vous.' };
  if (!peutValiderSupports(me.role)) {
    return { ok: false, error: 'Seuls le propriétaire et les administrateurs valident les contenus.' };
  }
  if (p.data.decision === 'refuse' && !p.data.reason) {
    return { ok: false, error: 'Indiquez le motif du refus : le formateur doit savoir quoi corriger.' };
  }

  const decide = await decideCours({
    organizationId: me.organizationId,
    exerciseId: p.data.exerciseId,
    decision: p.data.decision,
    reviewerUserId: me.userId,
    reason: p.data.reason ?? null,
  });
  if (!decide) return { ok: false, error: 'Ce contenu a déjà été traité, ou il ne vous appartient pas.' };

  await notifySupportDecide({
    organizationId: me.organizationId,
    trainerUserId: decide.authorUserId,
    resourceId: decide.id,
    sessionId: decide.dossierId,
    title: decide.title,
    decision: p.data.decision,
    reason: p.data.reason ?? null,
  });

  revalidatePath('/supports');
  revalidatePath(`/mes-dossiers/${decide.dossierId}/cours`);
  return { ok: true };
}
