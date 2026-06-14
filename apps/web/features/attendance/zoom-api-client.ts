import 'server-only';
import type { ZoomCredentials } from './zoom-secrets-cipher';

export type ZoomParticipant = {
  readonly email: string | null;
  readonly name: string | null;
  readonly joinTime: Date | null;
  readonly leaveTime: Date | null;
  readonly durationMinutes: number;
  readonly raw: Record<string, unknown>;
};

export type ZoomApiError =
  | { code: 'auth_failed'; detail: string }
  | { code: 'meeting_not_found' }
  | { code: 'recording_not_found' }
  | { code: 'rate_limited' }
  | { code: 'network'; detail: string };

export type ZoomRecording = {
  readonly externalId: string;
  readonly playUrl: string;
  readonly passcode: string | null;
  readonly durationSeconds: number | null;
  readonly recordedAt: string | null;
};

type CachedToken = { token: string; expiresAt: number };
const tokenCache = new Map<string, CachedToken>();

const getAccessToken = async (
  creds: ZoomCredentials,
): Promise<{ token: string } | { error: ZoomApiError }> => {
  const cacheKey = `${creds.accountId}:${creds.clientId}`;
  const cached = tokenCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now() + 30_000) {
    return { token: cached.token };
  }
  const basic = Buffer.from(`${creds.clientId}:${creds.clientSecret}`).toString('base64');
  let response: Response;
  try {
    response = await fetch(
      `https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${encodeURIComponent(creds.accountId)}`,
      { method: 'POST', headers: { Authorization: `Basic ${basic}` } },
    );
  } catch (e) {
    return { error: { code: 'network', detail: (e as Error).message } };
  }
  if (!response.ok) {
    const detail = `${response.status} ${await response.text()}`.slice(0, 200);
    return { error: { code: 'auth_failed', detail } };
  }
  const body = (await response.json()) as { access_token: string; expires_in: number };
  tokenCache.set(cacheKey, {
    token: body.access_token,
    expiresAt: Date.now() + body.expires_in * 1000,
  });
  return { token: body.access_token };
};

export const testZoomConnection = async (
  creds: ZoomCredentials,
): Promise<{ ok: true; accountEmail: string } | { ok: false; error: ZoomApiError }> => {
  const t = await getAccessToken(creds);
  if ('error' in t) return { ok: false, error: t.error };
  const r = await fetch('https://api.zoom.us/v2/users/me', {
    headers: { Authorization: `Bearer ${t.token}` },
  });
  if (!r.ok) {
    return { ok: false, error: { code: 'auth_failed', detail: `me ${r.status}` } };
  }
  const me = (await r.json()) as { email?: string };
  return { ok: true, accountEmail: me.email ?? '—' };
};

export const fetchPastMeetingParticipants = async (
  creds: ZoomCredentials,
  meetingId: string,
): Promise<{ ok: true; participants: ZoomParticipant[] } | { ok: false; error: ZoomApiError }> => {
  const t = await getAccessToken(creds);
  if ('error' in t) return { ok: false, error: t.error };

  const all: ZoomParticipant[] = [];
  let nextToken: string | undefined;
  do {
    const url = new URL(
      `https://api.zoom.us/v2/past_meetings/${encodeURIComponent(meetingId)}/participants`,
    );
    url.searchParams.set('page_size', '300');
    if (nextToken) url.searchParams.set('next_page_token', nextToken);
    let resp: Response;
    try {
      resp = await fetch(url, { headers: { Authorization: `Bearer ${t.token}` } });
    } catch (e) {
      return { ok: false, error: { code: 'network', detail: (e as Error).message } };
    }
    if (resp.status === 404) return { ok: false, error: { code: 'meeting_not_found' } };
    if (resp.status === 429) return { ok: false, error: { code: 'rate_limited' } };
    if (!resp.ok) return { ok: false, error: { code: 'network', detail: `${resp.status}` } };

    const body = (await resp.json()) as {
      participants: Array<Record<string, unknown>>;
      next_page_token?: string;
    };
    for (const p of body.participants) {
      const parseDate = (raw: unknown): Date | null => {
        if (typeof raw !== 'string' || !raw) return null;
        const d = new Date(raw);
        return Number.isNaN(d.getTime()) ? null : d;
      };
      const duration = typeof p.duration === 'number' ? Math.round(p.duration / 60) : 0;
      all.push({
        email: typeof p.user_email === 'string' ? p.user_email : null,
        name: typeof p.name === 'string' ? p.name : null,
        joinTime: parseDate(p.join_time),
        leaveTime: parseDate(p.leave_time),
        durationMinutes: duration,
        raw: p,
      });
    }
    nextToken =
      typeof body.next_page_token === 'string' && body.next_page_token.length > 0
        ? body.next_page_token
        : undefined;
  } while (nextToken);

  return { ok: true, participants: all };
};

type ZoomRecordingFileRaw = {
  id?: unknown;
  file_type?: unknown;
  play_url?: unknown;
  recording_start?: unknown;
};

type ZoomRecordingsBodyRaw = {
  recording_files?: ZoomRecordingFileRaw[];
  recording_play_passcode?: unknown;
  password?: unknown;
  duration?: unknown;
};

export function mapZoomRecordings(body: unknown): ZoomRecording[] {
  if (!body || typeof body !== 'object') return [];
  const raw = body as ZoomRecordingsBodyRaw;
  if (!Array.isArray(raw.recording_files)) return [];

  const passcode =
    typeof raw.recording_play_passcode === 'string' && raw.recording_play_passcode.length > 0
      ? raw.recording_play_passcode
      : typeof raw.password === 'string' && raw.password.length > 0
        ? raw.password
        : null;

  const durationSeconds =
    typeof raw.duration === 'number' && raw.duration > 0 ? raw.duration * 60 : null;

  const result: ZoomRecording[] = [];
  for (const file of raw.recording_files) {
    if (file.file_type !== 'MP4') continue;
    if (typeof file.id !== 'string' || !file.id) continue;
    if (typeof file.play_url !== 'string' || !file.play_url) continue;
    result.push({
      externalId: file.id,
      playUrl: file.play_url,
      passcode,
      durationSeconds,
      recordedAt:
        typeof file.recording_start === 'string' && file.recording_start.length > 0
          ? file.recording_start
          : null,
    });
  }
  return result;
}

export const fetchMeetingRecordings = async (
  creds: ZoomCredentials,
  meetingId: string,
): Promise<{ ok: true; recordings: ZoomRecording[] } | { ok: false; error: ZoomApiError }> => {
  const t = await getAccessToken(creds);
  if ('error' in t) return { ok: false, error: t.error };

  let resp: Response;
  try {
    resp = await fetch(
      `https://api.zoom.us/v2/meetings/${encodeURIComponent(meetingId)}/recordings`,
      { headers: { Authorization: `Bearer ${t.token}` } },
    );
  } catch (e) {
    return { ok: false, error: { code: 'network', detail: (e as Error).message } };
  }

  if (resp.status === 404) return { ok: false, error: { code: 'recording_not_found' } };
  if (resp.status === 429) return { ok: false, error: { code: 'rate_limited' } };
  if (resp.status === 401) {
    return { ok: false, error: { code: 'auth_failed', detail: `${resp.status}` } };
  }
  if (!resp.ok) {
    return { ok: false, error: { code: 'network', detail: `${resp.status}` } };
  }

  const body: unknown = await resp.json();
  return { ok: true, recordings: mapZoomRecordings(body) };
};
