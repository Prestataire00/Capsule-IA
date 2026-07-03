'use server';

import { z } from 'zod';
import { supabaseServer } from '@/shared/lib/supabase/server';

const ResetSchema = z
  .object({
    newPassword: z.string().min(8, 'Au moins 8 caractères'),
    confirmPassword: z.string().min(1, 'Confirmation requise'),
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Les mots de passe ne correspondent pas',
  });

type ResetResult = { ok: true } | { ok: false; error: string };

/** Définit un nouveau mot de passe pour la session de récupération active. */
export async function setNewPassword(input: { newPassword: string; confirmPassword: string }): Promise<ResetResult> {
  const parsed = ResetSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Saisie invalide.' };

  const sb = supabaseServer();
  const { data: auth } = await sb.auth.getUser();
  if (!auth.user) return { ok: false, error: 'Lien expiré ou invalide. Redemandez un email de réinitialisation.' };

  const { error } = await sb.auth.updateUser({ password: parsed.data.newPassword });
  if (error) return { ok: false, error: 'Impossible de définir le mot de passe. Réessayez.' };

  return { ok: true };
}
