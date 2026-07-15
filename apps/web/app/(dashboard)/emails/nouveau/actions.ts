'use server';

import { z } from 'zod';
import { authActionClient } from '@/shared/lib/safe-action';
import { sendEmail } from '@/shared/lib/email/resend';
import { generateEmailDraft, type RecipientType } from '@/features/emails/generate-email';

const RECIPIENT_TYPES = ['apprenant', 'formateur', 'entreprise'] as const;

type ResolvedRecipient = {
  email: string;
  name: string;
  companyName: string | null;
  detail: string | null;
};

// Résout une fiche à partir de son type + id via le client RLS (l'utilisateur ne
// peut adresser que les fiches de son organisation). Jamais l'email fourni par le
// client : on relit toujours l'adresse en base.
async function resolveRecipient(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sb: any,
  type: RecipientType,
  id: string,
): Promise<ResolvedRecipient | null> {
  if (type === 'apprenant') {
    const { data } = await sb
      .schema('app')
      .from('learners')
      .select('first_name, last_name, email, position, company:companies(name)')
      .eq('id', id)
      .is('deleted_at', null)
      .maybeSingle();
    if (!data?.email) return null;
    const company = (data.company as { name: string } | null)?.name ?? null;
    return {
      email: data.email,
      name: `${data.first_name ?? ''} ${data.last_name ?? ''}`.trim() || data.email,
      companyName: company,
      detail: data.position ? `Poste : ${data.position}` : null,
    };
  }

  if (type === 'formateur') {
    const { data } = await sb
      .schema('app')
      .from('trainers')
      .select('first_name, last_name, email, specialties')
      .eq('id', id)
      .is('deleted_at', null)
      .maybeSingle();
    if (!data?.email) return null;
    const specialties = Array.isArray(data.specialties) ? data.specialties : [];
    return {
      email: data.email,
      name: `${data.first_name ?? ''} ${data.last_name ?? ''}`.trim() || data.email,
      companyName: null,
      detail: specialties.length ? `Spécialités : ${specialties.join(', ')}` : null,
    };
  }

  // entreprise
  const { data } = await sb
    .schema('app')
    .from('companies')
    .select('name, contact_email')
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle();
  if (!data?.contact_email) return null;
  return {
    email: data.contact_email,
    name: data.name as string,
    companyName: data.name as string,
    detail: null,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function resolveOrg(sb: any): Promise<{ id: string; name: string } | null> {
  const { data } = await sb.schema('app').from('organizations').select('id, name').limit(1).maybeSingle();
  if (!data?.id) return null;
  return { id: data.id, name: (data.name as string | null) ?? 'Votre organisme' };
}

const escapeHtml = (s: string) =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

// Enveloppe le corps (texte) dans le gabarit HTML — reprend le style des emails
// transactionnels existants. Les paragraphes deviennent des <p>, les retours
// simples des <br>.
const bodyToHtml = (body: string) => {
  const paragraphs = body
    .split(/\n{2,}/)
    .map((p) => `<p style="color:#3f3f46;font-size:14px;line-height:1.6;margin:0 0 14px;">${escapeHtml(p).replace(/\n/g, '<br>')}</p>`)
    .join('');
  return `<!DOCTYPE html><html><body style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;background:#fafafa;padding:32px;">
<div style="max-width:560px;margin:auto;background:#fff;border:1px solid #e4e4e7;border-radius:12px;padding:28px;">
${paragraphs}
</div></body></html>`;
};

// ── Action 1 : génère une proposition d'email à partir de la fiche + objet ──
export const generateEmailDraftAction = authActionClient
  .schema(
    z.object({
      recipientType: z.enum(RECIPIENT_TYPES),
      recipientId: z.string().uuid(),
      subject: z.string().trim().min(1, 'Précisez un objet.'),
      instructions: z.string().trim().max(500).optional(),
    }),
  )
  .action(async ({ parsedInput, ctx }) => {
    const recipient = await resolveRecipient(ctx.supabase, parsedInput.recipientType, parsedInput.recipientId);
    if (!recipient) return { ok: false as const, error: 'recipient_not_found' };
    const org = await resolveOrg(ctx.supabase);
    if (!org) return { ok: false as const, error: 'no_org' };

    const res = await generateEmailDraft({
      recipientType: parsedInput.recipientType,
      recipientName: recipient.name,
      companyName: recipient.companyName,
      detail: recipient.detail,
      subject: parsedInput.subject,
      senderName: ctx.email || org.name,
      orgName: org.name,
      instructions: parsedInput.instructions ?? null,
    });

    if (!res.ok) return { ok: false as const, error: res.reason };
    return { ok: true as const, subject: res.subject, body: res.body, recipientEmail: recipient.email };
  });

// ── Action 2 : envoie l'email via la boîte connectée (SMTP/Resend) + journal ──
export const sendComposedEmailAction = authActionClient
  .schema(
    z.object({
      recipientType: z.enum(RECIPIENT_TYPES),
      recipientId: z.string().uuid(),
      subject: z.string().trim().min(1),
      body: z.string().trim().min(1),
    }),
  )
  .action(async ({ parsedInput, ctx }) => {
    const recipient = await resolveRecipient(ctx.supabase, parsedInput.recipientType, parsedInput.recipientId);
    if (!recipient) return { ok: false as const, error: 'recipient_not_found' };
    const org = await resolveOrg(ctx.supabase);

    const res = await sendEmail({
      to: recipient.email,
      subject: parsedInput.subject,
      html: bodyToHtml(parsedInput.body),
      replyTo: ctx.email || undefined,
      organizationId: org?.id,
      kind: 'manual',
    });

    if (!res.ok) {
      return { ok: false as const, error: res.reason === 'no_api_key' ? 'no_mailbox' : 'send_failed' };
    }
    return { ok: true as const, to: recipient.email };
  });
