/**
 * Lien envoyé par e-mail (invitation, connexion, réinitialisation).
 *
 * On n'envoie jamais le lien brut de Supabase (`action_link`) : après
 * vérification, il renvoie la session dans le fragment de l'URL (`#access_token`),
 * que le serveur ne reçoit pas. Le nouvel arrivant n'était donc jamais
 * connecté — et, dans un navigateur déjà ouvert sur un autre compte, c'est ce
 * compte-là qui entrait (invitation formateur ramenée à l'accueil de l'admin).
 *
 * Le lien pointe vers `/auth/callback` avec le jeton haché : la route l'échange
 * côté serveur contre une session (qui remplace toute session existante), puis
 * redirige vers `next`.
 */

export type EmailLinkType = 'invite' | 'magiclink' | 'recovery';

export function authCallbackLink(baseUrl: string, hashedToken: string, type: EmailLinkType, next: string): string {
  const url = new URL('/auth/callback', `${baseUrl.replace(/\/$/, '')}/`);
  url.searchParams.set('token_hash', hashedToken);
  url.searchParams.set('type', type);
  url.searchParams.set('next', next.startsWith('/') && !next.startsWith('//') ? next : '/');
  return url.toString();
}

/** Destination après le choix du mot de passe : interne uniquement. */
export function safeInternalPath(target: string | null | undefined, fallback = '/'): string {
  return target && target.startsWith('/') && !target.startsWith('//') ? target : fallback;
}
