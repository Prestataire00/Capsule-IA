'use server';

import { z } from 'zod';
import { createHash } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { authActionClient } from '@/shared/lib/safe-action';
import { getCurrentMember } from '@/shared/lib/auth/current-member';
import { can } from '@/shared/lib/auth/permissions';
import { supabaseAdmin } from '@/shared/lib/supabase/admin';
import { sendEmail } from '@/shared/lib/email/resend';
import { env } from '@/env.mjs';
import { generateDocumentSignatureToken } from '@/shared/lib/document-signature-token';
import { persistGeneratedDocument } from '@/features/documents/persist-document';
import {
  buildLearnerDocument,
  isLearnerDocumentType,
  learnerDocumentMeta,
  type LearnerDocumentType,
} from '@/features/documents/learner-documents';

/**
 * Documents d'un stagiaire depuis la séance : envoi par e-mail et mise en
 * signature. Réservé aux rôles qui gèrent les dossiers ; on vérifie en plus que
 * le dossier est bien rattaché à CETTE séance de l'organisme du membre avant
 * toute lecture en service role.
 */

const schema = z.object({
  sessionId: z.string().uuid(),
  dossierId: z.string().uuid(),
  type: z.string().trim().min(1).max(40),
});

type Garde =
  | { ok: true; organizationId: string; type: LearnerDocumentType }
  | { ok: false; error: 'forbidden' | 'session_not_found' | 'dossier_not_in_session' | 'unknown_type' };

async function garde(input: z.infer<typeof schema>): Promise<Garde> {
  if (!isLearnerDocumentType(input.type)) return { ok: false, error: 'unknown_type' };
  const membre = await getCurrentMember();
  if (!membre || can(membre.role, 'dossiers') !== 'manage') return { ok: false, error: 'forbidden' };

  const admin = supabaseAdmin();
  const { data: sRow } = await admin
    .schema('app')
    .from('sessions')
    .select('id, organization_id, dossier_id')
    .eq('id', input.sessionId)
    .eq('organization_id', membre.organizationId)
    .maybeSingle();
  const session = sRow as { id: string; organization_id: string; dossier_id: string | null } | null;
  if (!session) return { ok: false, error: 'session_not_found' };

  const { data: liens } = await admin
    .schema('app')
    .from('session_dossiers')
    .select('dossier_id')
    .eq('session_id', session.id);
  const rattaches = new Set([
    ...(session.dossier_id ? [session.dossier_id] : []),
    ...((liens ?? []) as { dossier_id: string }[]).map((l) => l.dossier_id),
  ]);
  if (!rattaches.has(input.dossierId)) return { ok: false, error: 'dossier_not_in_session' };

  return { ok: true, organizationId: session.organization_id, type: input.type };
}

async function destinataire(dossierId: string): Promise<{ email: string | null; name: string }> {
  const { data } = await supabaseAdmin()
    .schema('app')
    .from('dossiers')
    .select('learner:learners(first_name, last_name, email)')
    .eq('id', dossierId)
    .maybeSingle();
  const l = (data as unknown as { learner: { first_name: string; last_name: string; email: string | null } | null } | null)?.learner;
  return { email: l?.email ?? null, name: `${l?.first_name ?? ''} ${l?.last_name ?? ''}`.trim() || 'Apprenant' };
}

const corps = (prenom: string, intro: string) =>
  `<!DOCTYPE html><html><body style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;background:#fafafa;padding:32px;">
<div style="max-width:520px;margin:auto;background:#fff;border:1px solid #e4e4e7;border-radius:12px;padding:28px;">
<p style="color:#3f3f46;font-size:14px;line-height:1.6;">Bonjour ${prenom},</p>
<p style="color:#3f3f46;font-size:14px;line-height:1.6;">${intro}</p>
<p style="color:#a1a1aa;font-size:11px;">Capsule IA</p></div></body></html>`;

/** Envoie le document en pièce jointe à l'apprenant du dossier. */
export const sendLearnerDocument = authActionClient.schema(schema).action(async ({ parsedInput }) => {
  const g = await garde(parsedInput);
  if (!g.ok) return { ok: false as const, error: g.error };

  const admin = supabaseAdmin();
  const built = await buildLearnerDocument(admin, {
    type: g.type,
    dossierId: parsedInput.dossierId,
    sessionId: parsedInput.sessionId,
  });
  if (!built) return { ok: false as const, error: 'build_failed' };

  const qui = await destinataire(parsedInput.dossierId);
  if (!qui.email) return { ok: false as const, error: 'no_email' };

  const res = await sendEmail({
    to: qui.email,
    subject: built.title,
    html: corps(qui.name.split(' ')[0] ?? qui.name, `Veuillez trouver ci-joint votre document : <strong>${built.title}</strong>.`),
    attachments: [{ filename: built.filename, content: Buffer.from(built.bytes).toString('base64') }],
    organizationId: built.organizationId,
    dossierId: parsedInput.dossierId,
    kind: `document:${g.type}`,
    metadata: { session_id: parsedInput.sessionId, document_type: g.type },
  });
  if (!res.ok) return { ok: false as const, error: 'send_failed' };

  // Archive le document envoyé : l'apprenant l'a reçu, le dossier doit le garder.
  try {
    await persistGeneratedDocument(admin as never, {
      organizationId: built.organizationId,
      dossierId: parsedInput.dossierId,
      kind: built.kind,
      title: built.title,
      bytes: built.bytes,
      generationInput: built.generationInput,
      metadata: { session_id: parsedInput.sessionId, document_type: g.type },
    });
  } catch (e) {
    console.error('[documents séance] archivage échoué', e);
  }

  revalidatePath(`/sessions/${parsedInput.sessionId}/documents`);
  return { ok: true as const, email: qui.email };
});

/** Archive le document puis envoie un lien de signature à l'apprenant (30 jours). */
export const requestLearnerDocumentSignature = authActionClient.schema(schema).action(async ({ parsedInput }) => {
  const g = await garde(parsedInput);
  if (!g.ok) return { ok: false as const, error: g.error };
  if (!learnerDocumentMeta(g.type).signable) return { ok: false as const, error: 'not_signable' };

  const admin = supabaseAdmin();
  const built = await buildLearnerDocument(admin, {
    type: g.type,
    dossierId: parsedInput.dossierId,
    sessionId: parsedInput.sessionId,
  });
  if (!built) return { ok: false as const, error: 'build_failed' };

  const qui = await destinataire(parsedInput.dossierId);
  if (!qui.email) return { ok: false as const, error: 'no_email' };

  const { data: learnerRow } = await admin
    .schema('app')
    .from('dossiers')
    .select('learner_id')
    .eq('id', parsedInput.dossierId)
    .maybeSingle();
  const learnerId = (learnerRow as { learner_id: string | null } | null)?.learner_id ?? null;

  const { documentId } = await persistGeneratedDocument(admin as never, {
    organizationId: built.organizationId,
    dossierId: parsedInput.dossierId,
    kind: built.kind,
    title: built.title,
    bytes: built.bytes,
    generationInput: built.generationInput,
    metadata: { session_id: parsedInput.sessionId, document_type: g.type },
  });

  const { data: insRow, error: insErr } = await admin
    .schema('app')
    .from('document_signatures')
    .insert({
      organization_id: built.organizationId,
      document_id: documentId,
      signer_kind: 'learner',
      signer_learner_id: learnerId,
      signer_email: qui.email,
      signer_name: qui.name,
      status: 'pending',
      request_expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    } as never)
    .select('id')
    .single();
  if (insErr || !insRow) return { ok: false as const, error: 'send_failed' };
  const signatureId = (insRow as { id: string }).id;

  const { token } = await generateDocumentSignatureToken({
    signatureId,
    documentId,
    organizationId: built.organizationId,
  });
  await admin
    .schema('app')
    .from('document_signatures')
    .update({ request_token_hash: createHash('sha256').update(token).digest('hex') } as never)
    .eq('id', signatureId);

  const base = (env.PUBLIC_APP_URL ?? 'https://capsule-ia.up.railway.app').replace(/\/$/, '');
  const url = `${base}/signer/document/${token}`;
  const res = await sendEmail({
    to: qui.email,
    subject: `Signature à effectuer — ${built.title}`,
    html: corps(
      qui.name.split(' ')[0] ?? qui.name,
      `Vous êtes invité(e) à relire et signer <strong>${built.title}</strong> :<br><br><a href="${url}" style="display:inline-block;padding:11px 20px;background:#f97316;color:#fff;text-decoration:none;border-radius:8px;font-size:14px;">Consulter et signer</a><br><br><span style="color:#a1a1aa;font-size:11px;">Lien valable 30 jours : ${url}</span>`,
    ),
    organizationId: built.organizationId,
    dossierId: parsedInput.dossierId,
    kind: 'signature_request',
    metadata: { session_id: parsedInput.sessionId, document_type: g.type },
  });
  if (!res.ok) return { ok: false as const, error: 'send_failed' };

  revalidatePath(`/sessions/${parsedInput.sessionId}/documents`);
  return { ok: true as const, email: qui.email };
});
