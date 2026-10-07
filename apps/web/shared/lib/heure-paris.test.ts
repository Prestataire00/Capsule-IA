import { describe, expect, it } from 'vitest';
import { heureParis, partiesParis } from './heure-paris';

describe('heure à Paris', () => {
  it('été : UTC + 2', () => {
    expect(heureParis(new Date('2026-10-08T07:00:00Z'))).toBe('09:00');
    expect(partiesParis(new Date('2026-10-08T10:30:00Z'))).toMatchObject({ heure: 12, minute: 30, jour: 8, mois: 10, jourSemaine: 3 });
  });
  it('hiver : UTC + 1', () => {
    expect(heureParis(new Date('2026-12-08T08:00:00Z'))).toBe('09:00');
  });
  it('le jour change à minuit à Paris, pas à minuit UTC', () => {
    expect(partiesParis(new Date('2026-10-11T22:30:00Z'))).toMatchObject({ jour: 12, jourSemaine: 0, heure: 0 });
  });
});
