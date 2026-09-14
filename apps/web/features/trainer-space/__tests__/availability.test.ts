import { describe, it, expect } from 'vitest';
import {
  creneauxPourHeures,
  statutPourCreneaux,
  statutDuJour,
  creneauxRemplaces,
  isCreneau,
  isDispo,
  type Declaration,
} from '../availability';

describe('créneaux occupés par une séance', () => {
  it('range une matinée le matin, une après-midi l’après-midi', () => {
    expect(creneauxPourHeures(9, 12)).toEqual(['matin']);
    expect(creneauxPourHeures(14, 17)).toEqual(['apres_midi']);
  });

  it('couvre les deux demi-journées quand la séance enjambe midi', () => {
    expect(creneauxPourHeures(9, 17)).toEqual(['matin', 'apres_midi']);
  });

  it('ne fait pas déborder une séance qui s’arrête à la frontière', () => {
    expect(creneauxPourHeures(9, 13)).toEqual(['matin']);
  });

  it('ne renvoie jamais une liste vide, même sur des heures aberrantes', () => {
    expect(creneauxPourHeures(13, 13)).toEqual(['matin']);
  });
});

describe('statut d’un formateur', () => {
  it('ne promet rien tant que rien n’est déclaré', () => {
    expect(statutPourCreneaux([], ['matin'])).toBe('non_renseigne');
  });

  it('suit la déclaration de la demi-journée', () => {
    const d: Declaration[] = [{ creneau: 'matin', kind: 'disponible' }];
    expect(statutPourCreneaux(d, ['matin'])).toBe('disponible');
    expect(statutPourCreneaux(d, ['apres_midi'])).toBe('non_renseigne');
  });

  it('étend une déclaration « journée » aux deux demi-journées', () => {
    const d: Declaration[] = [{ creneau: 'journee', kind: 'indisponible' }];
    expect(statutPourCreneaux(d, ['matin'])).toBe('indisponible');
    expect(statutDuJour(d)).toBe('indisponible');
  });

  it('laisse la demi-journée précise l’emporter sur la journée', () => {
    const d: Declaration[] = [
      { creneau: 'journee', kind: 'disponible' },
      { creneau: 'apres_midi', kind: 'indisponible' },
    ];
    expect(statutPourCreneaux(d, ['apres_midi'])).toBe('indisponible');
    expect(statutPourCreneaux(d, ['matin'])).toBe('disponible');
  });

  it('bloque dès qu’un seul créneau nécessaire est pris', () => {
    const d: Declaration[] = [
      { creneau: 'matin', kind: 'indisponible' },
      { creneau: 'apres_midi', kind: 'disponible' },
    ];
    expect(statutPourCreneaux(d, ['matin', 'apres_midi'])).toBe('indisponible');
  });

  it('signale une disponibilité incomplète plutôt que de l’arrondir', () => {
    const d: Declaration[] = [{ creneau: 'matin', kind: 'disponible' }];
    expect(statutPourCreneaux(d, ['matin', 'apres_midi'])).toBe('partiel');
  });
});

describe('remplacement des déclarations', () => {
  it('une journée efface les demi-journées', () => {
    expect(creneauxRemplaces('journee').sort()).toEqual(['apres_midi', 'journee', 'matin']);
  });

  it('une demi-journée efface la journée et elle-même', () => {
    expect(creneauxRemplaces('matin').sort()).toEqual(['journee', 'matin']);
  });
});

describe('valeurs venues de la base', () => {
  it('rejette ce qui n’est pas un créneau ou une disponibilité connus', () => {
    expect(isCreneau('matin')).toBe(true);
    expect(isCreneau('soir')).toBe(false);
    expect(isDispo('indisponible')).toBe(true);
    expect(isDispo('peut-etre')).toBe(false);
  });
});
