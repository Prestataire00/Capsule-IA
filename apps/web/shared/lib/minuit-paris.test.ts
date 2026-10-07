import { describe, expect, it } from 'vitest';
import { minuitParis } from './heure-paris';

describe('minuit à Paris', () => {
  it('heure d’été : 22:00 UTC la veille', () => expect(minuitParis('2026-10-07').toISOString()).toBe('2026-10-06T22:00:00.000Z'));
  it('heure d’hiver : 23:00 UTC la veille', () => expect(minuitParis('2026-11-02').toISOString()).toBe('2026-11-01T23:00:00.000Z'));
});
