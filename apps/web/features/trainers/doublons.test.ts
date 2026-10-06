import { describe, expect, it } from 'vitest';
import { doublonsDeFormateurs, type FicheFormateur } from './doublons';

const f = (id: string, p: Partial<FicheFormateur>): FicheFormateur => ({
  id, firstName: null, lastName: null, email: null, phone: null, siret: null, aUnCompte: false, creeLe: '2026-01-01', ...p,
});

describe('doublons de formateurs', () => {
  it('même nom, accents, casse et ordre ignorés', () => {
    const g = doublonsDeFormateurs([
      f('a', { firstName: 'Ismaël', lastName: 'Le Pennec', creeLe: '2026-02-01' }),
      f('b', { firstName: 'LE PENNEC', lastName: 'Ismael', aUnCompte: true }),
      f('c', { firstName: 'Anissa', lastName: 'Fiévé' }),
    ]);
    expect(g).toHaveLength(1);
    expect(g[0]!.raison).toBe('Même nom');
    expect(g[0]!.fiches.map((x) => x.id)).toEqual(['b', 'a']); // celle qui a un compte d'abord
  });

  it('même téléphone, quel que soit le format', () => {
    const g = doublonsDeFormateurs([f('a', { firstName: 'A', lastName: 'X', phone: '06 12 34 56 78' }), f('b', { firstName: 'B', lastName: 'Y', phone: '+33612345678' })]);
    expect(g.map((x) => x.raison)).toEqual(['Même téléphone']);
  });

  it('un même couple n’apparaît qu’une fois', () => {
    const g = doublonsDeFormateurs([
      f('a', { firstName: 'Léa', lastName: 'Martin', siret: '12345678901234' }),
      f('b', { firstName: 'Lea', lastName: 'Martin', siret: '12345678901234' }),
    ]);
    expect(g).toHaveLength(1);
  });

  it('aucune ressemblance : rien', () => {
    expect(doublonsDeFormateurs([f('a', { firstName: 'Léa', lastName: 'Martin' }), f('b', { firstName: 'Paul', lastName: 'Durand' })])).toEqual([]);
  });
});
