'use server';

import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { authActionClient } from '@/shared/lib/safe-action';
import { supabaseAdmin } from '@/shared/lib/supabase/admin';
import { sendEmail } from '@/shared/lib/email/resend';
import { loadSession } from '@/features/sessions/load-session';

// Assigne un questionnaire à TOUS les apprenants de la session (1 assignation par
// apprenant/dossier). Idempotent : saute les apprenants déjà assignés à ce modèle.
export const assignQuestionnaireToSession = authActionClient
  .schema(z.object({ sessionId: z.string().uuid(), templateId: z.string().uuid() }))
  .action(async ({ parsedInput, ctx }) => {
    const loaded = await loadSession(ctx.supabase, parsedInput.sessionId);
    if (!loaded) return { ok: false as const, error: 'session_not_found' };
    const orgId = loaded.session.organization_id;

    let assigned = 0;
    let skipped = 0;
    for (const l of loaded.learners) {
      const { data: dup } = await ctx.supabase
        .schema('app')
        .from('questionnaire_assignments')
        .select('id')
        .eq('dossier_id', l.dossierId)
        .eq('recipient_learner_id', l.id)
        .eq('template_id', parsedInput.templateId)
        .neq('status', 'expired')
        .maybeSingle();
      if (dup) {
        skipped++;
        continue;
      }
      const { error } = await ctx.supabase
        .schema('app')
        .from('questionnaire_assignments')
        .insert({
          organization_id: orgId,
          template_id: parsedInput.templateId,
          dossier_id: l.dossierId,
          recipient_kind: 'learner',
          recipient_learner_id: l.id,
          recipient_email: l.email,
          recipient_name: `${l.first_name} ${l.last_name}`.trim(),
          token_hash: `pending-${randomUUID()}`,
          status: 'pending',
        } as never);
      if (!error) assigned++;
    }

    revalidatePath(`/sessions/${parsedInput.sessionId}/questionnaires`);
    return { ok: true as const, assigned, skipped };
  });

// Envoie par email le dernier document d'un type donné à TOUS les apprenants de la
// session (chacun reçoit SON document, depuis son dossier). Saute ceux sans document.
export const sendDocumentToSession = authActionClient
  .schema(z.object({ sessionId: z.string().uuid(), kind: z.string().trim().min(1).max(60) }))
  .action(async ({ parsedInput, ctx }) => {
    const loaded = await loadSession(ctx.supabase, parsedInput.sessionId);
    if (!loaded) return { ok: false as const, error: 'session_not_found' };
    const orgId = loaded.session.organization_id;
    const admin = supabaseAdmin();

    let sent = 0;
    let skipped = 0;
    for (const l of loaded.learners) {
      const { data: docRow } = await admin
        .schema('app')
        .from('documents')
        .select('title, storage_path')
        .eq('dossier_id', l.dossierId)
        .eq('kind', parsedInput.kind)
        .not('storage_path', 'is', null)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      const doc = docRow as { title: string | null; storage_path: string } | null;
      if (!doc?.storage_path) {
        skipped++;
        continue;
      }
      const { data: file } = await admin.storage.from('documents').download(doc.storage_path);
      if (!file) {
        skipped++;
        continue;
      }
      const base64 = Buffer.from(await file.arrayBuffer()).toString('base64');
      const safe = `${(doc.title || parsedInput.kind).replace(/[^a-zA-Z0-9-_ ]/g, '').trim() || 'document'}.pdf`;
      const res = await sendEmail({
        to: l.email,
        subject: doc.title || 'Votre document',
        html: `<!DOCTYPE html><html><body style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;background:#fafafa;padding:32px;">
<div style="max-width:520px;margin:auto;background:#fff;border:1px solid #e4e4e7;border-radius:12px;padding:28px;">
<p style="color:#3f3f46;font-size:14px;line-height:1.6;">Bonjour ${l.first_name},</p>
<p style="color:#3f3f46;font-size:14px;line-height:1.6;">Veuillez trouver ci-joint votre document.</p>
<p style="color:#a1a1aa;font-size:11px;">Capsule IA</p></div></body></html>`,
        attachments: [{ filename: safe, content: base64 }],
        organizationId: orgId,
        dossierId: l.dossierId,
        kind: 'document_email',
      });
      if (res.ok) sent++;
      else skipped++;
    }

    revalidatePath(`/sessions/${parsedInput.sessionId}/documents`);
    return { ok: true as const, sent, skipped };
  });
