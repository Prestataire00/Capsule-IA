import { describe, it, expect } from 'vitest';
import { parseEventResponse, parseEventsList, parseCalendarIds, mergeEvents, type CalEvent } from './google-calendar-client';

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

describe('parseEventsList', () => {
  it('normalise un événement horaire (dateTime)', () => {
    const out = parseEventsList({
      items: [
        {
          id: 'e1',
          summary: 'Session distancielle',
          status: 'confirmed',
          start: { dateTime: '2026-07-01T09:00:00+02:00' },
          end: { dateTime: '2026-07-01T11:00:00+02:00' },
          hangoutLink: 'https://meet.google.com/abc',
          htmlLink: 'https://calendar.google.com/e1',
          location: 'Paris',
        },
      ],
    });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      id: 'e1',
      title: 'Session distancielle',
      allDay: false,
      hangoutLink: 'https://meet.google.com/abc',
      location: 'Paris',
    });
  });

  it('détecte les événements journée entière (date) et titre par défaut', () => {
    const out = parseEventsList({ items: [{ id: 'e2', start: { date: '2026-07-02' }, end: { date: '2026-07-03' } }] });
    expect(out[0]).toMatchObject({ id: 'e2', allDay: true, title: '(Sans titre)', start: '2026-07-02' });
  });

  it('ignore annulés / invalides, trie par début, et gère une entrée vide', () => {
    expect(parseEventsList(null)).toEqual([]);
    expect(parseEventsList({})).toEqual([]);
    const out = parseEventsList({
      items: [
        { id: 'late', start: { dateTime: '2026-07-05T10:00:00Z' } },
        { id: 'cancelled', status: 'cancelled', start: { dateTime: '2026-07-04T10:00:00Z' } },
        { id: 'nostart', summary: 'x' },
        { id: 'early', start: { dateTime: '2026-07-03T10:00:00Z' } },
      ],
    });
    expect(out.map((e) => e.id)).toEqual(['early', 'late']);
  });
});

describe('parseCalendarIds', () => {
  it('extrait les ids de calendarList, ignore le bruit', () => {
    expect(parseCalendarIds({ items: [{ id: 'primary' }, { id: 'work@group.calendar.google.com' }, { foo: 1 }] })).toEqual([
      'primary',
      'work@group.calendar.google.com',
    ]);
    expect(parseCalendarIds(null)).toEqual([]);
    expect(parseCalendarIds({})).toEqual([]);
  });
});

describe('mergeEvents', () => {
  it('fusionne, dédoublonne par id et trie par début', () => {
    const a: CalEvent[] = [
      { id: 'x', title: 'A', start: '2026-07-05T10:00:00Z', end: null, allDay: false, location: null, htmlLink: null, hangoutLink: null },
      { id: 'y', title: 'B', start: '2026-07-03T10:00:00Z', end: null, allDay: false, location: null, htmlLink: null, hangoutLink: null },
    ];
    const b: CalEvent[] = [
      { id: 'x', title: 'A-dup', start: '2026-07-05T10:00:00Z', end: null, allDay: false, location: null, htmlLink: null, hangoutLink: null },
      { id: 'z', title: 'C', start: '2026-07-04T10:00:00Z', end: null, allDay: false, location: null, htmlLink: null, hangoutLink: null },
    ];
    expect(mergeEvents([a, b]).map((e) => e.id)).toEqual(['y', 'z', 'x']);
  });
});
