'use server';

import { redirect } from 'next/navigation';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { LoginSchema, type LoginInput } from './schema';
import { resolveLanding, hasTrainerSpace } from '@/shared/lib/auth/landing';
import { getCurrentMember } from '@/shared/lib/auth/current-member';
import { destinationAutorisee } from '@/shared/lib/auth/trainer-routes';

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

  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) redirect('/');

  // Une destination explicite (page demandée avant connexion) prime — mais
  // seulement si elle est atteignable. Elle était rejouée telle quelle : un
  // administrateur dont l'onglet était resté sur l'espace formateur y était
  // renvoyé, puis refoulé par le garde avec un message alarmant sur son compte.
  const demandee = parsed.data.redirectedFrom ? safeRedirect(parsed.data.redirectedFrom) : null;
  if (demandee) {
    const [membre, formateur] = await Promise.all([getCurrentMember(), hasTrainerSpace(user.id)]);
    if (destinationAutorisee(demandee, { estMembre: Boolean(membre), estFormateur: formateur })) {
      redirect(demandee);
    }
  }

  // Sinon on aiguille selon l'identité : l'espace de l'organisme pour un
  // membre, l'espace formateur pour un formateur sans rôle interne (CAP-29).
  redirect((await resolveLanding(user.id)) ?? '/login?motif=aucun-acces');
}

/** Déconnexion : invalide la session et renvoie vers la page de connexion. */
export async function logout(): Promise<void> {
  const sb = supabaseServer();
  await sb.auth.signOut();
  redirect('/login');
}
