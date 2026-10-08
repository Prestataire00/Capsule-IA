import { describe, expect, it } from 'vitest';
import { statistiquesDesReponses } from './reponses-seance';

describe('statistiques des réponses', () => {
  const questions = [
    { id: 'note', type: 'rating' as const, label: 'Note', required: true, max: 5 },
    { id: 'reco', type: 'nps' as const, label: 'Reco', required: true },
    { id: 'rythme', type: 'choice' as const, label: 'Rythme', required: true, options: ['Lent', 'Adapté'] },
    { id: 'libre', type: 'text' as const, label: 'Libre', required: false },
  ];
  it('moyennes, répartition et commentaires', () => {
    const s = statistiquesDesReponses(questions, [
      { note: 4, reco: 9, rythme: 'Adapté', libre: 'Top' },
      { note: 5, reco: 8, rythme: 'Adapté' },
      { note: 3, reco: 10, rythme: 'Lent', libre: '' },
    ]);
    expect(s[0]).toMatchObject({ genre: 'note', moyenne: 4, max: 5, n: 3 });
    expect(s[1]).toMatchObject({ genre: 'note', moyenne: 9, max: 10 });
    expect(s[2]).toMatchObject({ genre: 'choix', repartition: [['Adapté', 2], ['Lent', 1]] });
    expect(s[3]).toMatchObject({ genre: 'texte', n: 1 });
  });
});
