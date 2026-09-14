'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { supabaseAdmin } from '@/shared/lib/supabase/admin';
import { requireMyTrainerSession } from '@/features/trainer-space/guard';
import {
  addLinkResource,
  setResourcePublished,
  deleteResource,
  resubmitResource,
} from '@/features/trainer-space/session-resources';
import { notifySupportDepose } from '@/features/trainer-space/support-notifications';
import { postSessionMessage, markThreadRead, MESSAGE_MAX_LENGTH } from '@/features/trainer-space/session-messages';

/**
 * Actions du formateur sur SA séance. Chacune repasse par
 * `requireMyTrainerSession` : l'identifiant vient du client, la garde est donc
 * la seule chose qui sépare un formateur des séances des autres.
 */

export type ActionResult = { ok: true } | { ok: false; error: string };

const MESSAGES: Record<string, string> = {
  unauthenticated: 'Votre session a expiré, reconnectez-vous.',
  forbidden: "Cette séance n'est pas la vôtre.",
  invalid_payload: 'Saisie invalide.',
  message_vide: 'Le message est vide.',
  message_trop_long: `Message trop long (${MESSAGE_MAX_LENGTH} caractères maximum).`,
};

const humain = (code: string): string => MESSAGES[code] ?? "L'enregistrement a échoué.";

const visioSchema = z.object({
  sessionId: z.string().uuid(),
  // Vide = retirer le lien : une visio annulée ne doit pas rester cliquable.
  url: z.union([z.literal(''), z.string().trim().url().max(2000)]),
});

export async function setSessionRemoteUrl(input: { sessionId: string; url: string }): Promise<ActionResult> {
  const p = visioSchema.safeParse(input);
  if (!p.success) return { ok: false, error: humain('invalid_payload') };
  const acces = await requireMyTrainerSession(p.data.sessionId);
  if (!acces.ok) return { ok: false, error: humain(acces.error) };

  const url = p.data.url.trim();
  if (url && !/^https?:\/\//i.test(url)) return { ok: false, error: 'Le lien doit commencer par https://' };

  const { error } = await supabaseAdmin()
    .schema('app')
    .from('sessions')
    .update({ remote_url: url || null })
    .eq('id', p.data.sessionId);
  if (error) return { ok: false, error: humain('erreur') };

  revalidatePath(`/seance/${p.data.sessionId}`);
  revalidatePath('/mes-sessions');
  return { ok: true };
}

const lienSchema = z.object({
  sessionId: z.string().uuid(),
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).optional(),
  url: z.string().trim().url().max(2000),
});

export async function addSupportLink(input: {
  sessionId: string;
  title: string;
  description?: string;
  url: string;
}): Promise<ActionResult> {
  const p = lienSchema.safeParse(input);
  if (!p.success) return { ok: false, error: humain('invalid_payload') };
  const acces = await requireMyTrainerSession(p.data.sessionId);
  if (!acces.ok) return { ok: false, error: humain(acces.error) };
  if (!/^https?:\/\//i.test(p.data.url)) return { ok: false, error: 'Le lien doit commencer par https://' };

  const res = await addLinkResource({
    organizationId: acces.session.organization_id,
    sessionId: p.data.sessionId,
    userId: acces.userId,
    title: p.data.title,
    description: p.data.description ?? null,
    url: p.data.url,
  });
  if (!res.ok) return { ok: false, error: humain(res.error) };

  await notifySupportDepose({
    organizationId: acces.session.organization_id,
    resourceId: res.resourceId,
    sessionId: p.data.sessionId,
    title: p.data.title,
    trainerName: acces.trainerName,
  });

  revalidatePath(`/seance/${p.data.sessionId}/supports`);
  return { ok: true };
}

const publishSchema = z.object({
  sessionId: z.string().uuid(),
  resourceId: z.string().uuid(),
  isPublished: z.boolean(),
});

export async function toggleSupportPublished(input: {
  sessionId: string;
  resourceId: string;
  isPublished: boolean;
}): Promise<ActionResult> {
  const p = publishSchema.safeParse(input);
  if (!p.success) return { ok: false, error: humain('invalid_payload') };
  const acces = await requireMyTrainerSession(p.data.sessionId);
  if (!acces.ok) return { ok: false, error: humain(acces.error) };

  const ok = await setResourcePublished(p.data.sessionId, p.data.resourceId, p.data.isPublished);
  if (!ok) return { ok: false, error: humain('erreur') };
  revalidatePath(`/seance/${p.data.sessionId}/supports`);
  return { ok: true };
}

const suppressionSchema = z.object({ sessionId: z.string().uuid(), resourceId: z.string().uuid() });

export async function removeSupport(input: { sessionId: string; resourceId: string }): Promise<ActionResult> {
  const p = suppressionSchema.safeParse(input);
  if (!p.success) return { ok: false, error: humain('invalid_payload') };
  const acces = await requireMyTrainerSession(p.data.sessionId);
  if (!acces.ok) return { ok: false, error: humain(acces.error) };

  const ok = await deleteResource(p.data.sessionId, p.data.resourceId);
  if (!ok) return { ok: false, error: humain('erreur') };
  revalidatePath(`/seance/${p.data.sessionId}/supports`);
  return { ok: true };
}

export async function resubmitSupport(input: { sessionId: string; resourceId: string }): Promise<ActionResult> {
  const p = suppressionSchema.safeParse(input);
  if (!p.success) return { ok: false, error: humain('invalid_payload') };
  const acces = await requireMyTrainerSession(p.data.sessionId);
  if (!acces.ok) return { ok: false, error: humain(acces.error) };

  const ok = await resubmitResource(p.data.sessionId, p.data.resourceId);
  if (!ok) return { ok: false, error: humain('erreur') };

  const { data } = await supabaseAdmin()
    .schema('app')
    .from('session_resources' as never)
    .select('title')
    .eq('id', p.data.resourceId)
    .maybeSingle();
  await notifySupportDepose({
    organizationId: acces.session.organization_id,
    resourceId: p.data.resourceId,
    sessionId: p.data.sessionId,
    title: (data as { title?: string } | null)?.title ?? 'Support corrigé',
    trainerName: acces.trainerName,
  });

  revalidatePath(`/seance/${p.data.sessionId}/supports`);
  return { ok: true };
}

const messageSchema = z.object({
  sessionId: z.string().uuid(),
  body: z.string().trim().min(1).max(MESSAGE_MAX_LENGTH),
});

export async function sendTrainerMessage(input: { sessionId: string; body: string }): Promise<ActionResult> {
  const p = messageSchema.safeParse(input);
  if (!p.success) return { ok: false, error: humain('invalid_payload') };
  const acces = await requireMyTrainerSession(p.data.sessionId);
  if (!acces.ok) return { ok: false, error: humain(acces.error) };

  const res = await postSessionMessage({
    organizationId: acces.session.organization_id,
    sessionId: p.data.sessionId,
    authorKind: 'formateur',
    authorName: acces.trainerName,
    authorUserId: acces.userId,
    body: p.data.body,
  });
  if (!res.ok) return { ok: false, error: humain(res.error) };

  await markThreadRead(p.data.sessionId, acces.userId);
  revalidatePath(`/seance/${p.data.sessionId}/messages`);
  return { ok: true };
}
