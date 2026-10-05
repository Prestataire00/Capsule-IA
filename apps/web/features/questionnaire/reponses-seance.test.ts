import { describe, expect, it } from 'vitest';
import { syntheseDesReponses, valeurLisible } from './reponses-seance';
import type { Question } from './schema';

const QUESTIONS: Question[] = [
  { id: 'currentLevel', type: 'rating', label: 'Niveau', required: true, max: 5 },
  { id: 'deja_ia', type: 'choice', label: 'Déjà utilisé une IA ?', required: false, options: ['Oui', 'Non'] },
  { id: 'nps', type: 'nps', label: 'Recommandation', required: false },
  { id: 'objectives', type: 'text', label: 'Objectifs', required: true },
];

describe('réponses d’une évaluation de séance', () => {
  it('lit chaque réponse sur son échelle', () => {
    expect(valeurLisible(QUESTIONS[0]!, 3)).toBe('Intermédiaire');
    expect(valeurLisible(QUESTIONS[2]!, 9)).toBe('9 / 10');
    expect(valeurLisible(QUESTIONS[1]!, 'Oui')).toBe('Oui');
    expect(valeurLisible(QUESTIONS[3]!, '')).toBeNull();
  });

  it('résume une question sur tous les répondants', () => {
    const s = syntheseDesReponses(QUESTIONS, [
      { currentLevel: 2, deja_ia: 'Oui', nps: 8, objectives: 'a' },
      { currentLevel: 5, deja_ia: 'Oui', nps: 10 },
      { currentLevel: 3, deja_ia: 'Non' },
    ]);
    expect(s.get('currentLevel')).toBe('Moyenne 3,3 / 5');
    expect(s.get('deja_ia')).toBe('Oui 2 · Non 1');
    expect(s.get('nps')).toBe('Moyenne 9 / 10');
    expect(s.get('objectives')).toBe('1 réponse');
  });
});
