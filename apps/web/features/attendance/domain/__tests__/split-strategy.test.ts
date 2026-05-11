import { describe, it, expect } from 'vitest';
import { materializeSheets } from '../materialize';

const PARIS = 'Europe/Paris';

describe('materializeSheets', () => {
  it('auto: 9h-12h30 Paris → 1 morning', () => {
    const r = materializeSheets({
      sessionStartsAt: new Date('2026-09-15T07:00:00Z'),
      sessionEndsAt: new Date('2026-09-15T10:30:00Z'),
      organizationTimezone: PARIS,
      strategy: 'auto',
    });
    expect(r).toHaveLength(1);
    expect(r[0]?.halfDay).toBe('morning');
  });

  it('auto: 9h-17h Paris → morning + afternoon', () => {
    const r = materializeSheets({
      sessionStartsAt: new Date('2026-09-15T07:00:00Z'),
      sessionEndsAt: new Date('2026-09-15T15:00:00Z'),
      organizationTimezone: PARIS,
      strategy: 'auto',
    });
    expect(r).toHaveLength(2);
    expect(r.map((x) => x.halfDay)).toEqual(['morning', 'afternoon']);
  });

  it('auto: 14h-17h Paris → 1 afternoon', () => {
    const r = materializeSheets({
      sessionStartsAt: new Date('2026-09-15T12:00:00Z'),
      sessionEndsAt: new Date('2026-09-15T15:00:00Z'),
      organizationTimezone: PARIS,
      strategy: 'auto',
    });
    expect(r).toHaveLength(1);
    expect(r[0]?.halfDay).toBe('afternoon');
  });

  it('auto: 18h30-21h Paris → 1 evening', () => {
    const r = materializeSheets({
      sessionStartsAt: new Date('2026-09-15T16:30:00Z'),
      sessionEndsAt: new Date('2026-09-15T19:00:00Z'),
      organizationTimezone: PARIS,
      strategy: 'auto',
    });
    expect(r).toHaveLength(1);
    expect(r[0]?.halfDay).toBe('evening');
  });

  it('per_day: 2 jours → 2 sheets full', () => {
    const r = materializeSheets({
      sessionStartsAt: new Date('2026-09-15T07:00:00Z'),
      sessionEndsAt: new Date('2026-09-16T15:00:00Z'),
      organizationTimezone: PARIS,
      strategy: 'per_day',
    });
    expect(r).toHaveLength(2);
    expect(r.every((x) => x.halfDay === 'full')).toBe(true);
  });

  it('manual: empty result', () => {
    const r = materializeSheets({
      sessionStartsAt: new Date('2026-09-15T07:00:00Z'),
      sessionEndsAt: new Date('2026-09-15T15:00:00Z'),
      organizationTimezone: PARIS,
      strategy: 'manual',
    });
    expect(r).toEqual([]);
  });
});
