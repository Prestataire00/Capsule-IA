import { describe, expect, it } from 'vitest';
import { scorePositionnement } from './score-positionnement';
import type { Question } from './schema';

const Q: Question[] = [
  { id: 'currentLevel', type: 'rating', label: 'Niveau', required: true, max: 5 },
  { id: 'aisance', type: 'rating', label: 'Aisance', required: false, max: 4 },
  { id: 'deja_ia', type: 'choice', label: 'IA ?', required: false, options: ['Oui', 'Non'] },
];

describe('score du test de positionnement', () => {
  it('le niveau déclaré quand il existe', () => {
    expect(scorePositionnement(Q, { currentLevel: 3, aisance: 4 })).toEqual({ libelle: '3/5 · Intermédiaire', pourcentage: 60 });
  });
  it('sinon la moyenne des questions notées', () => {
    const sansNiveau = Q.filter((q) => q.id !== 'currentLevel');
    expect(scorePositionnement(sansNiveau, { aisance: 3, deja_ia: 'Oui' })).toEqual({ libelle: '75 %', pourcentage: 75 });
  });
  it('rien à noter : pas de score', () => {
    expect(scorePositionnement([Q[2]!], { deja_ia: 'Non' })).toBeNull();
    expect(scorePositionnement(Q, null)).toBeNull();
  });
  it('ignore une note hors échelle', () => {
    expect(scorePositionnement(Q, { currentLevel: 9 })).toBeNull();
  });
});
