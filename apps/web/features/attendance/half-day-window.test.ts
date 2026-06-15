import { describe, it, expect } from 'vitest';
import { halfDayWindow, overlapMinutes, parisMiddayBoundary } from './half-day-window';

// Session 9h-17h heure de Paris (mars : CET = UTC+1)
const start = new Date('2026-03-02T08:00:00Z'); // 09:00 Paris
const end = new Date('2026-03-02T16:00:00Z'); // 17:00 Paris

describe('parisMiddayBoundary', () => {
  it('renvoie 13:00 Paris (12:00 UTC en mars)', () => {
    const b = parisMiddayBoundary(start);
    expect(b.toISOString()).toBe('2026-03-02T12:00:00.000Z');
  });
});

describe('halfDayWindow', () => {
  it('matin = [début, 13:00]', () => {
    const w = halfDayWindow(start, end, 'morning');
    expect(w.start.toISOString()).toBe('2026-03-02T08:00:00.000Z');
    expect(w.end.toISOString()).toBe('2026-03-02T12:00:00.000Z');
  });
  it('après-midi = [13:00, fin]', () => {
    const w = halfDayWindow(start, end, 'afternoon');
    expect(w.start.toISOString()).toBe('2026-03-02T12:00:00.000Z');
    expect(w.end.toISOString()).toBe('2026-03-02T16:00:00.000Z');
  });
  it('full = toute la session', () => {
    const w = halfDayWindow(start, end, 'full');
    expect(w.start.getTime()).toBe(start.getTime());
    expect(w.end.getTime()).toBe(end.getTime());
  });
  it('session après-midi seule : fenêtre matin vide (end <= start → overlap 0)', () => {
    const s = new Date('2026-03-02T13:00:00Z'); // 14:00 Paris
    const e = new Date('2026-03-02T16:00:00Z');
    const w = halfDayWindow(s, e, 'morning');
    expect(w.end.getTime()).toBeLessThanOrEqual(w.start.getTime()); // fenêtre dégénérée → aucune présence matin
    expect(overlapMinutes(s, e, w.start, w.end)).toBe(0);
  });
});

describe('overlapMinutes', () => {
  it('présence 9h-12h chevauche le matin (180 min) mais pas l’après-midi', () => {
    const join = new Date('2026-03-02T08:00:00Z'); // 9h
    const leave = new Date('2026-03-02T11:00:00Z'); // 12h
    const am = halfDayWindow(start, end, 'morning');
    const pm = halfDayWindow(start, end, 'afternoon');
    expect(overlapMinutes(join, leave, am.start, am.end)).toBe(180);
    expect(overlapMinutes(join, leave, pm.start, pm.end)).toBe(0);
  });
  it('présence journée entière chevauche les deux', () => {
    const am = halfDayWindow(start, end, 'morning');
    const pm = halfDayWindow(start, end, 'afternoon');
    expect(overlapMinutes(start, end, am.start, am.end)).toBe(240);
    expect(overlapMinutes(start, end, pm.start, pm.end)).toBe(240);
  });
  it('disjoint → 0', () => {
    const j = new Date('2026-03-02T20:00:00Z');
    const l = new Date('2026-03-02T21:00:00Z');
    expect(overlapMinutes(j, l, start, end)).toBe(0);
  });
});
