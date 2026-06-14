import { describe, it, expect } from 'vitest';
import { MODALITIES, derivePrimaryModality, ModalitiesSchema } from './modality-set';

describe('MODALITIES', () => {
  it('contient les 4 valeurs de l\'enum', () => {
    expect(MODALITIES).toEqual(['presentiel', 'distanciel', 'hybride', 'afest']);
  });
});

describe('derivePrimaryModality', () => {
  it('renvoie la première modalité (primaire)', () => {
    expect(derivePrimaryModality(['distanciel', 'presentiel'])).toBe('distanciel');
  });
  it('jette si l\'ensemble est vide', () => {
    expect(() => derivePrimaryModality([])).toThrow();
  });
});

describe('ModalitiesSchema', () => {
  it('accepte 1 à 4 modalités valides', () => {
    expect(ModalitiesSchema.safeParse(['presentiel']).success).toBe(true);
    expect(ModalitiesSchema.safeParse(['presentiel', 'afest']).success).toBe(true);
  });
  it('rejette un ensemble vide', () => {
    expect(ModalitiesSchema.safeParse([]).success).toBe(false);
  });
  it('rejette une valeur inconnue', () => {
    expect(ModalitiesSchema.safeParse(['mixte']).success).toBe(false);
  });
});
