import { describe, it, expect } from 'vitest';
import { parseMeetResponse } from './make-meet';

describe('parseMeetResponse', () => {
  it('accepte une réponse valide avec meetUrl + eventId', () => {
    const r = parseMeetResponse({ meetUrl: 'https://meet.google.com/abc-defg-hij', eventId: 'evt_1' });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toEqual({ meetUrl: 'https://meet.google.com/abc-defg-hij', eventId: 'evt_1' });
  });

  it('tolère un eventId absent (null)', () => {
    const r = parseMeetResponse({ meetUrl: 'https://meet.google.com/x' });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.eventId).toBeNull();
  });

  it('rejette une URL absente ou non http(s)', () => {
    expect(parseMeetResponse({ eventId: 'e' }).ok).toBe(false);
    expect(parseMeetResponse({ meetUrl: 'meet.google.com/x' }).ok).toBe(false);
    expect(parseMeetResponse({ meetUrl: 123 }).ok).toBe(false);
  });

  it('rejette une réponse non-objet', () => {
    expect(parseMeetResponse(null).ok).toBe(false);
    expect(parseMeetResponse('oops').ok).toBe(false);
  });
});
