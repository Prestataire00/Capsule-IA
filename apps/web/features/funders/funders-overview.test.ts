import { describe, it, expect } from 'vitest';
import { countByKind, formatEurosCents } from './funders-overview';

describe('countByKind', () => {
  it('compte les financeurs par type', () => {
    expect(countByKind(['opco', 'cpf', 'opco', 'entreprise'])).toEqual({ opco: 2, cpf: 1, entreprise: 1 });
  });
  it('renvoie un objet vide pour une liste vide', () => {
    expect(countByKind([])).toEqual({});
  });
});

describe('formatEurosCents', () => {
  it('formate des centimes en euros FR', () => {
    expect(formatEurosCents(123456)).toContain('234'); // 1 234,56 €
    expect(formatEurosCents(0)).toContain('0');
  });
});
