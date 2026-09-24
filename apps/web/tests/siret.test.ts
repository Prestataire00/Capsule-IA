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
  // Numéros vérifiés le 24/09/2026 contre l'annuaire des entreprises
  // (recherche-entreprises.api.gouv.fr). L'exemple qui servait ici auparavant
  // — « SIRET de la DGFiP », 11002001300019 — n'existe pas : inventé, il
  // satisfaisait la règle fausse et masquait le défaut qu'il devait garder.
  const REELS = [
    '47971502100032', // SOLUTIONS TERRAIN
    '40305211102616', // BOULANGERIES PAUL
    '63850296300082', // BOULANGERIE NEUHAUSER
    '44284394200115', // LES BOULANGERIES WATRIN
    '84033069000024', // FRANCE METIERS
  ];

  it('accepte des numéros réels, collés avec leurs espaces', () => {
    for (const s of REELS) expect(siretValide(s), s).toBe(true);
    expect(siretValide('479 715 021 00032')).toBe(true);
  });

  it('refuse un numéro dont la clé ne tombe pas juste', () => {
    // Un chiffre changé sur chacun : le contrôle doit mordre.
    for (const s of REELS) {
      const faux = s.slice(0, 13) + String((Number(s[13]) + 1) % 10);
      expect(siretValide(faux), faux).toBe(false);
    }
    expect(siretValide('12345678900012')).toBe(false);
  });

  it('ne double jamais le chiffre-clé', () => {
    // C'était l'erreur : à quatorze chiffres, le rang pair depuis la gauche
    // tombe sur la clé, que Luhn laisse intacte. Huit SIRET réels sur dix
    // étaient refusés.
    expect(siretValide('40305211102616')).toBe(true);
  });

  it('refuse ce qui n’a pas quatorze chiffres', () => {
    expect(siretValide('479715021')).toBe(false);
    expect(siretValide('')).toBe(false);
    expect(siretValide('4797150210003299')).toBe(false);
  });

  it('laisse passer La Poste, qui échappe à la clé de Luhn', () => {
    // Somme des chiffres multiple de 5, comme l'exige la règle dérogatoire.
    expect(siretValide('35600000000001')).toBe(true);
    expect(siretValide('35600000000002')).toBe(false);
  });
});

describe('SIREN', () => {
  it('valide un SIREN à neuf chiffres', () => {
    // Le SIREN, lui, était juste : à neuf chiffres, compter depuis la droite
    // revient au rang pair depuis la gauche.
    expect(sirenValide('479715021')).toBe(true);
    expect(sirenValide('403052111')).toBe(true);
    expect(sirenValide('479715022')).toBe(false);
  });

  it('se déduit des neuf premiers chiffres du SIRET', () => {
    expect(sirenDeSiret('479 715 021 00032')).toBe('479715021');
    expect(sirenDeSiret('1234')).toBeNull();
    expect(sirenDeSiret(null)).toBeNull();
  });
});

describe('mise en forme', () => {
  it('groupe les chiffres pour la lecture', () => {
    expect(formaterSiren('479715021')).toBe('479 715 021');
    expect(formaterSiret('47971502100032')).toBe('479 715 021 00032');
  });

  it('ne met rien en forme si la longueur ne convient pas', () => {
    expect(formaterSiren('4797150')).toBeNull();
    expect(formaterSiret('479715021')).toBeNull();
  });

  it('normalise en ne gardant que les chiffres', () => {
    expect(normaliserSiret(' 479.715-021 ')).toBe('479715021');
  });
});
