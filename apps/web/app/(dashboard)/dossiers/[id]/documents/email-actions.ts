'use server';

import { authActionClient } from '@/shared/lib/safe-action';
import { supabaseAdmin } from '@/shared/lib/supabase/admin';
import { sendEmail } from '@/shared/lib/email/resend';
import { EmailDocumentSchema } from './phase3-schema';

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

export const emailDocument = authActionClient
  .schema(EmailDocumentSchema)
  .action(async ({ parsedInput, ctx }) => {
    const orgId = await resolveAdminOrgId(ctx.userId as unknown as string);
    if (!orgId) return { ok: false as const, error: 'forbidden_not_admin' };

    const admin = supabaseAdmin();
    const { data: docRow } = await admin
      .schema('app')
      .from('documents')
      .select('id, organization_id, title, storage_path, mime_type')
      .eq('id', parsedInput.documentId)
      .eq('organization_id', orgId)
      .is('deleted_at', null)
      .maybeSingle();
    const doc = docRow as {
      title: string;
      storage_path: string | null;
      mime_type: string | null;
    } | null;
    if (!doc) return { ok: false as const, error: 'document_not_found' };
    if (!doc.storage_path) return { ok: false as const, error: 'not_a_pdf' };

    const { data: file, error: dlErr } = await admin.storage.from('documents').download(doc.storage_path);
    if (dlErr || !file) return { ok: false as const, error: 'download_failed' };
    const base64 = Buffer.from(await file.arrayBuffer()).toString('base64');

    const safeName = `${doc.title.replace(/[^a-zA-Z0-9-_ ]/g, '').trim() || 'document'}.pdf`;
    const res = await sendEmail({
      to: parsedInput.to,
      subject: `${doc.title}`,
      html: `<!DOCTYPE html><html><body style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;background:#fafafa;padding:32px;">
<div style="max-width:520px;margin:auto;background:#fff;border:1px solid #e4e4e7;border-radius:12px;padding:28px;">
<h1 style="font-size:18px;margin:0 0 8px;">${doc.title}</h1>
<p style="color:#3f3f46;font-size:14px;line-height:1.5;">Veuillez trouver ci-joint votre document.</p>
<p style="color:#a1a1aa;font-size:11px;">Capsule IA</p></div></body></html>`,
      attachments: [{ filename: safeName, content: base64 }],
      organizationId: orgId,
      kind: 'document_email',
    });
    if (!res.ok) return { ok: false as const, error: 'send_failed' };
    return { ok: true as const };
  });
