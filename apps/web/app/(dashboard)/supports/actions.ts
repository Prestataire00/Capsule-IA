'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { getCurrentMember } from '@/shared/lib/auth/current-member';
import { decideSupport } from '@/features/trainer-space/session-resources';
import { notifySupportDecide } from '@/features/trainer-space/support-notifications';
import { peutValiderSupports } from '@/features/trainer-space/support-status';

/**
 * Décision de l'administration sur un support déposé par un formateur.
 *
 * Deux gardes, pas une : le rôle (propriétaire ou administrateur) et
 * l'organisation, vérifiée dans la requête elle-même — une Server Action reçoit
 * un identifiant du client, jamais une preuve d'appartenance.
 */

const schema = z.object({
  resourceId: z.string().uuid(),
  decision: z.enum(['valide', 'refuse']),
  reason: z.string().trim().max(1000).optional(),
});

export type DecisionResult = { ok: true } | { ok: false; error: string };

export async function decideSupportValidation(input: {
  resourceId: string;
  decision: 'valide' | 'refuse';
  reason?: string;
}): Promise<DecisionResult> {
  const p = schema.safeParse(input);
  if (!p.success) return { ok: false, error: 'Décision invalide.' };

  const me = await getCurrentMember();
  if (!me) return { ok: false, error: 'Votre session a expiré, reconnectez-vous.' };
  if (!peutValiderSupports(me.role)) {
    return { ok: false, error: 'Seuls le propriétaire et les administrateurs valident les supports.' };
  }
  // Un refus sans motif laisse le formateur sans rien à corriger.
  if (p.data.decision === 'refuse' && !p.data.reason) {
    return { ok: false, error: 'Indiquez le motif du refus : le formateur doit savoir quoi corriger.' };
  }

  const decide = await decideSupport({
    organizationId: me.organizationId,
    resourceId: p.data.resourceId,
    decision: p.data.decision,
    reviewerUserId: me.userId,
    reason: p.data.reason ?? null,
  });
  if (!decide) return { ok: false, error: 'Ce support a déjà été traité, ou il ne vous appartient pas.' };

  await notifySupportDecide({
    organizationId: me.organizationId,
    trainerUserId: decide.authorUserId,
    resourceId: decide.id,
    sessionId: decide.sessionId,
    title: decide.title,
    decision: p.data.decision,
    reason: p.data.reason ?? null,
  });

  revalidatePath('/supports');
  revalidatePath(`/sessions/${decide.sessionId}/messages`);
  return { ok: true };
}
