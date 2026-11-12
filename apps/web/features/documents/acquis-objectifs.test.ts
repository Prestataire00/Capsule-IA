import { describe, expect, it } from 'vitest';
import { acquisDesObjectifs } from './acquis-objectifs';

describe('acquis par objectif', () => {
  it('acquis par défaut, le formateur ne corrige que l’exception', () => {
    expect(acquisDesObjectifs(['Créer un TCD', 'Automatiser', ' '], { Automatiser: 'en_cours', Autre: 'non_acquis' })).toEqual([
      { objectif: 'Créer un TCD', niveau: 'acquis' },
      { objectif: 'Automatiser', niveau: 'en_cours' },
    ]);
  });
  it('une valeur inconnue retombe sur acquis', () => {
    expect(acquisDesObjectifs(['A'], { A: 'peut-être' })).toEqual([{ objectif: 'A', niveau: 'acquis' }]);
    expect(acquisDesObjectifs(['A'], null)).toEqual([{ objectif: 'A', niveau: 'acquis' }]);
  });

  it('le niveau de l’apprenant prime sur celui du dossier', () => {
    expect(acquisDesObjectifs(['A', 'B', 'C'], { A: 'en_cours', B: 'en_cours' }, { B: 'non_acquis' })).toEqual([
      { objectif: 'A', niveau: 'en_cours' },
      { objectif: 'B', niveau: 'non_acquis' },
      { objectif: 'C', niveau: 'acquis' },
    ]);
  });
});
