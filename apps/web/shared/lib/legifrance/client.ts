import 'server-only';
import { env } from '@/env.mjs';
import type { ArticleRef } from './mapping';

const OAUTH_URL = 'https://oauth.piste.gouv.fr/api/oauth/token';
const API_BASE = 'https://api.piste.gouv.fr/dila/legifrance/lf-engine-app';

let _token: { value: string; expiresAt: number } | null = null;

async function getToken(): Promise<string | null> {
  if (!env.LEGIFRANCE_CLIENT_ID || !env.LEGIFRANCE_CLIENT_SECRET) return null;
  if (_token && _token.expiresAt > Date.now() + 30_000) return _token.value;
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: env.LEGIFRANCE_CLIENT_ID,
    client_secret: env.LEGIFRANCE_CLIENT_SECRET,
    scope: 'openid',
  });
  const res = await fetch(OAUTH_URL, { method: 'POST', body });
  if (!res.ok) return null;
  const json = (await res.json()) as { access_token: string; expires_in: number };
  _token = { value: json.access_token, expiresAt: Date.now() + json.expires_in * 1000 };
  return _token.value;
}

export type FetchedArticle = { ref: string; texte: string };

// Renvoie null si pas de clés PISTE / échec (l'appelant gère le message).
export async function fetchArticle(a: ArticleRef): Promise<FetchedArticle | null> {
  const token = await getToken();
  if (!token) return null;
  const res = await fetch(`${API_BASE}/consult/getArticle`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: a.numero }),
  });
  if (!res.ok) return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const json = (await res.json()) as any;
  const texte: string = json?.article?.texte ?? json?.article?.texteHtml ?? '';
  return texte ? { ref: a.numero, texte } : null;
}
