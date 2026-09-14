'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { supabaseAdmin } from '@/shared/lib/supabase/admin';
import { getCurrentMember } from '@/shared/lib/auth/current-member';
import { postSessionMessage, markThreadRead, MESSAGE_MAX_LENGTH } from '@/features/trainer-space/session-messages';

/**
 * L'organisme répond dans le fil d'une séance.
 *
 * La garde est explicite : la séance doit appartenir à l'organisation du membre
 * connecté. Une Server Action n'est pas protégée par le middleware, et l'écriture
 * qui suit se fait en service role.
 */

const schema = z.object({ sessionId: z.string().uuid(), body: z.string().trim().min(1).max(MESSAGE_MAX_LENGTH) });

export type EnvoiResult = { ok: true } | { ok: false; error: string };

export async function sendStaffMessage(input: { sessionId: string; body: string }): Promise<EnvoiResult> {
  const p = schema.safeParse(input);
  if (!p.success) return { ok: false, error: 'Message invalide.' };

  const me = await getCurrentMember();
  if (!me) return { ok: false, error: 'Votre session a expiré, reconnectez-vous.' };

  const admin = supabaseAdmin();
  const { data: sRow } = await admin
    .schema('app')
    .from('sessions')
    .select('id, organization_id')
    .eq('id', p.data.sessionId)
    .maybeSingle();
  const session = sRow as { id: string; organization_id: string } | null;
  if (!session || session.organization_id !== me.organizationId) {
    return { ok: false, error: "Cette séance n'appartient pas à votre organisation." };
  }

  const res = await postSessionMessage({
    organizationId: session.organization_id,
    sessionId: session.id,
    authorKind: 'organisme',
    authorName: me.fullName,
    authorUserId: me.userId,
    body: p.data.body,
  });
  if (!res.ok) return { ok: false, error: "Le message n'a pas pu être envoyé." };

  await markThreadRead(session.id, me.userId);
  revalidatePath(`/sessions/${session.id}/messages`);
  return { ok: true };
}
