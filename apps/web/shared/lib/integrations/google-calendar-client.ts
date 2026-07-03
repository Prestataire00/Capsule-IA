import 'server-only';
import { randomUUID } from 'node:crypto';
import { env } from '@/env.mjs';
import { ok, err, type Result } from '@/shared/lib/result';
import type { GoogleCalendarCredentials } from './google-secrets-cipher';

const OAUTH_AUTHORIZE = 'https://accounts.google.com/o/oauth2/v2/auth';
const OAUTH_TOKEN = 'https://oauth2.googleapis.com/token';
const USERINFO = 'https://openidconnect.googleapis.com/v1/userinfo';
const CAL_API = 'https://www.googleapis.com/calendar/v3';
const SCOPE =
  'https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.readonly openid email';

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

export type CalEvent = {
  id: string;
  title: string;
  start: string; // ISO (dateTime) ou date (YYYY-MM-DD pour journée entière)
  end: string | null;
  allDay: boolean;
  location: string | null;
  htmlLink: string | null;
  hangoutLink: string | null;
};

/** Logique pure : normalise la réponse `events.list` de Google en CalEvent[] triés par début. */
export function parseEventsList(json: unknown): CalEvent[] {
  if (!json || typeof json !== 'object') return [];
  const items = (json as { items?: unknown }).items;
  if (!Array.isArray(items)) return [];
  const events: CalEvent[] = [];
  for (const raw of items) {
    if (!raw || typeof raw !== 'object') continue;
    const e = raw as {
      id?: unknown;
      summary?: unknown;
      status?: unknown;
      location?: unknown;
      htmlLink?: unknown;
      hangoutLink?: unknown;
      start?: { dateTime?: unknown; date?: unknown };
      end?: { dateTime?: unknown; date?: unknown };
    };
    if (e.status === 'cancelled') continue;
    const startDateTime = typeof e.start?.dateTime === 'string' ? e.start.dateTime : null;
    const startDate = typeof e.start?.date === 'string' ? e.start.date : null;
    const start = startDateTime ?? startDate;
    if (typeof e.id !== 'string' || !start) continue;
    const endDateTime = typeof e.end?.dateTime === 'string' ? e.end.dateTime : null;
    const endDate = typeof e.end?.date === 'string' ? e.end.date : null;
    events.push({
      id: e.id,
      title: typeof e.summary === 'string' && e.summary.trim() ? e.summary : '(Sans titre)',
      start,
      end: endDateTime ?? endDate,
      allDay: !startDateTime,
      location: typeof e.location === 'string' ? e.location : null,
      htmlLink: typeof e.htmlLink === 'string' ? e.htmlLink : null,
      hangoutLink: typeof e.hangoutLink === 'string' ? e.hangoutLink : null,
    });
  }
  return events.sort((a, b) => a.start.localeCompare(b.start));
}

/** Liste les évènements d'UN agenda sur une fenêtre [timeMin, timeMax]. */
export async function listEvents(
  creds: GoogleCalendarCredentials,
  range: { timeMin: string; timeMax: string },
  calendarId?: string,
): Promise<Result<CalEvent[], GoogleApiError>> {
  const t = await accessTokenFor(creds.refreshToken);
  if (!t.ok) return err(t.error);
  const cal = encodeURIComponent(calendarId || creds.calendarId || 'primary');
  const p = new URLSearchParams({
    timeMin: range.timeMin,
    timeMax: range.timeMax,
    singleEvents: 'true',
    orderBy: 'startTime',
    maxResults: '100',
  });
  try {
    const res = await fetch(`${CAL_API}/calendars/${cal}/events?${p.toString()}`, {
      headers: { Authorization: `Bearer ${t.value}` },
    });
    if (!res.ok) return err('request_failed');
    return ok(parseEventsList(await res.json().catch(() => null)));
  } catch {
    return err('request_failed');
  }
}

/** Logique pure : ids des agendas depuis la réponse `calendarList.list`. */
export function parseCalendarIds(json: unknown): string[] {
  if (!json || typeof json !== 'object') return [];
  const items = (json as { items?: unknown }).items;
  if (!Array.isArray(items)) return [];
  const ids: string[] = [];
  for (const raw of items) {
    if (raw && typeof raw === 'object' && typeof (raw as { id?: unknown }).id === 'string') {
      ids.push((raw as { id: string }).id);
    }
  }
  return ids;
}

/** Liste les identifiants de tous les agendas de l'utilisateur (nécessite le scope calendar.readonly). */
export async function listCalendarIds(
  creds: GoogleCalendarCredentials,
): Promise<Result<string[], GoogleApiError>> {
  const t = await accessTokenFor(creds.refreshToken);
  if (!t.ok) return err(t.error);
  try {
    const res = await fetch(`${CAL_API}/users/me/calendarList?maxResults=250`, {
      headers: { Authorization: `Bearer ${t.value}` },
    });
    if (!res.ok) return err('request_failed');
    return ok(parseCalendarIds(await res.json().catch(() => null)));
  } catch {
    return err('request_failed');
  }
}

/** Logique pure : fusionne des listes d'évènements, dédoublonne par id et trie par début. */
export function mergeEvents(lists: CalEvent[][]): CalEvent[] {
  const byId = new Map<string, CalEvent>();
  for (const list of lists) {
    for (const e of list) if (!byId.has(e.id)) byId.set(e.id, e);
  }
  return Array.from(byId.values()).sort((a, b) => a.start.localeCompare(b.start));
}

/**
 * Agenda complet de l'utilisateur : agrège les évènements de TOUS ses agendas.
 * Repli sur l'agenda `primary` seul si l'énumération des agendas échoue
 * (scope calendar.readonly pas encore accordé → reconnexion requise pour tout voir).
 */
export async function listAgenda(
  creds: GoogleCalendarCredentials,
  range: { timeMin: string; timeMax: string },
): Promise<Result<CalEvent[], GoogleApiError>> {
  const cals = await listCalendarIds(creds);
  if (!cals.ok || cals.value.length === 0) {
    return listEvents(creds, range); // repli primary
  }
  const perCal = await Promise.all(cals.value.map((id) => listEvents(creds, range, id)));
  const ok0 = perCal.filter((r): r is Extract<typeof r, { ok: true }> => r.ok);
  if (ok0.length === 0) return listEvents(creds, range);
  return ok(mergeEvents(ok0.map((r) => r.value)));
}

/** Test léger de la connexion (liste des agendas). */
export async function testConnection(
  creds: GoogleCalendarCredentials,
): Promise<Result<true, GoogleApiError>> {
  const t = await accessTokenFor(creds.refreshToken);
  if (!t.ok) return err(t.error);
  try {
    // Endpoint couvert par le scope calendar.events (calendarList exigerait calendar.readonly).
    const calendarId = encodeURIComponent(creds.calendarId || 'primary');
    const res = await fetch(`${CAL_API}/calendars/${calendarId}/events?maxResults=1`, {
      headers: { Authorization: `Bearer ${t.value}` },
    });
    return res.ok ? ok(true) : err('request_failed');
  } catch {
    return err('request_failed');
  }
}
