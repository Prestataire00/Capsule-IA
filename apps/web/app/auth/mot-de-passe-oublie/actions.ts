'use server';

import { headers } from 'next/headers';
import { z } from 'zod';
import { env } from '@/env.mjs';
import { supabaseServer } from '@/shared/lib/supabase/server';

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
 * Envoie un email de réinitialisation de mot de passe. Réponse volontairement
 * identique que l'adresse existe ou non (pas d'énumération de comptes).
 */
export async function requestPasswordReset(input: { email: string }): Promise<ForgotResult> {
  const parsed = EmailSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Adresse email invalide.' };

  const sb = supabaseServer();
  await sb.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${baseUrl()}/auth/callback?next=${encodeURIComponent('/auth/reset-password')}`,
  });

  return { ok: true };
}
