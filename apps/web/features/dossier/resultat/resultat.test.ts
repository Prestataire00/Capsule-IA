import { describe, expect, it } from 'vitest';
import { resultatDe } from './resultat';

describe('résultat d’un apprenant', () => {
  it('lit réussite ou échec, rien sinon', () => {
    const r = { a: 'reussite', b: 'echec', c: 'bof' };
    expect(resultatDe(r, 'a')).toBe('reussite');
    expect(resultatDe(r, 'b')).toBe('echec');
    expect(resultatDe(r, 'c')).toBeNull();
    expect(resultatDe(r, 'z')).toBeNull();
    expect(resultatDe(null, 'a')).toBeNull();
  });
});
