'use server';

import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { authActionClient } from '@/shared/lib/safe-action';
import { supabaseAdmin } from '@/shared/lib/supabase/admin';
import { sendEmail } from '@/shared/lib/email/resend';
import { loadSession } from '@/features/sessions/load-session';
import { generateApprenantUrl } from '@/shared/lib/apprenant-token';
import { env } from '@/env.mjs';
import { sendConvocationsRecap } from '@/features/sessions/send-convocations-recap';
import { buildGroupConventions } from '@/features/documents/build-group-convention';
import { buildConventionInput } from '@/features/documents/build-convention-input';
import { renderCompanyAttendanceSheet } from '@/features/attendance/company-signed-sheet';
import type { SupabaseClient } from '@supabase/supabase-js';
import { generateConventionPDF } from '@/features/documents/generate-convention-pdf';
import { persistGeneratedDocument } from '@/features/documents/persist-document';

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

// Génère et envoie par email l'accès à l'espace de formation à TOUS les apprenants
// de la session (URL signée, valable 90 j). Saute les apprenants sans email.
export const sendSessionAccess = authActionClient
  .schema(z.object({ sessionId: z.string().uuid() }))
  .action(async ({ parsedInput, ctx }) => {
    const loaded = await loadSession(ctx.supabase, parsedInput.sessionId);
    if (!loaded) return { ok: false as const, error: 'session_not_found' };
    if (!env.PUBLIC_APP_URL) return { ok: false as const, error: 'public_app_url_missing' };
    const orgId = loaded.session.organization_id;

    let sent = 0;
    let skipped = 0;
    for (const l of loaded.learners) {
      if (!l.email) {
        skipped++;
        continue;
      }
      const signed = await generateApprenantUrl(
        { learnerId: l.id, organizationId: orgId, dossierId: l.dossierId },
        env.PUBLIC_APP_URL,
      );
      const res = await sendEmail({
        to: l.email,
        subject: 'Votre espace de formation est prêt',
        html: `<!DOCTYPE html><html><body style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;background:#fafafa;padding:32px;">
<div style="max-width:520px;margin:auto;background:#fff;border:1px solid #e4e4e7;border-radius:12px;padding:28px;">
<p style="color:#3f3f46;font-size:14px;line-height:1.6;">Bonjour ${l.first_name},</p>
<p style="color:#3f3f46;font-size:14px;line-height:1.6;">Votre espace de formation est accessible via le lien ci-dessous (valable 90 jours) :</p>
<p style="margin:20px 0;"><a href="${signed.url}" style="background:#7c3aed;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-size:14px;">Accéder à mon espace</a></p>
<p style="color:#a1a1aa;font-size:11px;word-break:break-all;">${signed.url}</p></div></body></html>`,
        organizationId: orgId,
        dossierId: l.dossierId,
        kind: 'acces_apprenant',
      });
      if (res.ok) sent++;
      else skipped++;
    }

    revalidatePath(`/sessions/${parsedInput.sessionId}/acces`);
    return { ok: true as const, sent, skipped };
  });

/**
 * Envoi manuel du récapitulatif des convocations aux entreprises clientes de la
 * séance. Le récap part aussi tout seul à J-7 ; ce bouton sert à le renvoyer,
 * ou à l'envoyer plus tôt.
 */
export const sendSessionConvocationsRecap = authActionClient
  .schema(z.object({ sessionId: z.string().uuid() }))
  .action(async ({ parsedInput, ctx }) => {
    const loaded = await loadSession(ctx.supabase, parsedInput.sessionId);
    if (!loaded) return { ok: false as const, error: 'session_not_found' };

    const r = await sendConvocationsRecap(parsedInput.sessionId);
    revalidatePath(`/sessions/${parsedInput.sessionId}`);
    return { ok: true as const, entreprises: r.entreprises, envoyes: r.envoyes, erreurs: r.erreurs };
  });

/**
 * Envoie au responsable d'une entreprise cliente ses feuilles d'émargement
 * signées de la séance (ses salariés seulement), en pièces jointes.
 */
export const sendCompanyAttendanceSheets = authActionClient
  .schema(z.object({ sessionId: z.string().uuid(), companyId: z.string().uuid() }))
  .action(async ({ parsedInput, ctx }) => {
    const loaded = await loadSession(ctx.supabase, parsedInput.sessionId);
    if (!loaded) return { ok: false as const, error: 'session_not_found' };
    const orgId = loaded.session.organization_id;
    const admin = supabaseAdmin() as unknown as SupabaseClient;

    const { data: companyRow } = await admin
      .schema('app')
      .from('companies')
      .select('name, contact_name, contact_email')
      .eq('id', parsedInput.companyId)
      .eq('organization_id', orgId)
      .maybeSingle();
    const company = companyRow as { name: string; contact_name: string | null; contact_email: string | null } | null;
    if (!company) return { ok: false as const, error: 'company_not_found' };
    let to = company.contact_email;
    if (!to) {
      const { data: q } = await admin
        .schema('app')
        .from('quotes')
        .select('recipient_email')
        .eq('company_id', parsedInput.companyId)
        .not('recipient_email', 'is', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      to = (q as { recipient_email: string | null } | null)?.recipient_email ?? null;
    }
    if (!to) return { ok: false as const, error: 'no_contact_email' };

    const attachments: { filename: string; content: string }[] = [];
    for (const s of loaded.sheets) {
      const sheet = await renderCompanyAttendanceSheet(ctx.supabase as never, {
        sheetId: s.id,
        sessionId: parsedInput.sessionId,
        organizationId: orgId,
        companyId: parsedInput.companyId,
      });
      if (sheet) {
        attachments.push({
          filename: `emargement-${sheet.date}-${sheet.halfDay}.pdf`,
          content: Buffer.from(sheet.bytes).toString('base64'),
        });
      }
    }
    if (attachments.length === 0) return { ok: false as const, error: 'no_sheet' };

    const title = loaded.formation?.title ?? loaded.session.title ?? 'la formation';
    const res = await sendEmail({
      to,
      subject: `Feuilles d'émargement — ${title} (${company.name})`,
      html: `<!DOCTYPE html><html><body style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;background:#fafafa;padding:32px;">
<div style="max-width:520px;margin:auto;background:#fff;border:1px solid #e4e4e7;border-radius:12px;padding:28px;">
<p style="color:#3f3f46;font-size:14px;line-height:1.6;">Bonjour ${company.contact_name ?? company.name},</p>
<p style="color:#3f3f46;font-size:14px;line-height:1.6;">Veuillez trouver ci-jointes les feuilles d'émargement de vos salariés pour ${title}.</p>
</div></body></html>`,
      attachments,
      organizationId: orgId,
      kind: 'emargement_entreprise',
      metadata: { session_id: parsedInput.sessionId, company_id: parsedInput.companyId },
    });
    if (!res.ok) return { ok: false as const, error: 'send_failed' };
    return { ok: true as const, sheets: attachments.length, email: to };
  });

/**
 * Documents contractuels de la séance, en DEUX jeux quand le client est une
 * entreprise :
 *
 *  • l'exemplaire de l'**entreprise** — un seul document listant l'intégralité
 *    de ses stagiaires, le montant et les heures cumulés, signé par son
 *    responsable. C'est la pièce contractuelle, celle qu'on lui transmet ;
 *  • l'exemplaire de **chaque stagiaire** — nominatif, aux mêmes conditions,
 *    déposé dans son dossier et donc dans son espace. Il ne nomme que lui :
 *    un salarié n'a pas à connaître la liste ni les tarifs de ses collègues.
 *
 * Un particulier, lui, n'a qu'un document : son contrat de formation
 * professionnelle (art. L.6353-3 à L.6353-7, délai de rétractation).
 */
export const generateGroupConventions = authActionClient
  .schema(z.object({ sessionId: z.string().uuid() }))
  .action(async ({ parsedInput, ctx }) => {
    const loaded = await loadSession(ctx.supabase, parsedInput.sessionId);
    if (!loaded) return { ok: false as const, error: 'session_not_found' };

    const conventions = await buildGroupConventions(parsedInput.sessionId);
    const admin = supabaseAdmin();
    const entreprises: string[] = [];
    const particuliers: string[] = [];

    for (const l of loaded.learners.filter((x) => !x.companyId)) {
      const built = await buildConventionInput(admin as never, l.dossierId, null);
      if (!built) continue;
      const input = { ...built.input, contractKind: 'contrat' as const, audience: 'stagiaire' as const };
      const bytes = await generateConventionPDF(input);
      await persistGeneratedDocument(admin as never, {
        organizationId: built.organizationId,
        dossierId: l.dossierId,
        kind: 'convention',
        title: `Contrat de formation professionnelle — ${l.first_name} ${l.last_name}`,
        bytes,
        generationInput: input,
        sourceKey: `contrat:${parsedInput.sessionId}:${l.dossierId}`,
        metadata: { contract: true, session_id: parsedInput.sessionId },
      });
      particuliers.push(`${l.first_name} ${l.last_name}`);
    }

    for (const c of conventions) {
      const input = { ...c.input, audience: 'entreprise' as const };
      const bytes = await generateConventionPDF(input);
      await persistGeneratedDocument(admin as never, {
        organizationId: c.organizationId,
        dossierId: c.anchorDossierId,
        kind: 'convention',
        title: `Convention de formation — ${c.companyName} (${c.dossierIds.length} participant${c.dossierIds.length > 1 ? 's' : ''})`,
        bytes,
        generationInput: input,
        sourceKey: `convention:${parsedInput.sessionId}:${c.companyId}`,
        metadata: {
          grouped: true,
          audience: 'entreprise',
          session_id: parsedInput.sessionId,
          company_id: c.companyId,
          dossier_ids: c.dossierIds,
        },
      });
      entreprises.push(c.companyName);
    }

    // Exemplaire nominatif de chaque salarié : mêmes conditions, son seul nom.
    let stagiaires = 0;
    for (const l of loaded.learners.filter((x) => x.companyId)) {
      const built = await buildConventionInput(admin as never, l.dossierId, null);
      if (!built) continue;
      const input = { ...built.input, audience: 'stagiaire' as const };
      const bytes = await generateConventionPDF(input);
      await persistGeneratedDocument(admin as never, {
        organizationId: built.organizationId,
        dossierId: l.dossierId,
        kind: 'convention',
        title: `Convention de formation — ${l.first_name} ${l.last_name}`,
        bytes,
        generationInput: input,
        sourceKey: `convention-stagiaire:${parsedInput.sessionId}:${l.dossierId}`,
        metadata: {
          audience: 'stagiaire',
          session_id: parsedInput.sessionId,
          company_id: l.companyId,
        },
      });
      stagiaires += 1;
    }

    revalidatePath(`/sessions/${parsedInput.sessionId}/documents`);
    return {
      ok: true as const,
      count: conventions.length + particuliers.length + stagiaires,
      entreprises,
      particuliers,
      stagiaires,
    };
  });
