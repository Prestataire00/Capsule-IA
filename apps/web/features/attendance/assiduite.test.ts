import { describe, it, expect } from 'vitest';
import { computeAssiduite, type SessionDuration } from './assiduite';

describe('computeAssiduite', () => {
  it('retourne 0/0 sans session', () => {
    expect(computeAssiduite([])).toEqual({ heuresSignees: 0, heuresPlanifiees: 0, taux: 0 });
  });

  it('somme les heures planifiées et signées', () => {
    const sessions: SessionDuration[] = [
      { durationHours: 3.5, signed: true },
      { durationHours: 3.5, signed: true },
      { durationHours: 3.5, signed: false },
    ];
    expect(computeAssiduite(sessions)).toEqual({ heuresSignees: 7, heuresPlanifiees: 10.5, taux: 2 / 3 });
  });

  it('ignore les durées nulles ou négatives côté planifié', () => {
    const sessions: SessionDuration[] = [
      { durationHours: 0, signed: true },
      { durationHours: 2, signed: true },
    ];
    expect(computeAssiduite(sessions)).toEqual({ heuresSignees: 2, heuresPlanifiees: 2, taux: 1 });
  });
});
