import { describe, it, expect } from 'vitest';
import { nomsDeGroupes, problemeDeRepartition, repartitionEquilibree } from './repartition';

describe('répartition en groupes', () => {
  it('nomme les groupes A, B, C', () => {
    expect(nomsDeGroupes(3)).toEqual(['Groupe A', 'Groupe B', 'Groupe C']);
  });

  it('partage équitablement', () => {
    expect(repartitionEquilibree(['a', 'b', 'c', 'd', 'e'], 2)).toEqual([['a', 'b', 'c'], ['d', 'e']]);
  });

  it('accepte une répartition complète et sans doublon', () => {
    expect(
      problemeDeRepartition(
        [
          { nom: 'Groupe A', learnerIds: ['a', 'b'] },
          { nom: 'Groupe B', learnerIds: ['c'] },
        ],
        ['a', 'b', 'c'],
      ),
    ).toBeNull();
  });

  it('refuse un oubli, un doublon, un groupe vide ou un seul groupe', () => {
    const stagiaires = ['a', 'b', 'c'];
    expect(problemeDeRepartition([{ nom: 'A', learnerIds: ['a', 'b'] }, { nom: 'B', learnerIds: [] }], stagiaires)).toMatch(/vide/);
    expect(problemeDeRepartition([{ nom: 'A', learnerIds: ['a', 'b'] }, { nom: 'B', learnerIds: ['b', 'c'] }], stagiaires)).toMatch(/deux groupes/);
    expect(problemeDeRepartition([{ nom: 'A', learnerIds: ['a'] }, { nom: 'B', learnerIds: ['b'] }], stagiaires)).toMatch(/aucun groupe/);
    expect(problemeDeRepartition([{ nom: 'A', learnerIds: ['a', 'b', 'c'] }], stagiaires)).toMatch(/deux groupes/);
    expect(problemeDeRepartition([{ nom: 'A', learnerIds: ['a'] }, { nom: 'a', learnerIds: ['b', 'c'] }], stagiaires)).toMatch(/même nom/);
  });
});
