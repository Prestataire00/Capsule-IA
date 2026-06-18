'use server';

import { redirect } from 'next/navigation';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { LoginSchema, type LoginInput } from './schema';

type LoginResult = { ok: false; error: string };

/** N'autorise qu'une redirection interne (même origine), sinon retombe sur l'accueil. */
function safeRedirect(target: string | undefined): string {
  if (target && target.startsWith('/') && !target.startsWith('//')) return target;
  return '/';
}

/**
 * Connexion email + mot de passe. En cas de succès, écrit les cookies de session
 * (via le client serveur Supabase) et redirige ; sinon renvoie un message d'erreur.
 */
export async function login(input: LoginInput): Promise<LoginResult> {
  const parsed = LoginSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Email ou mot de passe invalide.' };

  const sb = supabaseServer();
  const { error } = await sb.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (error) return { ok: false, error: 'Identifiants incorrects.' };

  redirect(safeRedirect(parsed.data.redirectedFrom));
}

/** Déconnexion : invalide la session et renvoie vers la page de connexion. */
export async function logout(): Promise<void> {
  const sb = supabaseServer();
  await sb.auth.signOut();
  redirect('/login');
}
