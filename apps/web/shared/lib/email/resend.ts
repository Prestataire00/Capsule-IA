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
const fromAddress = (): string => {
  // EMAIL_FROM n'est utilisé que s'il contient une vraie adresse (ex. « Nom <a@b.c> »).
  // Une valeur sans « @ » (ex. « Capsule IA » seul) est invalide → on la ignore et on
  // reconstruit depuis SMTP_USER, sinon on retombe sur le défaut Resend.
  const configured = env.EMAIL_FROM?.trim();
  if (configured && configured.includes('@')) return configured;
  if (env.SMTP_USER) return `Capsule IA <${env.SMTP_USER}>`;
  return DEFAULT_FROM;
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
  // Contexte d'audit (optionnel) : les appelants enrichissent au fil de l'eau.
  organizationId?: string;
  dossierId?: string;
  kind?: string;
  /** Contexte d'envoi journalisé (ex. feuille d'émargement), utilisé pour ne pas renvoyer deux fois. */
  metadata?: Record<string, unknown>;
  /**
   * Clé d'unicité de l'envoi (0180). Quand elle est fournie, elle est RÉSERVÉE
   * en base avant l'envoi : un second appel avec la même clé ne part pas.
   * C'est la base qui arbitre, pas une lecture préalable — un `SELECT` puis
   * `continue` ne résiste ni au rejeu ni à deux crons simultanés.
   */
  idempotencyKey?: string;
};

export type SendEmailResult =
  | { ok: true; id: string }
  | { ok: false; reason: 'no_api_key' | 'send_failed' | 'duplicate'; error?: unknown };

export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const from = fromAddress();
  let result: SendEmailResult;

  // Réservation : si la clé est déjà prise, cet e-mail est déjà parti.
  const reservation = await reserverEnvoi(input);
  if (reservation.deja) return { ok: false, reason: 'duplicate' };

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
    await logEmailSend(input, result, reservation.id);
    return result;
  }

  // ── Voie Resend (fallback si pas de SMTP) ──
  const c = client();
  if (!c) {
    // Sans transporteur, rien ne part : la clé réservée doit être libérée,
    // sinon l'envoi resterait bloqué pour toujours une fois la clé configurée.
    const echec = { ok: false as const, reason: 'no_api_key' as const };
    await logEmailSend(input, echec, reservation.id);
    return echec;
  }
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

  await logEmailSend(input, result, reservation.id);
  return result;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const adminClient = () =>
  createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

/** Violation d'unicité Postgres : la clé était déjà réservée. */
const DEJA_RESERVE = '23505';

/**
 * Réserve la clé d'unicité AVANT l'envoi (0180).
 *
 * L'ordre importe : réserver puis envoyer garantit qu'un second appel — rejeu
 * HTTP, second passage du cron, deux instances en parallèle — se heurte à la
 * contrainte au lieu d'envoyer un doublon. L'inverse (envoyer puis journaliser)
 * laisse une fenêtre grande ouverte.
 *
 * Sans clé, rien n'est réservé : l'envoi reste répétable, comme avant.
 */
async function reserverEnvoi(input: SendEmailInput): Promise<{ deja: boolean; id: string | null }> {
  if (!input.idempotencyKey) return { deja: false, id: null };
  try {
    const { data, error } = await adminClient()
      .schema('app')
      .from('email_log' as never)
      .insert({
        organization_id: input.organizationId ?? null,
        dossier_id: input.dossierId ?? null,
        kind: input.kind ?? null,
        recipient: Array.isArray(input.to) ? input.to.join(', ') : input.to,
        subject: input.subject,
        status: 'pending',
        idempotency_key: input.idempotencyKey,
        metadata: input.metadata ?? {},
      } as never)
      .select('id')
      .single();
    if (error) {
      if (error.code === DEJA_RESERVE) return { deja: true, id: null };
      // La colonne manque (migration 0180 non appliquée) ou la base est
      // indisponible : on envoie plutôt que de bloquer une convocation, en le
      // disant clairement dans les journaux.
      console.error('[email_log] réservation impossible, envoi sans garde', error.message);
      return { deja: false, id: null };
    }
    return { deja: false, id: (data as { id: string } | null)?.id ?? null };
  } catch (err) {
    console.error('[email_log] réservation impossible, envoi sans garde', err);
    return { deja: false, id: null };
  }
}

/**
 * Journalise chaque envoi dans app.email_log — best-effort, non bloquant.
 * Toute erreur d'écriture est tracée (console.error, red line #6 : on ne l'avale
 * pas silencieusement) mais ne modifie JAMAIS le résultat de l'envoi ni ne throw.
 * Écriture en service_role (aucune policy INSERT pour authenticated).
 *
 * Quand l'envoi avait été réservé, on complète la ligne existante. Un envoi
 * parti reste marqué `sent` avec sa clé ; un envoi en échec libère la clé, pour
 * qu'une reprise puisse repartir — ce qui n'est jamais parti doit pouvoir
 * partir.
 */
async function logEmailSend(
  input: SendEmailInput,
  result: SendEmailResult,
  reservationId: string | null,
): Promise<void> {
  try {
    const admin = adminClient();
    const error = result.ok
      ? null
      : 'error' in result && result.error !== undefined
        ? typeof result.error === 'string'
          ? result.error
          : JSON.stringify(result.error)
        : result.reason;

    if (reservationId) {
      const { error: updateError } = await admin
        .schema('app')
        .from('email_log' as never)
        .update({
          status: result.ok ? 'sent' : 'failed',
          provider_id: result.ok ? result.id : null,
          error,
          idempotency_key: result.ok ? input.idempotencyKey : null,
          sent_at: new Date().toISOString(),
        } as never)
        .eq('id', reservationId);
      if (updateError) console.error('[email_log] update failed', updateError);
      return;
    }

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
        metadata: input.metadata ?? {},
      } as never);
    if (insertError) console.error('[email_log] insert failed', insertError);
  } catch (err) {
    console.error('[email_log] logging failed', err);
  }
}
