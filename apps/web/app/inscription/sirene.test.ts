import { describe, it, expect } from 'vitest';
import { headcountRangeToNumber } from './sirene';

describe('headcountRangeToNumber', () => {
  it('mappe les codes de tranche connus vers un effectif représentatif', () => {
    expect(headcountRangeToNumber('11')).toBe(14); // 10 à 19
    expect(headcountRangeToNumber('22')).toBe(149); // 100 à 199
    expect(headcountRangeToNumber('53')).toBe(10000); // 10000 et plus
    expect(headcountRangeToNumber('00')).toBe(0); // 0 salarié
  });

  it('tolère les espaces', () => {
    expect(headcountRangeToNumber(' 12 ')).toBe(34);
  });

  it('renvoie undefined pour null / vide / code inconnu', () => {
    expect(headcountRangeToNumber(null)).toBeUndefined();
    expect(headcountRangeToNumber(undefined)).toBeUndefined();
    expect(headcountRangeToNumber('')).toBeUndefined();
    expect(headcountRangeToNumber('99')).toBeUndefined();
  });
});
