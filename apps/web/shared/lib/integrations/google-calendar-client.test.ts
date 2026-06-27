import { describe, it, expect } from 'vitest';
import { parseEventResponse } from './google-calendar-client';

describe('parseEventResponse', () => {
  it('extrait hangoutLink + id', () => {
    const r = parseEventResponse({ id: 'evt_1', hangoutLink: 'https://meet.google.com/abc-defg-hij' });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toEqual({ meetUrl: 'https://meet.google.com/abc-defg-hij', eventId: 'evt_1' });
  });

  it('retombe sur conferenceData.entryPoints (video) si pas de hangoutLink', () => {
    const r = parseEventResponse({
      id: 'evt_2',
      conferenceData: { entryPoints: [{ entryPointType: 'video', uri: 'https://meet.google.com/xyz' }] },
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.meetUrl).toBe('https://meet.google.com/xyz');
  });

  it('rejette si pas de lien ou pas d’id', () => {
    expect(parseEventResponse({ id: 'e' }).ok).toBe(false);
    expect(parseEventResponse({ hangoutLink: 'https://meet.google.com/x' }).ok).toBe(false);
    expect(parseEventResponse(null).ok).toBe(false);
  });
});
