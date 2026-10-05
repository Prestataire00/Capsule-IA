import { describe, it, expect } from 'vitest';
import { pointsOuverts, surligner } from './annotations';

describe('surligner', () => {
  it('surligne l’extrait cité, sans tenir compte de la casse', () => {
    expect(surligner('Le tableau croisé dynamique résume.', [{ extrait: 'tableau CROISÉ', couleur: 'a_revoir' }])).toEqual([
      { texte: 'Le ', couleur: null },
      { texte: 'tableau croisé', couleur: 'a_revoir' },
      { texte: ' dynamique résume.', couleur: null },
    ]);
  });

  it('ignore un extrait qui n’est plus dans le texte', () => {
    expect(surligner('Texte corrigé.', [{ extrait: 'ancienne phrase', couleur: 'a_preciser' }])).toEqual([
      { texte: 'Texte corrigé.', couleur: null },
    ]);
  });

  it('plusieurs couleurs dans l’ordre du texte, le premier posé gagne en cas de chevauchement', () => {
    expect(
      surligner('un deux trois', [
        { extrait: 'trois', couleur: 'bien' },
        { extrait: 'un', couleur: 'suggestion' },
        { extrait: 'deux trois', couleur: 'a_revoir' },
      ]),
    ).toEqual([
      { texte: 'un', couleur: 'suggestion' },
      { texte: ' deux ', couleur: null },
      { texte: 'trois', couleur: 'bien' },
    ]);
  });
});

describe('pointsOuverts', () => {
  it('compte les points à revoir ou à préciser non corrigés, pas les suggestions', () => {
    expect(
      pointsOuverts([
        { couleur: 'a_revoir', resolvedAt: null },
        { couleur: 'a_preciser', resolvedAt: null },
        { couleur: 'a_revoir', resolvedAt: '2026-10-05T10:00:00Z' },
        { couleur: 'suggestion', resolvedAt: null },
        { couleur: 'bien', resolvedAt: null },
      ]),
    ).toBe(2);
  });
});
