import 'server-only';
import { Resend } from 'resend';
import nodemailer, { type Transporter } from 'nodemailer';
import { createClient } from '@supabase/supabase-js';
import { env } from '@/env.mjs';

const DEFAULT_FROM = 'Capsule IA <onboarding@resend.dev>';

let _client: Resend | null = null;
const client = () => {
  if (!env.RESEND_API_KEY) return null;
  _client ??= new Resend(env.RESEND_API_KEY);
  return _client;
};

// Transport SMTP (boîte mail existante : IONOS, Gmail, etc.). Activé dès que
// SMTP_HOST/USER/PASS sont définis → envoi SANS vérification de domaine, en
// s'authentifiant sur la boîte. Prioritaire sur Resend quand configuré.
let _smtp: Transporter | null = null;
const smtpTransport = (): Transporter | null => {
  if (!env.SMTP_HOST || !env.SMTP_USER || !env.SMTP_PASS) return null;
  const port = env.SMTP_PORT ? Number(env.SMTP_PORT) : 587;
  _smtp ??= nodemailer.createTransport({
    host: env.SMTP_HOST,
    port,
    secure: port === 465, // 465 = SSL implicite ; 587 = STARTTLS
    auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
  });
  return _smtp;
};

// Expéditeur : EMAIL_FROM si défini, sinon la boîte SMTP, sinon le bac-à-sable Resend.
const fromAddress = (): string =>
  env.EMAIL_FROM ?? (env.SMTP_USER ? `Capsule IA <${env.SMTP_USER}>` : DEFAULT_FROM);

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
  // Contexte d'audit (optionnel) : les appelants enrichissent au fil de l'eau.
  organizationId?: string;
  dossierId?: string;
  kind?: string;
};

export type SendEmailResult =
  | { ok: true; id: string }
  | { ok: false; reason: 'no_api_key' | 'send_failed'; error?: unknown };

export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const from = fromAddress();
  let result: SendEmailResult;

  // ── Voie SMTP (prioritaire si configurée) — pas de vérification de domaine ──
  const transport = smtpTransport();
  if (transport) {
    try {
      const info = await transport.sendMail({
        from,
        to: input.to,
        subject: input.subject,
        html: input.html,
        replyTo: input.replyTo,
        attachments: input.attachments?.map((a) => ({
          filename: a.filename,
          ...(a.content ? { content: Buffer.from(a.content, 'base64') } : {}),
          ...(a.path ? { path: a.path } : {}),
        })),
      });
      result = { ok: true, id: info.messageId };
    } catch (error) {
      result = { ok: false, reason: 'send_failed', error };
    }
    await logEmailSend(input, result);
    return result;
  }

  // ── Voie Resend (fallback si pas de SMTP) ──
  const c = client();
  if (!c) return { ok: false, reason: 'no_api_key' };
  try {
    const { data, error } = await c.emails.send({
      from,
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
    result = error || !data ? { ok: false, reason: 'send_failed', error } : { ok: true, id: data.id };
  } catch (error) {
    result = { ok: false, reason: 'send_failed', error };
  }

  await logEmailSend(input, result);
  return result;
}

/**
 * Journalise chaque envoi dans app.email_log — best-effort, non bloquant.
 * Toute erreur d'écriture est tracée (console.error, red line #6 : on ne l'avale
 * pas silencieusement) mais ne modifie JAMAIS le résultat de l'envoi ni ne throw.
 * Écriture en service_role (aucune policy INSERT pour authenticated).
 */
async function logEmailSend(input: SendEmailInput, result: SendEmailResult): Promise<void> {
  try {
    const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });
    const error = result.ok
      ? null
      : 'error' in result && result.error !== undefined
        ? typeof result.error === 'string'
          ? result.error
          : JSON.stringify(result.error)
        : result.reason;
    const { error: insertError } = await admin
      .schema('app')
      .from('email_log' as never)
      .insert({
        organization_id: input.organizationId ?? null,
        dossier_id: input.dossierId ?? null,
        kind: input.kind ?? null,
        recipient: Array.isArray(input.to) ? input.to.join(', ') : input.to,
        subject: input.subject,
        status: result.ok ? 'sent' : 'failed',
        provider_id: result.ok ? result.id : null,
        error,
      } as never);
    if (insertError) console.error('[email_log] insert failed', insertError);
  } catch (err) {
    console.error('[email_log] logging failed', err);
  }
}
