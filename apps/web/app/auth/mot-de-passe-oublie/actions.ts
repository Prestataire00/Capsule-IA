'use server';

import { headers } from 'next/headers';
import { z } from 'zod';
import { env } from '@/env.mjs';
import { supabaseAdmin } from '@/shared/lib/supabase/admin';
import { sendEmail } from '@/shared/lib/email/resend';
import { passwordResetEmail } from '@/shared/lib/email/templates';
import { authCallbackLink } from '@/shared/lib/auth/email-link';

const EmailSchema = z.object({ email: z.string().email() });

type ForgotResult = { ok: true } | { ok: false; error: string };

function baseUrl(): string {
  if (env.PUBLIC_APP_URL) return env.PUBLIC_APP_URL.replace(/\/$/, '');
  const h = headers();
  const host = h.get('host') ?? 'localhost:3000';
  const proto = h.get('x-forwarded-proto') ?? 'https';
  return `${proto}://${host}`;
}

/**
 * Réinitialisation de mot de passe. On génère nous-mêmes le lien de récupération
 * (admin API) puis on l'envoie via l'email de l'app (Resend/SMTP) — l'email
 * intégré de Supabase Auth n'est pas fiable en prod sans SMTP custom.
 * Réponse volontairement identique que l'adresse existe ou non (anti-énumération).
 */
export async function requestPasswordReset(input: { email: string }): Promise<ForgotResult> {
  const parsed = EmailSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Adresse email invalide.' };

  const email = parsed.data.email;

  try {
    const admin = supabaseAdmin();
    const { data, error } = await admin.auth.admin.generateLink({ type: 'recovery', email });

    const hash = data?.properties?.hashed_token;
    // Compte inexistant / erreur : on répond ok sans rien divulguer (anti-énumération).
    if (error || !hash) {
      if (error) console.error('[requestPasswordReset] generateLink', error.message);
      return { ok: true };
    }
    const link = authCallbackLink(baseUrl(), hash, 'recovery', '/auth/reset-password');

    const tpl = passwordResetEmail({ resetUrl: link });
    const r = await sendEmail({ to: email, subject: tpl.subject, html: tpl.html, kind: 'password_reset' });
    if (!r.ok && r.reason !== 'no_api_key') {
      console.error('[requestPasswordReset] sendEmail', r);
    }
  } catch (e) {
    console.error('[requestPasswordReset] failed', e);
  }

  return { ok: true };
}
