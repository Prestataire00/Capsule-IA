import { describe, it, expect } from 'vitest';
import {
  heuresManquantes,
  heuresStagiaires,
  tauxDeRealisation,
  type FeuilleEmargement,
} from '../heures-stagiaires';

const matin = (presents: number): FeuilleEmargement => ({ demiJournee: 'morning', presents });
const aprem = (presents: number): FeuilleEmargement => ({ demiJournee: 'afternoon', presents });

describe('heures-stagiaires d’une séance', () => {
  it('compte le prévu sur les inscrits', () => {
    const h = heuresStagiaires({ dureeHeures: 7, inscrits: 5, feuilles: [] });
    expect(h.prevues).toBe(35);
  });

  it('compte le réalisé sur les PRÉSENTS, pas sur les inscrits', () => {
    // 7 h en deux demi-journées : 3,5 h chacune. 3 présents le matin,
    // 5 l'après-midi → 3×3,5 + 5×3,5 = 28 h, et non 35.
    const h = heuresStagiaires({ dureeHeures: 7, inscrits: 5, feuilles: [matin(3), aprem(5)] });
    expect(h.prevues).toBe(35);
    expect(h.realisees).toBe(28);
    expect(heuresManquantes(h)).toBe(7);
  });

  it('ne déclare rien de mesurable tant qu’aucune feuille n’existe', () => {
    // Zéro réalisé par ignorance n'est pas zéro réalisé.
    const h = heuresStagiaires({ dureeHeures: 7, inscrits: 5, feuilles: [] });
    expect(h.mesurable).toBe(false);
    expect(h.realisees).toBe(0);
    expect(heuresManquantes(h)).toBe(0);
    expect(tauxDeRealisation(h)).toBeNull();
  });

  it('fait peser une journée entière comme deux demi-journées', () => {
    const journee = heuresStagiaires({
      dureeHeures: 7,
      inscrits: 2,
      feuilles: [{ demiJournee: 'full', presents: 2 }],
    });
    expect(journee.realisees).toBe(14);
  });

  it('répartit correctement quand journée et demi-journée se mêlent', () => {
    // Poids 2 + 1 = 3 sur 9 h → 6 h pour la journée, 3 h pour le matin.
    const h = heuresStagiaires({
      dureeHeures: 9,
      inscrits: 4,
      feuilles: [{ demiJournee: 'full', presents: 4 }, matin(2)],
    });
    expect(h.realisees).toBe(4 * 6 + 2 * 3);
  });

  it('atteint le prévu quand tout le monde est là', () => {
    const h = heuresStagiaires({ dureeHeures: 7, inscrits: 4, feuilles: [matin(4), aprem(4)] });
    expect(h.realisees).toBe(h.prevues);
    expect(heuresManquantes(h)).toBe(0);
    expect(tauxDeRealisation(h)).toBe(100);
  });

  it('n’annonce jamais d’écart négatif', () => {
    // Un présent de plus que d'inscrits signale un défaut d'inscription,
    // pas une heure gagnée.
    const h = heuresStagiaires({ dureeHeures: 7, inscrits: 1, feuilles: [matin(3), aprem(3)] });
    expect(heuresManquantes(h)).toBe(0);
  });

  it('encaisse les valeurs absurdes sans produire de NaN', () => {
    const h = heuresStagiaires({ dureeHeures: -4, inscrits: -2, feuilles: [matin(-1)] });
    expect(h.prevues).toBe(0);
    expect(h.realisees).toBe(0);
    expect(Number.isNaN(h.realisees)).toBe(false);
  });

  it('arrondit au centième plutôt que de traîner des décimales', () => {
    // 5 h sur 3 demi-journées : 1,666… h chacune.
    const h = heuresStagiaires({
      dureeHeures: 5,
      inscrits: 1,
      feuilles: [matin(1), aprem(1), { demiJournee: 'evening', presents: 1 }],
    });
    expect(h.realisees).toBe(5);
  });

  it('chiffre le taux de réalisation', () => {
    const h = heuresStagiaires({ dureeHeures: 8, inscrits: 10, feuilles: [matin(5), aprem(5)] });
    expect(tauxDeRealisation(h)).toBe(50);
  });
});
