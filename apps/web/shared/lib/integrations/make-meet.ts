import 'server-only';
import { env } from '@/env.mjs';
import { ok, err, type Result } from '@/shared/lib/result';

// Génération du lien Google Meet d'une session via un webhook Make (qui crée
// l'évènement Google Agenda avec conférence Meet et renvoie le lien en réponse).

export type MeetRequest = {
  sessionId: string;
  title: string;
  startsAt: string; // ISO
  endsAt: string; // ISO
  organizationId: string;
  dossierReference: string;
  formationTitle: string;
  organizerEmail: string | null;
  attendeeEmails: string[];
};

export type MeetLink = { meetUrl: string; eventId: string | null };
export type MeetError = 'not_configured' | 'request_failed' | 'invalid_response';

/** Logique pure : valide la réponse JSON du webhook Make. */
export function parseMeetResponse(json: unknown): Result<MeetLink, 'invalid_response'> {
  if (!json || typeof json !== 'object') return err('invalid_response');
  const j = json as { meetUrl?: unknown; eventId?: unknown };
  if (typeof j.meetUrl !== 'string' || !/^https?:\/\//.test(j.meetUrl)) {
    return err('invalid_response');
  }
  return ok({ meetUrl: j.meetUrl, eventId: typeof j.eventId === 'string' ? j.eventId : null });
}

/**
 * Demande au scénario Make de créer le lien Meet. Renvoie une erreur gérée
 * (jamais d'exception) : si le webhook n'est pas configuré ou échoue, l'appelant
 * crée la session sans lien (à coller manuellement ensuite).
 */
export async function requestGoogleMeetLink(input: MeetRequest): Promise<Result<MeetLink, MeetError>> {
  const url = env.MAKE_SESSION_WEBHOOK_URL;
  if (!url) return err('not_configured');

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
      signal: controller.signal,
    });
    if (!res.ok) return err('request_failed');
    const json = (await res.json().catch(() => null)) as unknown;
    return parseMeetResponse(json);
  } catch {
    return err('request_failed');
  } finally {
    clearTimeout(timeout);
  }
}
