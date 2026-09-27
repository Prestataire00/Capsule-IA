import { describe, it, expect } from 'vitest';
import { estDu, jourEnvoi, libelleMoment, lireCleMoment, cleMoment, momentParDefaut, MOMENTS } from './programmation-seance';

const seance = { startsAt: '2026-10-12T07:00:00Z', endsAt: '2026-10-14T15:00:00Z' };

describe('moment d’envoi d’un questionnaire de séance', () => {
  it('se lit comme on le pense', () => {
    expect(libelleMoment({ ancre: 'debut', decalage: -7 })).toBe('J-7 début');
    expect(libelleMoment({ ancre: 'fin', decalage: 1 })).toBe('J+1 fin');
    expect(libelleMoment({ ancre: 'debut', decalage: 0 })).toBe('Jour du début');
    expect(libelleMoment({ ancre: 'fin', decalage: 0 })).toBe('Jour de la fin');
  });

  it('se compte depuis le début ou la fin de la séance', () => {
    expect(jourEnvoi(seance, { ancre: 'debut', decalage: -7 })).toBe('2026-10-05');
    expect(jourEnvoi(seance, { ancre: 'fin', decalage: 21 })).toBe('2026-11-04');
  });

  it('prend le jour de Paris, pas celui du serveur', () => {
    // 23h30 UTC le 11 = 01h30 à Paris le 12.
    expect(jourEnvoi({ startsAt: '2026-10-11T23:30:00Z', endsAt: '2026-10-12T08:00:00Z' }, { ancre: 'debut', decalage: 0 })).toBe('2026-10-12');
  });

  it('part le jour dit, et rattrape un jour passé', () => {
    const m = { ancre: 'debut' as const, decalage: -7 };
    expect(estDu(seance, m, new Date('2026-10-04T10:00:00Z'))).toBe(false);
    expect(estDu(seance, m, new Date('2026-10-05T06:00:00Z'))).toBe(true);
    expect(estDu(seance, m, new Date('2026-10-20T06:00:00Z'))).toBe(true);
  });

  it('propose le moment de l’étape du modèle', () => {
    expect(momentParDefaut({ kind: 'positionnement' })).toEqual({ ancre: 'debut', decalage: -7 });
    expect(momentParDefaut({ kind: 'satisfaction_chaud' })).toEqual({ ancre: 'fin', decalage: 1 });
    expect(momentParDefaut({ kind: 'satisfaction_froid' })).toEqual({ ancre: 'fin', decalage: 90 });
    expect(momentParDefaut({ kind: 'custom' })).toEqual({ ancre: 'debut', decalage: 0 });
  });

  it('refuse une clé fabriquée', () => {
    for (const m of MOMENTS) expect(lireCleMoment(cleMoment(m))).toEqual(m);
    expect(lireCleMoment('milieu:3')).toBeNull();
    expect(lireCleMoment('fin:9999')).toBeNull();
  });
});
