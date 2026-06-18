'use server';

import { createHash } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { authActionClient } from '@/shared/lib/safe-action';
import { supabaseAdmin } from '@/shared/lib/supabase/admin';
import { env } from '@/env.mjs';
import { sendEmail } from '@/shared/lib/email/resend';
import { generateDocumentSignatureToken } from '@/shared/lib/document-signature-token';
import { RequestSignaturesSchema } from './signature-schema';

const ADMIN_ROLES = ['owner', 'admin', 'gestionnaire'] as const;
type AdminRole = (typeof ADMIN_ROLES)[number];

async function resolveAdminOrgId(userId: string): Promise<string | null> {
  const admin = supabaseAdmin();
  const { data: member } = await (admin as never as {
    schema: (s: string) => {
      from: (t: string) => {
        select: (c: string) => {
          eq: (k: string, v: string) => {
            is: (k: string, v: null) => {
              order: (k: string, o: { ascending: boolean }) => {
                limit: (n: number) => {
                  maybeSingle: () => Promise<{ data: { organization_id: string; role: string } | null }>;
                };
              };
            };
          };
        };
      };
    };
  })
    .schema('app')
    .from('members')
    .select('organization_id, role')
    .eq('user_id', userId)
    .is('deleted_at', null)
    .order('is_default_org', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!member?.organization_id) return null;
  if (!ADMIN_ROLES.includes(member.role as AdminRole)) return null;
  return member.organization_id;
}

function baseUrl(): string {
  return (env.PUBLIC_APP_URL ?? 'https://capsule-ia.up.railway.app').replace(/\/$/, '');
}

export const requestSignatures = authActionClient
  .schema(RequestSignaturesSchema)
  .action(async ({ parsedInput, ctx }) => {
    const orgId = await resolveAdminOrgId(ctx.userId as unknown as string);
    if (!orgId) return { ok: false as const, error: 'forbidden_not_admin' };

    const admin = supabaseAdmin();

    // Charger le document (org courante).
    const { data: docRow } = await admin
      .schema('app')
      .from('documents')
      .select('id, organization_id, title')
      .eq('id', parsedInput.documentId)
      .eq('organization_id', orgId)
      .is('deleted_at', null)
      .maybeSingle();
    const doc = docRow as { id: string; organization_id: string; title: string } | null;
    if (!doc) return { ok: false as const, error: 'document_not_found' };

    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    let sent = 0;

    for (const signer of parsedInput.signers) {
      // 1. Créer la demande de signature (statut pending).
      const { data: insRow, error: insErr } = await admin
        .schema('app')
        .from('document_signatures')
        .insert({
          organization_id: orgId,
          document_id: doc.id,
          signer_kind: signer.kind,
          signer_learner_id: signer.kind === 'learner' ? signer.learnerId : null,
          signer_email: signer.email,
          signer_name: signer.name,
          status: 'pending',
          request_expires_at: expiresAt,
        } as never)
        .select('id')
        .single();
      if (insErr || !insRow) continue;
      const signatureId = (insRow as { id: string }).id;

      // 2. Générer le token + enregistrer son hash (anti-rejeu).
      const { token } = await generateDocumentSignatureToken({
        signatureId,
        documentId: doc.id,
        organizationId: orgId,
      });
      const tokenHash = createHash('sha256').update(token).digest('hex');
      await admin
        .schema('app')
        .from('document_signatures')
        .update({ request_token_hash: tokenHash } as never)
        .eq('id', signatureId);

      // 3. Envoyer le lien de signature par email.
      const url = `${baseUrl()}/signer/document/${token}`;
      const html = `<!DOCTYPE html><html><body style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;background:#fafafa;padding:32px;">
<div style="max-width:520px;margin:auto;background:#fff;border:1px solid #e4e4e7;border-radius:12px;padding:28px;">
<h1 style="font-size:18px;margin:0 0 8px;">Signature demandée</h1>
<p style="color:#3f3f46;font-size:14px;line-height:1.5;">Bonjour ${signer.name},</p>
<p style="color:#3f3f46;font-size:14px;line-height:1.5;">Vous êtes invité(e) à signer le document <strong>${doc.title}</strong>.</p>
<p style="margin:20px 0;"><a href="${url}" style="display:inline-block;padding:11px 20px;background:#7c3aed;color:#fff;text-decoration:none;border-radius:8px;font-size:14px;">Consulter et signer</a></p>
<p style="color:#a1a1aa;font-size:11px;">Lien valable 30 jours. Si le bouton ne fonctionne pas : ${url}</p>
</div></body></html>`;
      const res = await sendEmail({
        to: signer.email,
        subject: `Signature à effectuer — ${doc.title}`,
        html,
        organizationId: orgId,
        kind: 'signature_request',
      });
      if (res.ok) sent += 1;
    }

    revalidatePath(`/documents/${doc.id}/apercu`);
    return { ok: true as const, sent, total: parsedInput.signers.length };
  });
