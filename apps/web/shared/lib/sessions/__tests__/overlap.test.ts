import { describe, it, expect } from 'vitest';
import { hasOverlap, type TimeRange } from '../overlap';

const r = (s: string, e: string): TimeRange => ({ startsAt: new Date(s), endsAt: new Date(e) });

describe('hasOverlap', () => {
  it('détecte un chevauchement', () => {
    expect(
      hasOverlap(r('2026-07-20T09:00Z', '2026-07-20T12:00Z'), [
        r('2026-07-20T11:00Z', '2026-07-20T13:00Z'),
      ]),
    ).toBe(true);
  });

  it('pas de chevauchement si adjacent (bornes exclusives)', () => {
    expect(
      hasOverlap(r('2026-07-20T09:00Z', '2026-07-20T12:00Z'), [
        r('2026-07-20T12:00Z', '2026-07-20T13:00Z'),
      ]),
    ).toBe(false);
  });

  it('détecte un créneau englobant', () => {
    expect(
      hasOverlap(r('2026-07-20T10:00Z', '2026-07-20T11:00Z'), [
        r('2026-07-20T08:00Z', '2026-07-20T17:00Z'),
      ]),
    ).toBe(true);
  });

  it('ignore une liste vide', () => {
    expect(hasOverlap(r('2026-07-20T09:00Z', '2026-07-20T12:00Z'), [])).toBe(false);
  });

  it('aucun chevauchement sur des jours différents', () => {
    expect(
      hasOverlap(r('2026-07-20T09:00Z', '2026-07-20T12:00Z'), [
        r('2026-07-21T09:00Z', '2026-07-21T12:00Z'),
      ]),
    ).toBe(false);
  });
});
