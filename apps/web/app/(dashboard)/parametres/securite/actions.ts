'use server';

import { createClient } from '@supabase/supabase-js';
import { env } from '@/env.mjs';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { ChangePasswordSchema, type ChangePasswordInput } from './schema';

type ChangePasswordResult = { ok: true } | { ok: false; error: string };

/**
 * Change le mot de passe de l'utilisateur connecté.
 * Vérifie d'abord le mot de passe actuel via un client jetable (sans toucher aux
 * cookies de session, pour ne pas dégrader une éventuelle session MFA), puis met
 * à jour via la session réelle.
 */
export async function changePasswordAction(input: ChangePasswordInput): Promise<ChangePasswordResult> {
  const parsed = ChangePasswordSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Saisie invalide.' };
  }

  const sb = supabaseServer();
  const { data: auth } = await sb.auth.getUser();
  const email = auth.user?.email;
  if (!email) return { ok: false, error: 'Session expirée, reconnectez-vous.' };

  // Vérifie le mot de passe actuel sans modifier la session courante.
  const verifier = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error: signErr } = await verifier.auth.signInWithPassword({
    email,
    password: parsed.data.currentPassword,
  });
  if (signErr) return { ok: false, error: 'Mot de passe actuel incorrect.' };

  const { error: updErr } = await sb.auth.updateUser({ password: parsed.data.newPassword });
  if (updErr) {
    const different = /different|should be|same/i.test(updErr.message);
    return {
      ok: false,
      error: different
        ? 'Le nouveau mot de passe doit être différent de l’ancien.'
        : 'Impossible de mettre à jour le mot de passe. Réessayez.',
    };
  }

  return { ok: true };
}
