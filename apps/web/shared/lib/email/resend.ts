import 'server-only';
import { Resend } from 'resend';
import { env } from '@/env.mjs';

const DEFAULT_FROM = 'Capsule IA <onboarding@resend.dev>';

let _client: Resend | null = null;
const client = () => {
  if (!env.RESEND_API_KEY) return null;
  _client ??= new Resend(env.RESEND_API_KEY);
  return _client;
};

// Pièce jointe Resend : contenu inline (base64) OU lien (path). Le fallback
// `path` sert quand un document dépasse le seuil d'attache et est transmis en
// lien plutôt qu'inline (cf. shared/lib/funders/attachments.ts).
export type EmailAttachment = {
  filename: string;
  content?: string;
  path?: string;
};

export type SendEmailInput = {
  to: string | string[];
  subject: string;
  html: string;
  replyTo?: string;
  attachments?: EmailAttachment[];
};

export type SendEmailResult =
  | { ok: true; id: string }
  | { ok: false; reason: 'no_api_key' | 'send_failed'; error?: unknown };

export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const c = client();
  if (!c) return { ok: false, reason: 'no_api_key' };

  try {
    const { data, error } = await c.emails.send({
      from: env.EMAIL_FROM ?? DEFAULT_FROM,
      to: input.to,
      subject: input.subject,
      html: input.html,
      replyTo: input.replyTo,
      attachments: input.attachments?.map((a) => ({
        filename: a.filename,
        ...(a.content ? { content: a.content } : {}),
        ...(a.path ? { path: a.path } : {}),
      })),
    });
    if (error || !data) return { ok: false, reason: 'send_failed', error };
    return { ok: true, id: data.id };
  } catch (error) {
    return { ok: false, reason: 'send_failed', error };
  }
}
