// Le SIREN du client devient une mention obligatoire de la facture électronique
// (réforme du 1er septembre 2026). Un numéro faux ne se voit qu'au rejet de la
// facture, donc à l'impayé : la clé se contrôle à la saisie.
import { describe, it, expect } from 'vitest';
import {
  normaliserSiret,
  siretValide,
  sirenValide,
  sirenDeSiret,
  formaterSiren,
  formaterSiret,
} from '@/shared/lib/siret';

describe('SIRET', () => {
  it('accepte un numéro réel, collé avec ses espaces', () => {
    // SIRET de la DGFiP (SIREN 110 020 013).
    expect(siretValide('11002001300019')).toBe(true);
    expect(siretValide('110 020 013 00019')).toBe(true);
  });

  it('refuse un numéro dont la clé ne tombe pas juste', () => {
    expect(siretValide('11002001300018')).toBe(false);
    expect(siretValide('12345678900012')).toBe(false);
  });

  it('refuse ce qui n’a pas quatorze chiffres', () => {
    expect(siretValide('110020013')).toBe(false);
    expect(siretValide('')).toBe(false);
    expect(siretValide('1100200130001999')).toBe(false);
  });

  it('laisse passer La Poste, qui échappe à la clé de Luhn', () => {
    // Somme des chiffres multiple de 5, comme l'exige la règle dérogatoire.
    expect(siretValide('35600000000001')).toBe(true);
    expect(siretValide('35600000000002')).toBe(false);
  });
});

describe('SIREN', () => {
  it('valide un SIREN à neuf chiffres', () => {
    expect(sirenValide('110020013')).toBe(true);
    expect(sirenValide('110020014')).toBe(false);
  });

  it('se déduit des neuf premiers chiffres du SIRET', () => {
    expect(sirenDeSiret('110 020 013 00019')).toBe('110020013');
    expect(sirenDeSiret('1234')).toBeNull();
    expect(sirenDeSiret(null)).toBeNull();
  });
});

describe('mise en forme', () => {
  it('groupe les chiffres pour la lecture', () => {
    expect(formaterSiren('110020013')).toBe('110 020 013');
    expect(formaterSiret('11002001300019')).toBe('110 020 013 00019');
  });

  it('ne met rien en forme si la longueur ne convient pas', () => {
    expect(formaterSiren('1100200')).toBeNull();
    expect(formaterSiret('110020013')).toBeNull();
  });

  it('normalise en ne gardant que les chiffres', () => {
    expect(normaliserSiret(' 110.020-013 ')).toBe('110020013');
  });
});
