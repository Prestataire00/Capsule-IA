import 'server-only';
import { randomUUID } from 'node:crypto';
import { env } from '@/env.mjs';
import { ok, err, type Result } from '@/shared/lib/result';
import type { GoogleCalendarCredentials } from './google-secrets-cipher';

const OAUTH_AUTHORIZE = 'https://accounts.google.com/o/oauth2/v2/auth';
const OAUTH_TOKEN = 'https://oauth2.googleapis.com/token';
const USERINFO = 'https://openidconnect.googleapis.com/v1/userinfo';
const CAL_API = 'https://www.googleapis.com/calendar/v3';
const SCOPE = 'https://www.googleapis.com/auth/calendar.events openid email';

export type GoogleApiError = 'not_configured' | 'token_failed' | 'request_failed' | 'invalid_response';

/** URL de consentement Google (offline + prompt=consent pour obtenir un refresh token). */
export function googleOAuthAuthorizeUrl(args: { state: string; redirectUri: string }): string | null {
  if (!env.GOOGLE_CLIENT_ID) return null;
  const p = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    redirect_uri: args.redirectUri,
    response_type: 'code',
    scope: SCOPE,
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
    state: args.state,
  });
  return `${OAUTH_AUTHORIZE}?${p.toString()}`;
}

/** Échange le code OAuth contre un refresh token + access token. */
export async function exchangeCodeForTokens(args: {
  code: string;
  redirectUri: string;
}): Promise<Result<{ refreshToken: string; accessToken: string }, GoogleApiError>> {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) return err('not_configured');
  try {
    const res = await fetch(OAUTH_TOKEN, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code: args.code,
        client_id: env.GOOGLE_CLIENT_ID,
        client_secret: env.GOOGLE_CLIENT_SECRET,
        redirect_uri: args.redirectUri,
        grant_type: 'authorization_code',
      }),
    });
    if (!res.ok) return err('token_failed');
    const j = (await res.json()) as { refresh_token?: string; access_token?: string };
    if (!j.refresh_token || !j.access_token) return err('invalid_response');
    return ok({ refreshToken: j.refresh_token, accessToken: j.access_token });
  } catch {
    return err('request_failed');
  }
}

export async function fetchAccountEmail(accessToken: string): Promise<string | null> {
  try {
    const res = await fetch(USERINFO, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!res.ok) return null;
    const j = (await res.json()) as { email?: string };
    return j.email ?? null;
  } catch {
    return null;
  }
}

const tokenCache = new Map<string, { token: string; expiresAt: number }>();

async function accessTokenFor(refreshToken: string): Promise<Result<string, GoogleApiError>> {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) return err('not_configured');
  const cached = tokenCache.get(refreshToken);
  if (cached && cached.expiresAt > Date.now() + 30_000) return ok(cached.token);
  try {
    const res = await fetch(OAUTH_TOKEN, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: env.GOOGLE_CLIENT_ID,
        client_secret: env.GOOGLE_CLIENT_SECRET,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }),
    });
    if (!res.ok) return err('token_failed');
    const j = (await res.json()) as { access_token?: string; expires_in?: number };
    if (!j.access_token) return err('invalid_response');
    tokenCache.set(refreshToken, { token: j.access_token, expiresAt: Date.now() + (j.expires_in ?? 3600) * 1000 });
    return ok(j.access_token);
  } catch {
    return err('request_failed');
  }
}

export type MeetLink = { meetUrl: string; eventId: string };

/** Logique pure : extrait le lien Meet (hangoutLink) et l'id de la réponse évènement. */
export function parseEventResponse(json: unknown): Result<MeetLink, 'invalid_response'> {
  if (!json || typeof json !== 'object') return err('invalid_response');
  const j = json as { id?: unknown; hangoutLink?: unknown; conferenceData?: unknown };
  let meetUrl: string | null = typeof j.hangoutLink === 'string' ? j.hangoutLink : null;
  if (!meetUrl && j.conferenceData && typeof j.conferenceData === 'object') {
    const eps = (j.conferenceData as { entryPoints?: Array<{ entryPointType?: string; uri?: string }> }).entryPoints;
    const video = eps?.find((e) => e.entryPointType === 'video' && typeof e.uri === 'string');
    if (video?.uri) meetUrl = video.uri;
  }
  if (!meetUrl || !/^https?:\/\//.test(meetUrl) || typeof j.id !== 'string') return err('invalid_response');
  return ok({ meetUrl, eventId: j.id });
}

export type MeetEventInput = {
  title: string;
  startsAt: string; // ISO
  endsAt: string; // ISO
  attendeeEmails: string[];
  description?: string;
};

/** Crée un évènement Google Agenda avec conférence Meet et invite les participants. */
export async function createMeetEvent(
  creds: GoogleCalendarCredentials,
  input: MeetEventInput,
): Promise<Result<MeetLink, GoogleApiError>> {
  const t = await accessTokenFor(creds.refreshToken);
  if (!t.ok) return err(t.error);

  const calendarId = encodeURIComponent(creds.calendarId || 'primary');
  const body = {
    summary: input.title,
    description: input.description ?? '',
    start: { dateTime: input.startsAt },
    end: { dateTime: input.endsAt },
    attendees: input.attendeeEmails.filter(Boolean).map((email) => ({ email })),
    conferenceData: {
      createRequest: { requestId: randomUUID(), conferenceSolutionKey: { type: 'hangoutsMeet' } },
    },
  };
  try {
    const res = await fetch(
      `${CAL_API}/calendars/${calendarId}/events?conferenceDataVersion=1&sendUpdates=all`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${t.value}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      },
    );
    if (!res.ok) return err('request_failed');
    return parseEventResponse(await res.json().catch(() => null));
  } catch {
    return err('request_failed');
  }
}

/** Test léger de la connexion (liste des agendas). */
export async function testConnection(
  creds: GoogleCalendarCredentials,
): Promise<Result<true, GoogleApiError>> {
  const t = await accessTokenFor(creds.refreshToken);
  if (!t.ok) return err(t.error);
  try {
    const res = await fetch(`${CAL_API}/users/me/calendarList?maxResults=1`, {
      headers: { Authorization: `Bearer ${t.value}` },
    });
    return res.ok ? ok(true) : err('request_failed');
  } catch {
    return err('request_failed');
  }
}
