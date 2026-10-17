import { describe, expect, it } from 'vitest';
import { codeTestPositionnement, lireTestGenere, promptTestPositionnement } from './test-positionnement-contenu';

const q = (n: number) => [
  { id: `o${n}_auto`, type: 'rating', label: `Je sais ${n}`, required: true, options: [], max: 5 },
  { id: `o${n}_situation`, type: 'choice', label: `Cas ${n}`, required: true, options: ['A', 'B', 'Je ne sais pas'], max: 5 },
];

describe('test de positionnement', () => {
  it('le prompt reprend chaque objectif et exige deux questions par objectif', () => {
    const p = promptTestPositionnement('Excel', ['Créer un TCD', 'Automatiser']);
    expect(p).toContain('1. Créer un TCD');
    expect(p).toContain('2. Automatiser');
    expect(p).toContain('Exactement DEUX questions par objectif');
  });
  it('accepte deux questions par objectif', () => {
    expect(lireTestGenere(`Voici : ${JSON.stringify({ questions: [...q(1), ...q(2)] })}`, 2)).toHaveLength(4);
  });
  it('refuse un compte de questions qui ne colle pas aux objectifs', () => {
    expect(lireTestGenere(JSON.stringify({ questions: q(1) }), 2)).toBeNull();
    expect(lireTestGenere('pas de JSON', 1)).toBeNull();
  });
  it('un code par formation', () => {
    expect(codeTestPositionnement('0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b')).toBe('test_positionnement_0190a1b2c3d47e5f8a9b0c1d2e3f4a5b');
  });
});
