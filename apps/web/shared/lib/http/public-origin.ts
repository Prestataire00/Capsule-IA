import { env } from '@/env.mjs';

/**
 * Origine publique de l'application, pour construire une redirection.
 *
 * Derrière le proxy de Railway, `req.url` porte l'adresse interne du serveur
 * (`https://localhost:5000`) : une redirection fondée dessus envoyait
 * l'utilisateur sur localhost (lien d'invitation formateur). On prend
 * l'adresse publique configurée, sinon celle transmise par le proxy.
 */
export function resolvePublicOrigin(appUrl: string | undefined, headers: Headers, fallback: string): string {
  if (appUrl) return appUrl.replace(/\/$/, '');
  const host = headers.get('x-forwarded-host')?.split(',')[0]?.trim() || headers.get('host');
  const proto = headers.get('x-forwarded-proto')?.split(',')[0]?.trim() || 'https';
  return host ? `${proto}://${host}` : fallback;
}

export function publicOrigin(req: Request): string {
  return resolvePublicOrigin(env.PUBLIC_APP_URL, req.headers, new URL(req.url).origin);
}
