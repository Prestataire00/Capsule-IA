import 'server-only';
import { Resend } from 'resend';
import { env } from '@/env.mjs';

const DEFAULT_FROM = 'i-a-infinity <onboarding@resend.dev>';

let _client: Resend | null = null;
const client = () => {
  if (!env.RESEND_API_KEY) return null;
  _client ??= new Resend(env.RESEND_API_KEY);
  return _client;
};

export type SendEmailInput = {
  to: string | string[];
  subject: string;
  html: string;
  replyTo?: string;
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
    });
    if (error || !data) return { ok: false, reason: 'send_failed', error };
    return { ok: true, id: data.id };
  } catch (error) {
    return { ok: false, reason: 'send_failed', error };
  }
}
