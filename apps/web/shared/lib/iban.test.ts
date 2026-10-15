import { describe, expect, it } from 'vitest';
import { bicValide, formaterIban, ibanValide, normaliserBancaire } from './iban';

describe('coordonnées bancaires', () => {
  it('accepte un IBAN dont la clé est juste, saisi avec espaces', () => {
    expect(ibanValide(normaliserBancaire('fr76 3000 6000 0112 3456 7890 189'))).toBe(true);
  });
  it('refuse une faute de frappe', () => {
    expect(ibanValide('FR7630006000011234567890188')).toBe(false);
    expect(ibanValide('FR76')).toBe(false);
  });
  it('vérifie le BIC à 8 ou 11 caractères', () => {
    expect(bicValide('QNTOFRP1XXX')).toBe(true);
    expect(bicValide('QNTOFRP1')).toBe(true);
    expect(bicValide('QNTO')).toBe(false);
  });
  it('présente l’IBAN par blocs de quatre', () => {
    expect(formaterIban('FR7630006000011234567890189')).toBe('FR76 3000 6000 0112 3456 7890 189');
  });
});
