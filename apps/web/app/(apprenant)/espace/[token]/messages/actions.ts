'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { postSessionMessage, MESSAGE_MAX_LENGTH } from '@/features/trainer-space/session-messages';
import { resolveAccesApprenant } from '../_sessions';

/**
 * L'apprenant répond depuis son espace. Il n'a pas de compte : son jeton fait
 * foi, et la séance doit figurer parmi les siennes — sinon un identifiant
 * deviné suffirait à écrire dans la formation d'un autre.
 */

const schema = z.object({
  token: z.string().min(10),
  sessionId: z.string().uuid(),
  body: z.string().trim().min(1).max(MESSAGE_MAX_LENGTH),
});

export type EnvoiResult = { ok: true } | { ok: false; error: string };

export async function sendLearnerMessage(input: {
  token: string;
  sessionId: string;
  body: string;
}): Promise<EnvoiResult> {
  const p = schema.safeParse(input);
  if (!p.success) return { ok: false, error: 'Message invalide.' };

  const acces = await resolveAccesApprenant(p.data.token);
  if (!acces) return { ok: false, error: 'Votre lien a expiré. Demandez-en un nouveau à votre organisme.' };
  if (!acces.seances.some((s) => s.id === p.data.sessionId)) {
    return { ok: false, error: "Cette séance n'est pas la vôtre." };
  }

  const res = await postSessionMessage({
    organizationId: acces.organizationId,
    sessionId: p.data.sessionId,
    authorKind: 'apprenant',
    authorName: acces.learnerName,
    authorLearnerId: acces.learnerId,
    body: p.data.body,
  });
  if (!res.ok) return { ok: false, error: "Le message n'a pas pu être envoyé." };

  revalidatePath(`/espace/${p.data.token}/messages/${p.data.sessionId}`);
  return { ok: true };
}
